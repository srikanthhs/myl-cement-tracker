/* UI Helpers – shared across all pages */
const UI = (() => {
  let _toastTimer = null;

  // ── Toast ────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    const el   = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastMsg');
    const icons  = { success:'check_circle', error:'error_outline', info:'info', warning:'warning' };
    const colors = { success:'var(--green)',  error:'var(--red)',    info:'var(--blue)', warning:'var(--yellow)' };
    icon.textContent  = icons[type]  || icons.success;
    icon.style.color  = colors[type] || colors.success;
    text.textContent  = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  // ── Modal ────────────────────────────────────────────────────
  function openModal(title, bodyHtml, footerBtns = []) {
    document.getElementById('modalTitle').textContent  = title;
    document.getElementById('modalBody').innerHTML     = bodyHtml;
    const footer = document.getElementById('modalFooter');
    footer.innerHTML = footerBtns.map(b =>
      `<button class="btn ${b.cls || 'btn-outlined'}" onclick="${b.fn}">${b.label}</button>`
    ).join('');
    document.getElementById('modalBackdrop').classList.add('open');
  }

  function openModalWithButtons(title, bodyHtml, buttons) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML    = bodyHtml;
    const footer = document.getElementById('modalFooter');
    footer.innerHTML = '';
    buttons.forEach(({ label, cls, fn }) => {
      const btn = document.createElement('button');
      btn.className   = `btn ${cls || 'btn-outlined'}`;
      btn.textContent = label;
      btn.onclick     = fn;
      footer.appendChild(btn);
    });
    document.getElementById('modalBackdrop').classList.add('open');
  }

  function closeModal() {
    document.getElementById('modalBackdrop').classList.remove('open');
  }

  function closeModalOutside(e) {
    if (e.target.id === 'modalBackdrop') closeModal();
  }

  // ── Sidebar ──────────────────────────────────────────────────
  const PAGE_META = {
    dashboard:    { label:'Dashboard',        icon:'dashboard'         },
    masterupload: { label:'Master Upload',    icon:'upload_file'       },
    beneficiaries:{ label:'Beneficiaries',    icon:'people'            },
    allotments:   { label:'Allotments',       icon:'assignment'        },
    issuance:     { label:'Cement Issuance',  icon:'output'            },
    stock:        { label:'Stock',            icon:'inventory_2'       },
    reports:      { label:'Reports',          icon:'bar_chart'         },
    tnrd:         { label:'TNRD Portal',      icon:'cloud_download'    },
    alerts:       { label:'Alerts',           icon:'notifications'     },
    users:        { label:'Users & Perms',    icon:'manage_accounts'   },
    settings:     { label:'Settings',         icon:'settings'          },
  };

  const ROLE_PAGES = {
    admin:    ['dashboard','masterupload','beneficiaries','allotments','issuance','stock','reports','tnrd','alerts','users','settings'],
    bdo:      ['dashboard','beneficiaries','allotments','stock','reports','tnrd','alerts','settings'],
    overseer: ['dashboard','allotments','beneficiaries','reports','tnrd','alerts'],
    store:    ['dashboard','issuance','stock','alerts'],
    inspector:['dashboard','alerts'],
    engineer: ['dashboard','allotments','stock','reports','tnrd','beneficiaries','alerts'],
  };

  function buildSidebar() {
    const user  = Auth.getUser();
    if (!user) return;
    const pages = ROLE_PAGES[user.role] || ['dashboard'];
    const color = { admin:'#1a73e8', bdo:'#1e8e3e', overseer:'#6d4c41', store:'#e65100', inspector:'#c62828', engineer:'#7b1fa2' };
    const badge = { admin:'rb-admin', bdo:'rb-bdo', overseer:'rb-overseer', store:'rb-store', inspector:'rb-inspector', engineer:'rb-engineer' };

    document.getElementById('sidebarContent').innerHTML = `
      <div class="sidebar-user">
        <div class="su-avatar u-avatar ${user.avatarColor || user.role}">
          <span class="material-icons-round">${user.icon || 'person'}</span>
        </div>
        <div>
          <div class="su-name">${user.name}</div>
          <div class="su-role">${user.designation || user.role}</div>
          <span class="role-badge ${badge[user.role] || 'rb-admin'}" style="margin-top:4px">${user.role.toUpperCase()}</span>
        </div>
      </div>
      <div class="sidebar-label">Navigation</div>
      ${pages.map(p => `
        <button class="nav-item ${Router.currentPage() === p ? 'active' : ''}" id="nav_${p}" onclick="Router.navigate('${p}')">
          <span class="material-icons-round">${PAGE_META[p]?.icon || 'circle'}</span>
          ${PAGE_META[p]?.label || p}
          ${p === 'alerts' ? '<span id="sidebarAlertBadge" class="nav-badge hidden">0</span>' : ''}
        </button>
      `).join('')}
      <div style="padding:16px;margin-top:8px;border-top:1px solid var(--grey-200)">
        <button class="btn btn-text" style="color:var(--red);font-size:13px;padding:6px 0;width:100%;justify-content:flex-start" onclick="Auth.logout()">
          <span class="material-icons-round">logout</span> Sign Out
        </button>
      </div>
    `;
  }

  function setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const nav = document.getElementById(`nav_${page}`);
    if (nav) nav.classList.add('active');
  }

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  }

  // ── Photo capture (shared) ───────────────────────────────────
  let _photoStore = {};

  function initPhotoCapture(zoneId) {
    _photoStore[zoneId] = [];
  }

  function handlePhotoCapture(event, zoneId) {
    const files = Array.from(event.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        _photoStore[zoneId] = _photoStore[zoneId] || [];
        _photoStore[zoneId].push(e.target.result);
        _renderPhotoZone(zoneId);
      };
      reader.readAsDataURL(file);
    });
  }

  function _renderPhotoZone(zoneId) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    const photos = _photoStore[zoneId] || [];
    zone.innerHTML = photos.map((src, i) =>
      `<img src="${src}" class="photo-thumb" onclick="UI.viewPhoto('${zoneId}',${i})">`
    ).join('') + `
      <div class="photo-add" onclick="document.getElementById('${zoneId}_input').click()">
        <span class="material-icons-round">add_a_photo</span><span>Add Photo</span>
      </div>`;
  }

  function getPhotos(zoneId) {
    return _photoStore[zoneId] || [];
  }

  function viewPhoto(zoneId, idx) {
    const src = (_photoStore[zoneId] || [])[idx];
    if (!src) return;
    openModal('Photo', `<img src="${src}" style="width:100%;border-radius:8px">`, [{ label:'Close', cls:'btn-outlined', fn:'UI.closeModal()' }]);
  }

  // ── GPS ──────────────────────────────────────────────────────
  function captureGPS(statusId) {
    const el = document.getElementById(statusId);
    if (!el) return Promise.reject();
    el.textContent = 'Capturing GPS…';
    return new Promise((res, rej) => {
      navigator.geolocation.getCurrentPosition(pos => {
        const coords = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) };
        el.innerHTML = `<span class="chip chip-verified">✓ ${coords.lat}, ${coords.lng}</span>`;
        res(coords);
      }, () => {
        el.textContent = 'GPS unavailable';
        rej();
      });
    });
  }

  // ── Print ────────────────────────────────────────────────────
  function printZone(html) {
    const zone = document.getElementById('printZone');
    zone.innerHTML = html;
    zone.classList.remove('hidden');
    window.print();
    zone.classList.add('hidden');
    zone.innerHTML = '';
  }

  // ── Skeleton loader ──────────────────────────────────────────
  function skeletonRows(cols, n = 5) {
    return Array(n).fill(0).map(() =>
      `<tr>${Array(cols).fill(0).map(() => `<td><div class="skeleton" style="height:14px;border-radius:4px"></div></td>`).join('')}</tr>`
    ).join('');
  }

  return {
    showToast, openModal, openModalWithButtons, closeModal, closeModalOutside,
    buildSidebar, setActiveNav, toggleSidebar,
    handlePhotoCapture, initPhotoCapture, getPhotos, viewPhoto,
    captureGPS, printZone, skeletonRows,
  };
})();
