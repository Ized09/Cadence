import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach bearer if we have a local token (JWT email/password path)
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("cadence_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export default api;
