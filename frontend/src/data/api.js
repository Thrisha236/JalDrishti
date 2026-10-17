// Small API client with demo sign-in. Tokens live in sessionStorage (per browser tab) and are
// renewed automatically if the backend restarted (it signs tokens with a per-process key).
const TOKEN_KEY = 'jalrakshak-token';

function readToken() {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}

function saveToken(value) {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: token stays in memory only */
  }
  memory = value;
}

let memory = null;

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `Request failed (${status})`);
    this.status = status;
  }
}

export async function signIn(role) {
  const res = await fetch('/api/v1/auth/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail);
  const { token, user } = await res.json();
  saveToken({ role, token, user });
  return user;
}

async function tokenFor(role) {
  const t = memory ?? readToken();
  if (t?.role === role) return t.token;
  await signIn(role);
  return memory.token;
}

/** Fetch an API path as the given role. Returns parsed JSON, or the raw Response when raw=true. */
export async function apiFetch(path, { role, method = 'GET', body, raw = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await tokenFor(role);
    const res = await fetch(`/api/v1${path}`, { method, body, headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && attempt === 0) {
      await signIn(role); // backend restarted or token expired
      continue;
    }
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail);
    return raw ? res : res.json();
  }
  throw new ApiError(401, 'Could not sign in');
}

/** Load a role-protected photo as an object URL for an <img>. Caller revokes it when done. */
export async function photoUrlFor(mediaId, role) {
  const res = await apiFetch(`/media/${encodeURIComponent(mediaId)}`, { role, raw: true });
  return URL.createObjectURL(await res.blob());
}
