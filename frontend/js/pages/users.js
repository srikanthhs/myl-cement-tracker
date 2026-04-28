const UsersPage = (() => {
  let _users = [];

  async function render() {
    if (Auth.getUser()?.role !== 'admin') {
      document.getElementById('mainContent').innerHTML = `
        <div class="access-denied">
          <span class="material-icons-round">lock</span>
          <h3>Access Denied</h3><p>Only District Collector can manage users.</p>
        </div>`;
      return;
    }

    const el = document.getElementById('mainContent');
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Users & Permissions</div><div class="page-sub">Manage user access and role permissions</div></div>
        ${Exporter.dropdownBtn('UsersPage.exportExcel()','UsersPage.exportPDF()')}
      </div>
      <div id="usersBody"><div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div></div>`;

    try {
      _users = await API.get('/users');
      const perms = await API.get('/users/permissions').catch(() => ({}));
      const avatarColor = { admin:'#1a73e8', bdo:'#1e8e3e', overseer:'#6d4c41', store:'#e65100', inspector:'#c62828', engineer:'#7b1fa2' };

      document.getElementById('usersBody').innerHTML = `
        <div class="card">
          <div class="section-title">All Users (${_users.length})</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Block</th><th>Designation</th><th>Mobile</th></tr></thead>
            <tbody>
              ${_users.map(u=>`
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:32px;height:32px;border-radius:8px;background:${avatarColor[u.role]||'#1a73e8'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">${u.name[0]}</div>
                      <strong>${u.name}</strong>
                    </div>
                  </td>
                  <td><code>${u.username}</code></td>
                  <td><span class="role-badge rb-${u.role}">${u.role.toUpperCase()}</span></td>
                  <td>${u.block||'All Blocks'}</td>
                  <td style="font-size:12px;color:var(--grey-700)">${u.designation||'—'}</td>
                  <td>${u.mobile||'—'}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="section-title">Role Permissions Matrix</div>
          <p style="font-size:13px;color:var(--grey-700);margin-bottom:16px">Current permission assignments per role</p>
          ${_permMatrix(perms)}
        </div>`;
    } catch(e) {
      document.getElementById('usersBody').innerHTML = `<div class="alert alert-danger"><span class="material-icons-round">error_outline</span>${e.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────
  function exportExcel() {
    if (!_users.length) { UI.showToast('No users loaded yet', 'warning'); return; }

    const ACTIONS = ['createAllotment','approveAllotment','editAllotment','engineerVerify','issueCement','addStock','viewReports','manageUsers','viewBeneficiary','editBeneficiary','fieldInspect'];
    const ROLES   = ['admin','bdo','overseer','store','inspector','engineer'];
    const DEFAULT_PERMISSIONS = {
      createAllotment:['admin','bdo','overseer'], approveAllotment:['admin','bdo'],
      editAllotment:['admin','bdo','overseer'],   engineerVerify:['admin','engineer'],
      issueCement:['admin','store'],              addStock:['admin','store'],
      viewReports:['admin','bdo','overseer'],     manageUsers:['admin'],
      viewBeneficiary:['admin','bdo','overseer','engineer'], editBeneficiary:['admin','bdo'],
      fieldInspect:['admin','inspector'],
    };

    Exporter.toExcel('Users_Permissions', [
      {
        name: 'Users',
        headers: ['Name','Username','Role','Block','Designation','Mobile','Department'],
        rows: _users.map(u=>[u.name, u.username, u.role.toUpperCase(), u.block||'All Blocks', u.designation||'', u.mobile||'', u.dept||'']),
      },
      {
        name: 'Permissions Matrix',
        headers: ['Action', ...ROLES.map(r=>r.toUpperCase())],
        rows: ACTIONS.map(action => [
          action,
          ...ROLES.map(r => (DEFAULT_PERMISSIONS[action]||[]).includes(r) ? '✓' : '–'),
        ]),
      },
    ]);
  }

  function exportPDF() {
    if (!_users.length) { UI.showToast('No users loaded yet', 'warning'); return; }
    Exporter.toPDF('Users_List', `Users List (${_users.length})`,
      ['Name','Username','Role','Block','Designation'],
      _users.map(u=>[u.name, u.username, u.role.toUpperCase(), u.block||'All Blocks', u.designation||'—']),
      { landscape: false }
    );
  }

  // ── Permissions matrix HTML ───────────────────────────────────
  function _permMatrix(perms) {
    const DEFAULT = {
      createAllotment:['admin','bdo','overseer'], approveAllotment:['admin','bdo'],
      editAllotment:['admin','bdo','overseer'],   engineerVerify:['admin','engineer'],
      issueCement:['admin','store'],              addStock:['admin','store'],
      editStock:['admin','store','bdo'],          viewReports:['admin','bdo','overseer'],
      manageUsers:['admin'],                      viewBeneficiary:['admin','bdo','overseer','engineer'],
      editBeneficiary:['admin','bdo'],            fieldInspect:['admin','inspector'],
    };
    const effective = { ...DEFAULT, ...(perms||{}) };
    const actions   = Object.keys(DEFAULT);
    const roles     = ['admin','bdo','overseer','store','inspector','engineer'];
    return `<div class="table-wrap"><table>
      <thead><tr><th>Action</th>${roles.map(r=>`<th style="text-align:center">${r}</th>`).join('')}</tr></thead>
      <tbody>
        ${actions.map(action=>`
          <tr>
            <td style="font-weight:500;font-size:13px">${action}</td>
            ${roles.map(r=>`
              <td style="text-align:center">
                ${(effective[action]||[]).includes(r)
                  ?'<span style="color:var(--green);font-size:18px">✓</span>'
                  :'<span style="color:var(--grey-300);font-size:16px">–</span>'}
              </td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  return { render, exportExcel, exportPDF };
})();
