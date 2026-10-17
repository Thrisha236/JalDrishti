// Small API client. After sign-in the access token (JWT) lives in sessionStorage for this tab only;
// when it expires or the backend restarts with a new key, the app asks the user to sign in again.
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
    super(typeof detail === 'string' ? detail : (detail?.message ?? `Request failed (${status})`));
    this.status = status;
    this.problems = Array.isArray(detail?.problems) ? detail.problems : null; // validation details, if any
  }
}

// Called when the API says the session is missing or expired (the app returns to the sign-in screen).
const authListeners = new Set();
export function onAuthRequired(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

/** Sign in with username and password; keeps the access token (JWT) for this browser tab only. */
export async function login(username, password) {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail);
  const { access_token: token, user } = await res.json();
  saveToken({ role: user.role, token, user });
  return user;
}

export function signOut() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  memory = null;
}

function tokenFor(role) {
  const t = memory ?? readToken();
  if (t?.role === role) return t.token;
  authListeners.forEach((l) => l());
  throw new ApiError(401, `Please sign in as ${role}`);
}

/** Fetch an API path as the given role. Returns parsed JSON, or the raw Response when raw=true.
 *  Pass json: true when body is a JSON string (FormData bodies set their own content type). */
export async function apiFetch(path, { role, method = 'GET', body, raw = false, json = false } = {}) {
  const token = tokenFor(role);
  const headers = { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(`/api/v1${path}`, { method, body, headers });
  if (res.status === 401) {
    signOut(); // expired, or the backend restarted with a new signing key
    authListeners.forEach((l) => l());
  }
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail);
  return raw ? res : res.json();
}

/** GET a public (no sign-in) API path and return JSON. */
export async function publicGet(path) {
  const res = await fetch(`/api/v1${path}`);
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail);
  return res.json();
}

/** Load a role-protected photo as an object URL for an <img>. Caller revokes it when done. */
export async function photoUrlFor(mediaId, role) {
  const res = await apiFetch(`/media/${encodeURIComponent(mediaId)}`, { role, raw: true });
  return URL.createObjectURL(await res.blob());
}
