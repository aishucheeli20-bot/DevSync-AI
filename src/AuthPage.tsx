import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, GitFork, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { login, signup, type AuthUser } from './api'

type AuthMode = 'login' | 'signup'

export default function AuthPage({ mode, onNavigate, onAuthenticated }: {
  mode: AuthMode
  onNavigate: (path: string) => void
  onAuthenticated: (user: AuthUser) => void
}) {
  const isSignup = mode === 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setFieldError('')
    if (isSignup && !name.trim()) {
      setFieldError('Enter your name to create an account.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError('Enter a valid email address.')
      return
    }
    if (password.length < (isSignup ? 8 : 1)) {
      setFieldError(isSignup ? 'Password must be at least 8 characters.' : 'Enter your password.')
      return
    }
    if (isSignup && password !== confirmPassword) {
      setFieldError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const user = isSignup
        ? await signup(name.trim(), email.trim(), password)
        : await login(email.trim(), password)
      onAuthenticated(user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication could not be completed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <button className="flex items-center gap-2.5" onClick={() => onNavigate('/')} aria-label="Go to DevSync dashboard">
          <span className="brand-mark"><GitFork size={19} /></span>
          <span className="text-[16px] font-bold tracking-tight text-slate-900">devsync<span className="text-indigo-600">.</span></span>
        </button>
        <button className="auth-demo-link" onClick={() => onNavigate('/')}><ArrowLeft size={14} />Explore demo</button>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-icon">{isSignup ? <UserRound size={21} /> : <LockKeyhole size={20} />}</div>
          <div className="mt-5 text-center">
            <div className="eyebrow">{isSignup ? 'START BUILDING WITH CONFIDENCE' : 'WELCOME BACK'}</div>
            <h1 className="mt-2 text-[25px] font-bold tracking-[-.04em] text-slate-900">{isSignup ? 'Create your account' : 'Sign in to DevSync'}</h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{isSignup ? 'Save your workspace and keep your team in sync.' : 'Pick up where you left off with your workspace.'}</p>
          </div>

          {(error || fieldError) && <div className="auth-error" role="alert">{error || fieldError}</div>}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            {isSignup && <label className="auth-field"><span>Your name</span><div className="auth-input-wrap"><UserRound size={16} /><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Your name" /></div></label>}
            <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={16} /><input autoComplete="email" inputMode="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></div></label>
            <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><LockKeyhole size={15} /><input autoComplete={isSignup ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'} /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
            {isSignup && <label className="auth-field"><span>Confirm password</span><div className="auth-input-wrap"><LockKeyhole size={15} /><input autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></div></label>}
            {!isSignup && <div className="text-right"><span className="text-[10px] text-slate-400">Demo features are available without signing in</span></div>}
            <button className="primary-button mt-2 w-full justify-center py-2.5" type="submit" disabled={submitting}>{submitting ? <LoaderCircle size={15} className="animate-spin" /> : null}{submitting ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account' : 'Login')} {!submitting && <ArrowRight size={15} />}</button>
          </form>

          <div className="auth-divider"><span>OR</span></div>
          <p className="text-center text-xs text-slate-500">{isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}<button className="font-semibold text-indigo-600 hover:text-indigo-700" onClick={() => onNavigate(isSignup ? '/login' : '/signup')}>{isSignup ? 'Login' : 'Sign up'}</button></p>
          <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-center text-[10px] leading-relaxed text-slate-500">You can explore the dashboard, sample repository, and change simulation without an account.</div>
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-400">By continuing, you agree to keep your codebase and credentials secure.</p>
      </main>
    </div>
  )
}
