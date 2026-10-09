import axios from 'axios';
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api';

const STORAGE_KEY = 'hms.auth';

/* ---------------------------- token storage ---------------------------- */

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function writeSession(session) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

/** Called by AuthContext when the refresh flow forces a logout. */
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

/* --------------------------- request pipeline -------------------------- */

axiosClient.interceptors.request.use((config) => {
  const session = readSession();
  if (session?.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

/* --------------------------- response pipeline ------------------------- */

// Queue concurrent 401s so a burst of requests triggers exactly one refresh.
let refreshing = null;

async function refreshAccessToken() {
  const session = readSession();
  if (!session?.refreshToken) throw new Error('No refresh token');

  const { data } = await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken: session.refreshToken },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const next = { ...session, accessToken: data.data.accessToken, user: data.data.user };
  writeSession(next);
  return next.accessToken;
}

axiosClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    const canRetry = status === 401 && !original._retry && code !== 'REFRESH_INVALID';

    if (canRetry) {
      original._retry = true;
      try {
        refreshing = refreshing || refreshAccessToken().finally(() => { refreshing = null; });
        const token = await refreshing;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return axiosClient(original);
      } catch {
        writeSession(null);
        onUnauthorized();
      }
    }

    // Normalise the API's { success:false, error:{...} } envelope into an Error.
    const apiError = error.response?.data?.error;
    const normalised = new Error(apiError?.message || error.message || 'Request failed');
    normalised.code = apiError?.code;
    normalised.details = apiError?.details;
    normalised.status = status;
    return Promise.reject(normalised);
  }
);

/** Unwraps { success, data, meta } so callers deal with plain payloads. */
export async function request(config) {
  const res = await axiosClient(config);
  return { data: res.data?.data, meta: res.data?.meta };
}

export default axiosClient;
