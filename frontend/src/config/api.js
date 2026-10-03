/**
 * Centralized API Base URL Configuration for MEMORA.
 *
 * In production (e.g., hosted on Vercel), this resolves to the production
 * environment variable `VITE_API_URL` (e.g., https://memora-backend.onrender.com).
 * In local development, it defaults to the local FastAPI backend.
 *
 * Automatically sanitizes any trailing slash so endpoint paths remain valid.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL?.trim() || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export default API_BASE_URL;
