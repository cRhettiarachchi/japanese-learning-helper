export async function request<T = any>(
  url: string,
  options: { method?: string; csrf?: string | null; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers:
      options.body !== undefined
        ? {
            "Content-Type": "application/json",
            "X-CSRF-Token": options.csrf || "",
          }
        : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("Sign in is required.");
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(Error(data.error || "Request failed"), {
      status: response.status,
    });
  return data;
}
export function safeStorage(): Storage {
  try {
    return localStorage;
  } catch {
    return {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw Error("Browser storage unavailable");
      },
      removeItem: () => {},
      clear: () => {},
    };
  }
}
