import axios from 'axios';

const http = axios.create({ baseURL: '/api/v1' });

export const clients = {
  list: () => http.get('/clients').then(r => r.data),
  create: (data) => http.post('/clients', data).then(r => r.data),
  update: (id, data) => http.put(`/clients/${id}`, data).then(r => r.data),
  remove: (id) => http.delete(`/clients/${id}`),
};

export const projects = {
  list: (clientId) =>
    http.get('/projects/all', { params: clientId ? { client_id: clientId } : {} }).then(r => r.data),
  listActive: (clientId) =>
    http.get('/projects', { params: clientId ? { client_id: clientId } : {} }).then(r => r.data),
  create: (data) => http.post('/projects', data).then(r => r.data),
  update: (id, data) => http.put(`/projects/${id}`, data).then(r => r.data),
  remove: (id) => http.delete(`/projects/${id}`),
  billing: (id) => http.get(`/projects/${id}/billing`).then(r => r.data),
};

export const timelogs = {
  list: (params) => http.get('/timelogs', { params }).then(r => r.data),
  create: (data) => http.post('/timelogs', data).then(r => r.data),
  update: (id, data) => http.put(`/timelogs/${id}`, data).then(r => r.data),
  remove: (id) => http.delete(`/timelogs/${id}`),
};

export const devices = {
  list:        ()           => http.get('/devices').then(r => r.data),
  update:      (id, data)   => http.put(`/devices/${id}`, data).then(r => r.data),
  remove:      (id)         => http.delete(`/devices/${id}`),
  getSettings: (id)         => http.get(`/devices/${id}/settings`).then(r => r.data),
  setSettings: (id, data)   => http.put(`/devices/${id}/settings`, data).then(r => r.data),
  // Remote control — synthetic Nextion touch at (x, y).
  remoteTouch: (id, x, y, pressed = true) =>
    http.post(`/devices/${id}/remote/touch`, { x, y, pressed }).then(r => r.data),
};

export const apps = {
  list: () => http.get('/apps').then(r => r.data),
  listAll: () => http.get('/apps/all').then(r => r.data),
  create: (data) => http.post('/apps', data).then(r => r.data),
  update: (id, data) => http.put(`/apps/${id}`, data).then(r => r.data),
  remove: (id) => http.delete(`/apps/${id}`),
};

export const stats = {
  get: () => http.get('/stats').then(r => r.data),
};

export const reports = {
  daily:     (params) => http.get('/reports/daily',      { params }).then(r => r.data),
  byClient:  (params) => http.get('/reports/by-client',  { params }).then(r => r.data),
  byProject: (params) => http.get('/reports/by-project', { params }).then(r => r.data),
  byApp:     (params) => http.get('/reports/by-app',     { params }).then(r => r.data),
};
