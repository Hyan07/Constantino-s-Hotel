export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function csrfToken() {
  const cookie = document.cookie.split("; ").find((entry) => entry.split("=")[0].endsWith("_csrf"));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

export function queryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) headers["X-CSRF-Token"] = csrfToken();
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      method,
      headers,
      body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Não foi possível conectar ao sistema. Confira sua internet ou o servidor.", 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const error = payload?.error || {};
    if (response.status === 401 && !path.endsWith("/login")) {
      window.location.assign("/login.html?expired=1");
    }
    throw new ApiError(error.code || "REQUEST_FAILED", error.message || "Não foi possível concluir a operação.", response.status, error.details);
  }
  return payload.data;
}

export const api = {
  get: (path, params) => request(`${path}${params ? queryString(params) : ""}`),
  post: (path, body = {}) => request(path, { method: "POST", body }),
  put: (path, body = {}) => request(path, { method: "PUT", body }),
  patch: (path, body = {}) => request(path, { method: "PATCH", body }),
  delete: (path, body = {}) => request(path, { method: "DELETE", body }),
  request,
};
