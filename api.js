/* api.js — Cliente HTTP partilhado */
const API = {
  async req(method, path, body) {
    const token = localStorage.getItem('vc_token');
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
    return data;
  },
  get:    (p)    => API.req('GET', p),
  post:   (p, b) => API.req('POST', p, b),
  patch:  (p, b) => API.req('PATCH', p, b),
  delete: (p)    => API.req('DELETE', p),
};

/* Toast global */
function toast(msg, type = 'success') {
  const icons = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

/* Modal helpers */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* Logout */
function logout() { localStorage.clear(); window.location.href = '/login.html'; }

/* Auth guard */
function requireAuth(role) {
  const user = JSON.parse(localStorage.getItem('vc_user') || 'null');
  if (!user) { window.location.href = '/login.html'; return null; }
  if (role && user.role !== role && user.role !== 'admin') { window.location.href = '/login.html'; return null; }
  return user;
}

/* Format helpers */
function fmtData(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtHora(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' });
}
function today() { return new Date().toISOString().split('T')[0]; }
