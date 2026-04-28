/* Authentication Module – manages JWT session and login UI */
const Auth = (() => {
  let _user = null;

  // Hint lookup table (username prefix → role info for login UX)
  const ROLE_HINTS = [
    { prefix: 'collector', role:'admin',    name:'District Collector',     icon:'admin_panel_settings', color:'#1a73e8', badge:'rb-admin'    },
    { prefix: 'bdo.',      role:'bdo',      name:'Block Development Officer', icon:'account_balance',   color:'#1e8e3e', badge:'rb-bdo'      },
    { prefix: 'store.',    role:'store',    name:'Store Keeper',           icon:'warehouse',            color:'#e65100', badge:'rb-store'    },
    { prefix: 'inspector.',role:'inspector',name:'Field Inspector',        icon:'fact_check',           color:'#c62828', badge:'rb-inspector'},
    { prefix: 'engineer.', role:'engineer', name:'AE/JE Engineer',         icon:'engineering',          color:'#7b1fa2', badge:'rb-engineer' },
  ];

  function init() {
    const raw = localStorage.getItem(CONFIG.USER_KEY);
    const tok = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (raw && tok) {
      try {
        _user = JSON.parse(raw);
        _showApp();
      } catch { clearSession(); }
    }
  }

  async function login() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Signing in…';

    try {
      const data = await API.post('/auth/login', { username, password });
      localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
      _user = data.user;
      _showApp();
    } catch (err) {
      document.getElementById('loginErrorMsg').textContent = err.message || 'Invalid username or password.';
      errEl.style.display = 'flex';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons-round">login</span> Sign In';
    }
  }

  async function logout() {
    try { await API.post('/auth/logout'); } catch { /* ignore */ }
    clearSession();
  }

  function clearSession() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    _user = null;
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('roleDetected').style.display = 'none';
  }

  function getUser() { return _user; }

  function can(action) {
    if (!_user) return false;
    if (_user.role === 'admin') return true;
    const perms = {
      createAllotment:  ['admin','bdo','overseer'],
      approveAllotment: ['admin','bdo'],
      editAllotment:    ['admin','bdo','overseer'],
      engineerVerify:   ['admin','engineer'],
      issueCement:      ['admin','store'],
      addStock:         ['admin','store'],
      editStock:        ['admin','store','bdo'],
      viewReports:      ['admin','bdo','overseer'],
      manageUsers:      ['admin'],
      viewBeneficiary:  ['admin','bdo','overseer','engineer'],
      editBeneficiary:  ['admin','bdo'],
      fieldInspect:     ['admin','inspector'],
    };
    return (perms[action] || []).includes(_user.role);
  }

  function onUsernameHint(val) {
    const hint = ROLE_HINTS.find(h => val.toLowerCase().startsWith(h.prefix));
    const el   = document.getElementById('roleDetected');
    if (hint) {
      document.getElementById('rdAvatar').style.background = hint.color;
      document.getElementById('rdIcon').textContent = hint.icon;
      document.getElementById('rdName').textContent  = hint.name;
      document.getElementById('rdDesig').textContent = hint.role.toUpperCase() + ' login';
      const b = document.getElementById('rdBadge');
      b.className = `role-badge ${hint.badge}`;
      b.textContent = hint.role;
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  function togglePwd() {
    const inp = document.getElementById('loginPass');
    const eye = document.getElementById('pwdEye');
    const vis = inp.type === 'password';
    inp.type = vis ? 'text' : 'password';
    eye.textContent = vis ? 'visibility_off' : 'visibility';
  }

  function _showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('avatarInitial').textContent = (_user.name || 'U')[0].toUpperCase();
    document.getElementById('userLabel').textContent = _user.name;
    Router.navigate('dashboard');
    UI.buildSidebar();
    _updateApiStatus(true);
  }

  function _updateApiStatus(ok) {
    const el = document.getElementById('apiStatus');
    if (!el) return;
    el.innerHTML = ok
      ? '<span class="material-icons-round" style="font-size:13px">cloud_done</span> API Connected'
      : '<span class="material-icons-round" style="font-size:13px">cloud_off</span> Offline';
    el.style.color = ok ? 'var(--green)' : 'var(--grey-500)';
  }

  return { init, login, logout, clearSession, getUser, can, onUsernameHint, togglePwd };
})();
