type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ApiClientOptions {
  baseUrl: string;
  authToken?: string;
}

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  requiresAuth?: boolean;
}

export class ApiClient {
  private readonly baseUrl: string;
  private authToken?: string;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authToken = options.authToken;
  }

  setAuthToken(token?: string) {
    this.authToken = token;
  }

  async login(email: string, password: string) {
    const payload = await this.request<{ access_token?: string; [key: string]: unknown }>(
      'POST',
      '/auth/login',
      {
        body: { email, password },
      },
    );

    if (!payload.access_token) {
      throw new Error('Login succeeded but no access token was returned by API');
    }

    this.setAuthToken(payload.access_token);
    return payload;
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const { query, body, requiresAuth = false } = options;

    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (requiresAuth) {
      if (!this.authToken) {
        throw new Error('Authentication required. Set MCP_AUTH_TOKEN or call login first.');
      }
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    const parsed = this.parseBody(responseText);

    if (!response.ok) {
      throw new Error(
        `API request failed (${response.status} ${response.statusText}): ${this.extractErrorMessage(parsed)}`,
      );
    }

    return parsed as T;
  }

  private buildUrl(path: string, query?: Record<string, unknown>) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null) {
              url.searchParams.append(key, String(item));
            }
          }
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private parseBody(payload: string): unknown {
    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }

  private extractErrorMessage(payload: unknown): string {
    if (!payload) {
      return 'Unknown error';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload === 'object' && payload !== null) {
      const maybeMessage = (payload as { message?: unknown }).message;
      if (Array.isArray(maybeMessage)) {
        return maybeMessage.map(String).join('; ');
      }
      if (typeof maybeMessage === 'string') {
        return maybeMessage;
      }

      return JSON.stringify(payload);
    }

    return String(payload);
  }
}
