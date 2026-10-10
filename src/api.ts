import type { Analysis, GraphData, RepositoryFile } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

export interface AuthUser {
  name: string
  email: string
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error(`Could not connect to the DevSync API at ${API_BASE}. Check the API base URL and backend availability.`)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string | Array<{ msg?: string }> } | null
    const detail = Array.isArray(payload?.detail)
      ? payload.detail.map(item => item.msg).filter(Boolean).join(' ')
      : payload?.detail
    throw new ApiError(detail ?? `Request failed (${response.status}).`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const getRepository = () => request<{ name: string; branch: string; files: RepositoryFile[] }>('/api/repository')
export const getGraph = () => request<GraphData>('/api/graph')
export const analyzeChange = (file: string) =>
  request<Analysis>('/api/analyze', { method: 'POST', body: JSON.stringify({ file }) })

export const signup = (name: string, email: string, password: string) =>
  request<AuthUser>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) })
export const login = (email: string, password: string) =>
  request<AuthUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
export const logout = () => request<void>('/api/auth/logout', { method: 'POST' })
export const getCurrentUser = () => request<AuthUser | null>('/api/auth/me')
