const API_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export interface LoginResponse {
  success: boolean;
}

export interface ApiError {
  message?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export class ApiRequestError extends Error {
  status: number;
  data: ApiError;

  constructor(message: string, status: number, data: ApiError = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  private baseUrl = API_URL;
  private isRefreshing = false;
  private refreshFailureCount = 0;
  private refreshPromise: Promise<{ success: boolean }> | null = null;

  private async parseResponseBody<T>(response: Response): Promise<T | null> {
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  private normalizeEndpoint(endpoint: string): string {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return normalizedEndpoint.startsWith('/api/')
      ? normalizedEndpoint
      : `/api${normalizedEndpoint}`;
  }

  private shouldNeverRefresh(endpoint: string): boolean {
    return (
      endpoint === '/api/auth/login' ||
      endpoint === '/api/auth/refresh' ||
      endpoint === '/api/auth/logout' ||
      endpoint === '/api/auth/me'
    );
  }

  private isMeEndpoint(endpoint: string): boolean {
    return endpoint === '/api/auth/me';
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: object,
    isRetryAfterRefresh?: boolean,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const apiEndpoint = this.normalizeEndpoint(endpoint);
    const url = `${this.baseUrl}${apiEndpoint}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (response.status === 401 && !isRetryAfterRefresh) {
      if (this.shouldNeverRefresh(apiEndpoint)) {
        throw new ApiRequestError('Unauthorized', 401);
      }

      try {
        const refreshResult = await this.refreshWithRetry();
        if (refreshResult.success) {
          this.refreshFailureCount = 0;
          return this.request<T>(method, endpoint, body, true);
        }
      } catch {
        this.refreshFailureCount += 1;
        if (!this.isMeEndpoint(apiEndpoint) && this.refreshFailureCount >= 2) {
          this.forceLogout();
        }
      }

      throw new ApiRequestError('Unauthorized - token refresh failed', 401);
    }

    if (!response.ok) {
      const parsedError = await this.parseResponseBody<ApiError | string>(response);
      const error =
        typeof parsedError === 'string'
          ? ({ message: parsedError } as ApiError)
          : (parsedError ?? ({} as ApiError));
      throw new ApiRequestError(error.message || `HTTP ${response.status}`, response.status, error);
    }

    const data = await this.parseResponseBody<T>(response);
    this.refreshFailureCount = 0;
    return data as T;
  }

  private async refreshWithRetry(): Promise<{ success: boolean }> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Refresh failed: ${response.status}`);
        }

        return { success: true };
      } finally {
        this.isRefreshing = false;
      }
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private forceLogout() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:logout'));
      window.location.href = '/login';
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>('GET', endpoint);
  }

  post<T>(endpoint: string, body?: object) {
    return this.request<T>('POST', endpoint, body);
  }

  patch<T>(endpoint: string, body?: object) {
    return this.request<T>('PATCH', endpoint, body);
  }

  put<T>(endpoint: string, body?: object) {
    return this.request<T>('PUT', endpoint, body);
  }

  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

export const api = new ApiClient();

export const login = (email: string, password: string) =>
  api.post<LoginResponse>('/api/auth/login', { email, password });

export const refresh = () =>
  api.post<LoginResponse>('/api/auth/refresh');
