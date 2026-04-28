const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T = unknown>(path: string) => req<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    req<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    req<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(path: string) => req<T>(path, { method: "DELETE" }),
};

export function downloadUrl(path: string) {
  return `${BASE}${path}`;
}
