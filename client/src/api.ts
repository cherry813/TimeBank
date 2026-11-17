interface ApiErrorShape {
  error?: {
    code?: string
    message?: string
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = 'API_ERROR',
  ) {
    super(message)
  }
}

function token(): string {
  return localStorage.getItem('timebank_token') || ''
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const authToken = token()
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  const response = await fetch(`/api${path}`, { ...options, headers })
  const payload = (await response.json().catch(() => ({}))) as ApiErrorShape & { data?: T }
  if (!response.ok) {
    if (response.status === 401 && authToken) {
      window.dispatchEvent(new CustomEvent('timebank:unauthorized'))
    }
    throw new ApiError(
      payload.error?.message || `请求失败 (${response.status})`,
      response.status,
      payload.error?.code,
    )
  }
  return payload.data as T
}

export const api = {
  get<T>(path: string) {
    return request<T>(path)
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  patch<T>(path: string, body: unknown) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
  upload<T>(path: string, formData: FormData) {
    return request<T>(path, { method: 'POST', body: formData })
  },
}

export function socketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return `${configured}?token=${encodeURIComponent(token())}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token())}`
}

