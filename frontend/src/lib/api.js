import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Cookies (httpOnly session_token) carry auth — never store tokens in localStorage.
const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export default api;
