/**
 * PaulFolio — Client untuk API lokal (lihat server/api.js).
 *
 * Semua request memakai cookie sesi HttpOnly, jadi tidak ada token
 * yang disimpan di localStorage.
 */

async function request(method, url, body, headers = {}) {
  const init = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body instanceof Blob) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (_) {
    throw new Error('Tidak dapat terhubung ke server.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request gagal (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

window.api = {
  // Publik
  getProjects: () => request('GET', '/api/projects').then(d => d.projects),
  sendMessage: message => request('POST', '/api/messages', message),

  // Sesi admin
  getSession: () => request('GET', '/api/session').then(d => d.authenticated),
  login: password => request('POST', '/api/login', { password }),
  logout: () => request('POST', '/api/logout'),

  // Admin — proyek
  createProject: project => request('POST', '/api/projects', project).then(d => d.project),
  updateProject: (id, project) => request('PUT', `/api/projects/${encodeURIComponent(id)}`, project).then(d => d.project),
  deleteProjects: ids => request('DELETE', '/api/projects', { ids }),
  uploadImage: file => request('POST', '/api/upload', file, { 'Content-Type': file.type }).then(d => d.url),

  // Admin — pesan
  getMessages: () => request('GET', '/api/messages').then(d => d.messages),
  markMessages: (ids, isRead) => request('PATCH', '/api/messages', { ids, is_read: isRead }),
  deleteMessages: ids => request('DELETE', '/api/messages', { ids }),
};
