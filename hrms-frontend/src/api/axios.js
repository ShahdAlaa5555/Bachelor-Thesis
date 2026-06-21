// src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (res.config.responseType === 'blob' || res.config.responseType === 'arraybuffer') {
      return res;
    }

    const body = res.data;
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      res.data = body.data;
    }
    return res;
  },
  async (err) => {
    const original = err.config;

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(
          `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1'}/auth/refresh`,
          { refreshToken }
        );
        const newToken = data?.data?.accessToken || data?.accessToken;
        localStorage.setItem('accessToken', newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }

    if (
      original?.responseType === 'blob' &&
      err.response?.data instanceof Blob &&
      err.response.data.type === 'application/json'
    ) {
      try {
        const text = await err.response.data.text();
        err.response.data = JSON.parse(text);
      } catch {
        // leave as-is if parsing fails
      }
    }

    return Promise.reject(err);
  }
);

export default api;