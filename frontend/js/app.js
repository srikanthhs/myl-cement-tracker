/* App Entry Point – client-side router, bootstraps on DOMContentLoaded */
const Router = (() => {
  let _current = 'dashboard';

  const PAGE_RENDERERS = {
    dashboard:    () => Pages.Dashboard.render(),
    masterupload: () => Pages.Upload.render(),
    beneficiaries:() => Pages.Beneficiaries.render(),
    allotments:   () => Pages.Allotments.render(),
    issuance:     () => Pages.Issuance.render(),
    stock:        () => Pages.Stock.render(),
    reports:      () => Pages.Reports.render(),
    alerts:       () => Pages.Alerts.render(),
    users:        () => Pages.Users.render(),
    settings:     () => Pages.Settings.render(),
  };

  function navigate(page) {
    if (!PAGE_RENDERERS[page]) page = 'dashboard';

    const user = Auth.getUser();
    if (!user) return;

    _current = page;
    const main = document.getElementById('mainContent');
    main.innerHTML = `<div class="empty-state"><span class="material-icons-round spin">sync</span><p>Loading…</p></div>`;

    UI.setActiveNav(page);
    window.history.pushState({}, '', `#${page}`);

    Promise.resolve()
      .then(() => PAGE_RENDERERS[page]())
      .catch(err => {
        main.innerHTML = `
          <div class="card">
            <div class="alert alert-danger">
              <span class="material-icons-round">error_outline</span>
              <div><strong>Error loading page</strong><br>${err.message}</div>
            </div>
          </div>`;
      });
  }

  function currentPage() { return _current; }

  return { navigate, currentPage };
})();

// ── Page namespace ───────────────────────────────────────────────────────────
const Pages = {
  Dashboard:    typeof DashboardPage    !== 'undefined' ? DashboardPage    : null,
  Upload:       typeof UploadPage       !== 'undefined' ? UploadPage       : null,
  Beneficiaries:typeof BeneficiariesPage!== 'undefined' ? BeneficiariesPage: null,
  Allotments:   typeof AllotmentsPage   !== 'undefined' ? AllotmentsPage   : null,
  Issuance:     typeof IssuancePage     !== 'undefined' ? IssuancePage     : null,
  Stock:        typeof StockPage        !== 'undefined' ? StockPage        : null,
  Reports:      typeof ReportsPage      !== 'undefined' ? ReportsPage      : null,
  Alerts:       typeof AlertsPage       !== 'undefined' ? AlertsPage       : null,
  Users:        typeof UsersPage        !== 'undefined' ? UsersPage        : null,
  Settings:     typeof SettingsPage     !== 'undefined' ? SettingsPage     : null,
};

// ── Helpers available globally ───────────────────────────────────────────────
function fmt(n) { return (n ?? 0).toLocaleString('en-IN'); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function statusChip(s) {
  const map = {
    Pending:  'chip-pending',
    Approved: 'chip-approved',
    Issued:   'chip-issued',
    Rejected: 'chip-rejected',
    Active:   'chip-active',
    Verified: 'chip-verified',
  };
  return `<span class="chip ${map[s] || 'chip-pending'}">${s}</span>`;
}

// ── Boot ───────────────────────────────────────────────────────────��─────────
document.addEventListener('DOMContentLoaded', () => {
  // Resolve page object references after all scripts have loaded
  Pages.Dashboard     = typeof DashboardPage     !== 'undefined' ? DashboardPage     : { render: () => { document.getElementById('mainContent').innerHTML = '<div class="empty-state"><p>Dashboard coming soon</p></div>'; } };
  Pages.Upload        = typeof UploadPage        !== 'undefined' ? UploadPage        : { render: () => {} };
  Pages.Beneficiaries = typeof BeneficiariesPage !== 'undefined' ? BeneficiariesPage : { render: () => {} };
  Pages.Allotments    = typeof AllotmentsPage    !== 'undefined' ? AllotmentsPage    : { render: () => {} };
  Pages.Issuance      = typeof IssuancePage      !== 'undefined' ? IssuancePage      : { render: () => {} };
  Pages.Stock         = typeof StockPage         !== 'undefined' ? StockPage         : { render: () => {} };
  Pages.Reports       = typeof ReportsPage       !== 'undefined' ? ReportsPage       : { render: () => {} };
  Pages.Alerts        = typeof AlertsPage        !== 'undefined' ? AlertsPage        : { render: () => {} };
  Pages.Users         = typeof UsersPage         !== 'undefined' ? UsersPage         : { render: () => {} };
  Pages.Settings      = typeof SettingsPage      !== 'undefined' ? SettingsPage      : { render: () => {} };

  Auth.init();

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const hash = location.hash.replace('#', '') || 'dashboard';
    Router.navigate(hash);
  });
});
