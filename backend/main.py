from collections import deque
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Iterator, Literal

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

RiskLevel = Literal["High", "Medium", "Low"]
TestCategory = Literal["Unit", "Integration", "Regression"]

FILES = {
    "src/utils/calculateTotal.js": {
        "name": "calculateTotal.js",
        "kind": "javascript",
        "description": "Calculates cart totals, tax, and discounts",
        "dependencies": [],
        "dependents": ["src/components/Cart.jsx", "src/components/Checkout.jsx"],
    },
    "src/components/Cart.jsx": {
        "name": "Cart.jsx",
        "kind": "jsx",
        "description": "Renders cart items and subtotal",
        "dependencies": ["src/utils/calculateTotal.js"],
        "dependents": ["src/components/Checkout.jsx"],
    },
    "src/components/Checkout.jsx": {
        "name": "Checkout.jsx",
        "kind": "jsx",
        "description": "Validates cart and submits checkout",
        "dependencies": ["src/components/Cart.jsx", "src/services/PaymentService.js"],
        "dependents": [],
    },
    "src/services/PaymentService.js": {
        "name": "PaymentService.js",
        "kind": "javascript",
        "description": "Processes payment authorization and capture",
        "dependencies": [],
        "dependents": ["src/components/Checkout.jsx"],
    },
}

EDGE_LIST = [
    ("src/utils/calculateTotal.js", "src/components/Cart.jsx"),
    ("src/components/Cart.jsx", "src/components/Checkout.jsx"),
    ("src/services/PaymentService.js", "src/components/Checkout.jsx"),
]


class ChangeRequest(BaseModel):
    file: str = Field(min_length=1, max_length=256)


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required.")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address.")
        return value


class PublicUser(BaseModel):
    name: str
    email: str


class TestSuggestion(BaseModel):
    category: TestCategory
    title: str
    description: str
    priority: Literal["Required", "Recommended"]


class ChangeAnalysis(BaseModel):
    changed_file: str
    risk: RiskLevel
    risk_score: int
    summary: str
    explanation: list[str]
    direct_dependencies: list[str]
    indirect_dependencies: list[str]
    affected_files: list[str]
    tests: list[TestSuggestion]


app = FastAPI(
    title="DevSync AI API",
    description="Demo change-impact analysis for the commerce-platform sample repository.",
    version="1.0.0",
)
cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "DEVSYNC_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

SESSION_COOKIE = "devsync_session"
SESSION_DURATION = timedelta(days=7)
PASSWORD_ITERATIONS = 310_000


def _database_path() -> Path:
    configured = os.environ.get("DEVSYNC_DB_PATH")
    return Path(configured) if configured else Path(__file__).with_name("devsync.db")


def _connect_database() -> sqlite3.Connection:
    database_path = _database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
        """
    )
    return connection


@contextmanager
def _database_connection() -> Iterator[sqlite3.Connection]:
    connection = _connect_database()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _user_for_request(request: Request) -> sqlite3.Row | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    now = datetime.now(timezone.utc).isoformat()
    with _database_connection() as connection:
        return connection.execute(
            """
            SELECT users.id, users.name, users.email
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (_token_hash(token), now),
        ).fetchone()


def _set_session_cookie(response: Response, token: str) -> None:
    same_site = os.environ.get("DEVSYNC_COOKIE_SAMESITE", "lax").lower()
    if same_site not in {"lax", "strict", "none"}:
        raise ValueError("DEVSYNC_COOKIE_SAMESITE must be 'lax', 'strict', or 'none'.")
    secure = os.environ.get("DEVSYNC_COOKIE_SECURE", "").lower() == "true"
    if same_site == "none" and not secure:
        raise ValueError("DEVSYNC_COOKIE_SECURE=true is required when DEVSYNC_COOKIE_SAMESITE=none.")
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=secure,
        samesite=same_site,
        max_age=int(SESSION_DURATION.total_seconds()),
        path="/",
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "DevSync AI"}


@app.get("/api/repository")
def repository() -> dict:
    return {
        "name": "commerce-platform",
        "branch": "main",
        "files": [{"path": path, **metadata} for path, metadata in FILES.items()],
    }


@app.get("/api/graph")
def dependency_graph() -> dict:
    return {
        "nodes": [
            {
                "id": path,
                "label": path,
                "kind": item["kind"],
                "description": item["description"],
                "risk": "Medium" if "Checkout" in path else "Low",
            }
            for path, item in FILES.items()
        ],
        "edges": [{"source": source, "target": target} for source, target in EDGE_LIST],
    }


@app.post("/api/auth/signup", response_model=PublicUser, status_code=201)
def signup(data: SignupRequest, response: Response) -> PublicUser:
    salt = secrets.token_bytes(16)
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    try:
        with _database_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (name, email, password_hash, password_salt, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    data.name,
                    data.email,
                    _hash_password(data.password, salt).hex(),
                    salt.hex(),
                    now.isoformat(),
                ),
            )
            connection.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (
                    _token_hash(token),
                    cursor.lastrowid,
                    (now + SESSION_DURATION).isoformat(),
                    now.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        if "users.email" in str(error).lower() or "unique constraint" in str(error).lower():
            raise HTTPException(status_code=409, detail="An account with this email address already exists.") from error
        raise

    _set_session_cookie(response, token)
    return PublicUser(name=data.name, email=data.email)


@app.post("/api/auth/login", response_model=PublicUser)
def login(data: LoginRequest, response: Response) -> PublicUser:
    with _database_connection() as connection:
        user = connection.execute(
            "SELECT id, name, email, password_hash, password_salt FROM users WHERE email = ? COLLATE NOCASE",
            (data.email,),
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        candidate = _hash_password(data.password, bytes.fromhex(user["password_salt"])).hex()
        if not hmac.compare_digest(candidate, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        now = datetime.now(timezone.utc)
        token = secrets.token_urlsafe(32)
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (
                _token_hash(token),
                user["id"],
                (now + SESSION_DURATION).isoformat(),
                now.isoformat(),
            ),
        )
    _set_session_cookie(response, token)
    return PublicUser(name=user["name"], email=user["email"])


@app.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict[str, str]:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with _database_connection() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    response.delete_cookie(key=SESSION_COOKIE, httponly=True, samesite="lax", path="/")
    return {"status": "signed out"}


@app.get("/api/auth/me", response_model=PublicUser | None)
def current_user(request: Request) -> PublicUser | None:
    user = _user_for_request(request)
    if user is None:
        return None
    return PublicUser(name=user["name"], email=user["email"])


def _reachable(start: str) -> list[str]:
    visited: set[str] = set()
    pending = deque(FILES[start]["dependents"])
    while pending:
        current = pending.popleft()
        if current in visited:
            continue
        visited.add(current)
        pending.extend(FILES[current]["dependents"])
    return [path for path in FILES if path in visited]


def _test_plan(changed_file: str) -> list[TestSuggestion]:
    name = FILES[changed_file]["name"]
    if name == "calculateTotal.js":
        return [
            TestSuggestion(category="Unit", title="Cover totals, tax, and discount boundaries", description="Test empty carts, fractional quantities, rounding, tax, and discount combinations.", priority="Required"),
            TestSuggestion(category="Integration", title="Verify Cart and Checkout display the same total", description="Confirm the updated calculation is consistent in cart summary and checkout review.", priority="Required"),
            TestSuggestion(category="Regression", title="Run checkout pricing regression suite", description="Validate existing promotions, tax-inclusive pricing, and payment amount submission.", priority="Recommended"),
        ]
    if name == "PaymentService.js":
        return [
            TestSuggestion(category="Unit", title="Test payment authorization and failure handling", description="Cover successful capture, declined cards, network timeouts, and retry behavior.", priority="Required"),
            TestSuggestion(category="Integration", title="Verify Checkout payment submission", description="Confirm checkout forwards the correct amount and handles payment service responses.", priority="Required"),
            TestSuggestion(category="Regression", title="Run end-to-end purchase flow", description="Verify cart review, payment confirmation, and order completion still work.", priority="Recommended"),
        ]
    if name == "Cart.jsx":
        return [
            TestSuggestion(category="Unit", title="Test cart item updates and empty state", description="Cover quantity changes, item removal, empty carts, and subtotal rendering.", priority="Required"),
            TestSuggestion(category="Integration", title="Verify Cart totals flow into Checkout", description="Confirm item changes are reflected in the checkout summary and submitted amount.", priority="Required"),
            TestSuggestion(category="Regression", title="Run cart-to-purchase regression", description="Verify add, update, remove, and checkout flows across multiple items.", priority="Recommended"),
        ]
    return [
        TestSuggestion(category="Unit", title="Test checkout validation and submission states", description="Cover empty carts, invalid details, duplicate submissions, and loading/error states.", priority="Required"),
        TestSuggestion(category="Integration", title="Verify Checkout, Cart totals, and payment service", description="Confirm the displayed total matches the amount sent to payment authorization.", priority="Required"),
        TestSuggestion(category="Regression", title="Run the complete checkout purchase flow", description="Validate returning users, payment failures, and successful order confirmation.", priority="Recommended"),
    ]


@app.post("/api/analyze", response_model=ChangeAnalysis)
def analyze_change(request: ChangeRequest) -> ChangeAnalysis:
    if request.file not in FILES:
        raise HTTPException(status_code=404, detail=f"File '{request.file}' is not in the demo repository.")

    affected = _reachable(request.file)
    direct = [path for path in affected if request.file in FILES[path]["dependencies"]]
    indirect = [path for path in affected if path not in direct]
    risk: RiskLevel
    if request.file.endswith("PaymentService.js"):
        score, risk = 76, "High"
    elif request.file.endswith("calculateTotal.js"):
        score, risk = 71, "High"
    elif request.file.endswith("Cart.jsx"):
        score, risk = 54, "Medium"
    else:
        score, risk = 34, "Medium"

    name = FILES[request.file]["name"]
    if name == "calculateTotal.js":
        summary = "Shared pricing logic is used by both the cart and checkout, so calculation changes can alter displayed totals and payment amounts."
        explanation = [
            "Cart.jsx imports this utility to render the cart subtotal.",
            "Checkout.jsx also calculates the order total and sends it through the payment flow.",
            "Rounding, tax, or discount changes should be validated at both UI surfaces and against the amount charged.",
        ]
    elif name == "PaymentService.js":
        summary = "Checkout depends on this service to authorize payments. Changes can affect payment success, error handling, and order completion."
        explanation = [
            "Checkout.jsx calls this service when a customer submits an order.",
            "Payment response and failure behavior feed directly into the checkout confirmation flow.",
            "Validate declined payments, timeouts, and retry behavior to avoid duplicate or incomplete orders.",
        ]
    elif name == "Cart.jsx":
        summary = "Checkout consumes cart state and pricing information. UI or item-shape changes can alter the order summary and submitted purchase."
        explanation = [
            "Checkout.jsx reads cart contents and displays them for final review.",
            "Cart pricing is derived from calculateTotal.js, making total consistency important.",
            "Verify quantity and removal updates remain synchronized through the checkout flow.",
        ]
    else:
        summary = "Checkout orchestrates cart validation, shared pricing, and payment authorization, so changes can affect the full purchase flow."
        explanation = [
            "Checkout.jsx coordinates Cart.jsx and calculateTotal.js for the order summary.",
            "PaymentService.js is invoked for authorization and capture.",
            "Validate success and failure paths from cart review through final order confirmation.",
        ]

    return ChangeAnalysis(
        changed_file=request.file,
        risk=risk,
        risk_score=score,
        summary=summary,
        explanation=explanation,
        direct_dependencies=direct,
        indirect_dependencies=indirect,
        affected_files=affected,
        tests=_test_plan(request.file),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
