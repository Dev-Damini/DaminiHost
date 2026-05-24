// ─── DaminiHost API client ────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || "";

function getToken() {
  return localStorage.getItem("dh_token");
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  register: (name, email, password) => req("POST", "/auth/register", { name, email, password }),
  login: (email, password) => req("POST", "/auth/login", { email, password }),
  me: () => req("GET", "/auth/me"),
  save: (token) => localStorage.setItem("dh_token", token),
  clear: () => localStorage.removeItem("dh_token"),
  token: getToken,
};

// ─── Servers ──────────────────────────────────────────────────────────────────
export const servers = {
  list: () => req("GET", "/servers"),
  create: (name, startCmd, nodeVersion) => req("POST", "/servers", { name, startCmd, nodeVersion }),
  get: (id) => req("GET", `/servers/${id}`),
  update: (id, data) => req("PATCH", `/servers/${id}`, data),
  delete: (id) => req("DELETE", `/servers/${id}`),
  start: (id) => req("POST", `/servers/${id}/start`),
  stop: (id) => req("POST", `/servers/${id}/stop`),
  files: (id) => req("GET", `/servers/${id}/files`),
  deleteFile: (id, filename) => req("DELETE", `/servers/${id}/files/${filename}`),
  upload: async (id, file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/servers/${id}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
  // Returns an EventSource for real-time logs
  logs: (id) => new EventSource(`${BASE}/api/servers/${id}/logs?token=${getToken()}`),
};
