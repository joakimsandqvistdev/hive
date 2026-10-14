import { API_BASE } from "./auth";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Applies the app's cookie-authenticated API defaults while preserving caller options. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: init.credentials ?? "include" });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}
