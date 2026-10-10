import os
import secrets
import sqlite3

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
TEST_PASSWORD = secrets.token_urlsafe(24)


@pytest.fixture(autouse=True)
def isolated_auth_database(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEVSYNC_DB_PATH", str(tmp_path / "test-auth.sqlite3"))


def test_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_cors_allows_configured_local_frontend_and_rejects_unknown_origin() -> None:
    allowed = client.options(
        "/api/analyze",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert allowed.headers["access-control-allow-credentials"] == "true"

    rejected = client.options(
        "/api/analyze",
        headers={
            "Origin": "https://unknown.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in rejected.headers


def test_repository_includes_sample_ecommerce_files() -> None:
    response = client.get("/api/repository")
    assert response.status_code == 200
    paths = {item["path"] for item in response.json()["files"]}
    assert {
        "src/utils/calculateTotal.js",
        "src/components/Checkout.jsx",
        "src/components/Cart.jsx",
        "src/services/PaymentService.js",
    } <= paths


def test_graph_contains_dependency_edges() -> None:
    response = client.get("/api/graph")
    assert response.status_code == 200
    assert len(response.json()["nodes"]) == 4
    assert len(response.json()["edges"]) == 3


def test_change_analysis_reports_direct_and_indirect_impact() -> None:
    response = client.post("/api/analyze", json={"file": "src/utils/calculateTotal.js"})
    assert response.status_code == 200
    analysis = response.json()
    assert analysis["risk"] == "High"
    assert "src/components/Cart.jsx" in analysis["direct_dependencies"]
    assert "src/components/Checkout.jsx" in analysis["indirect_dependencies"]
    assert {item["category"] for item in analysis["tests"]} == {"Unit", "Integration", "Regression"}


def test_unknown_file_returns_helpful_not_found() -> None:
    response = client.post("/api/analyze", json={"file": "src/missing.js"})
    assert response.status_code == 404
    assert "not in the demo repository" in response.json()["detail"]


def test_public_demo_endpoints_do_not_require_login() -> None:
    assert client.get("/api/repository").status_code == 200
    assert client.get("/api/graph").status_code == 200
    response = client.post("/api/analyze", json={"file": "src/utils/calculateTotal.js"})
    assert response.status_code == 200


def test_signup_creates_hashed_account_and_session() -> None:
    response = client.post(
        "/api/auth/signup",
        json={"name": " Sample Developer ", "email": "Developer@Example.com", "password": TEST_PASSWORD},
    )
    assert response.status_code == 201
    assert response.json() == {"name": "Sample Developer", "email": "developer@example.com"}
    assert "httponly" in response.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").json() == {"name": "Sample Developer", "email": "developer@example.com"}
    with sqlite3.connect(os.environ["DEVSYNC_DB_PATH"]) as connection:
        stored_password = connection.execute("SELECT password_hash FROM users").fetchone()[0]
    assert stored_password != TEST_PASSWORD


def test_duplicate_email_is_rejected_case_insensitively() -> None:
    payload = {"name": "Sample Developer", "email": "developer@example.com", "password": TEST_PASSWORD}
    assert client.post("/api/auth/signup", json=payload).status_code == 201
    duplicate = {**payload, "name": "Another User", "email": "DEVELOPER@EXAMPLE.COM"}
    response = client.post("/api/auth/signup", json=duplicate)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_invalid_signup_inputs_return_validation_errors() -> None:
    response = client.post(
        "/api/auth/signup",
        json={"name": " ", "email": "not-an-email", "password": "short"},
    )
    assert response.status_code == 422


def test_login_rejects_invalid_credentials_and_sets_session() -> None:
    client.post(
        "/api/auth/signup",
        json={"name": "Sample Developer", "email": "developer@example.com", "password": TEST_PASSWORD},
    )
    client.post("/api/auth/logout")
    failed = client.post(
        "/api/auth/login",
        json={"email": "developer@example.com", "password": "incorrect"},
    )
    assert failed.status_code == 401
    assert failed.json()["detail"] == "Invalid email or password."

    response = client.post(
        "/api/auth/login",
        json={"email": "DEVELOPER@example.com", "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    assert client.get("/api/auth/me").json()["email"] == "developer@example.com"


def test_logout_clears_session_but_keeps_demo_public() -> None:
    client.post(
        "/api/auth/signup",
        json={"name": "Sample Developer", "email": "developer@example.com", "password": TEST_PASSWORD},
    )
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert client.get("/api/auth/me").json() is None
    assert client.get("/api/graph").status_code == 200
