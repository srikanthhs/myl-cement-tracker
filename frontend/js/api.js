/* HTTP Client – all calls to the Application Tier (Express REST API) */
const API = (() => {
  function _token() {
    return localStorage.getItem(CONFIG.TOKEN_KEY) || '';
  }

  async function _request(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = _token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(CONFIG.API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    });

    if (res.status === 401) {
      Auth.clearSession();
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function upload(path, formData) {
    const token = _token();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(CONFIG.API_BASE + path, { method: 'POST', headers, body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    get:    (path)        => _request('GET', path),
    post:   (path, body)  => _request('POST', path, body),
    put:    (path, body)  => _request('PUT', path, body),
    patch:  (path, body)  => _request('PATCH', path, body),
    delete: (path)        => _request('DELETE', path),
    upload,
  };
})();
