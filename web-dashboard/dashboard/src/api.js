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

// 401 = a dashboard password is set and this browser isn't logged in.
// App.jsx shows the login screen when this fires.
export function onUnauthorized(handler) {
  const id = http.interceptors.response.use(r => r, (err) => {
    if (err.response?.status === 401 && !err.config.url.startsWith('/auth')) handler();
    return Promise.reject(err);
  });
  return () => http.interceptors.response.eject(id);
}

export const auth = {
  status:      ()              => http.get('/auth').then(r => r.data),
  login:       (password)      => http.post('/auth/login', { password }).then(r => r.data),
  logout:      ()              => http.post('/auth/logout').then(r => r.data),
  setPassword: (current, next) => http.put('/auth/password', { current, new: next }).then(r => r.data),
};

export const serverSettings = {
  get: ()     => http.get('/settings').then(r => r.data),
  set: (data) => http.put('/settings', data).then(r => r.data),
};

const upload = (url, file) => {
  const form = new FormData();
  form.append('file', file);
  return http.post(url, form).then(r => r.data);
};

export const backup = {
  downloadUrl: '/api/v1/backup',
  restore:     (file) => upload('/backup', file),
};

export const firmware = {
  info:    ()         => http.get('/firmware').then(r => r.data),
  upload:  (file)     => upload('/firmware', file),
  install: (deviceId) => http.post(`/devices/${deviceId}/ota`).then(r => r.data),
};
