// نقطة تشغيل لوحة الإدارة: التوجيه، الإطار، حالة الجلسة.
import { api, config, session, can, onUnauthenticated, prefetch } from './api.js';
import { esc, $, $$, icon, toast, initials, ROLE_NAMES } from './ui.js';
import * as A from './auth-pages.js';
import * as C from './pages-core.js';
import * as K from './pages-classes.js';
import * as Q from './pages-assess.js';
import * as M from './pages-comms.js';
import * as T from './pages-attendance.js';

const app = $('#app');
let pub = {};
let mfaTicket = null;

// عناصر القائمة تظهر حسب الصلاحيات فقط.
const NAV = [
  { group: null, items: [
    { path: 'dashboard', label: 'نظرة عامة', icon: 'home', perm: 'dashboard.view', page: C.dashboard }
  ] },
  { group: 'التطبيق والطلاب', items: [
    { path: 'classes', label: 'الصفوف', icon: 'board', perm: 'students.view', page: K.classes },
    { path: 'students', label: 'الطلاب', icon: 'users', perm: 'students.view', page: K.students, badge: 'waiting' },
    { path: 'lessons', label: 'الدروس والفيديوهات', icon: 'video', perm: 'content.manage', page: K.lessons },
    { path: 'files', label: 'الملفات', icon: 'folder', perm: 'media.manage', page: K.files }
  ] },
  { group: 'الاختبارات والواجبات', items: [
    { path: 'assessments', label: 'الاختبارات والواجبات', icon: 'clipboard', perm: 'assess.manage', page: Q.assessments },
    { path: 'grading', label: 'التصحيح', icon: 'check', perm: 'grading.manage', page: Q.grading, badge: 'pendingGrading' }
  ] },
  { group: 'التواصل', items: [
    { path: 'news', label: 'الأخبار والإعلانات', icon: 'news', perm: 'news.manage', page: M.news },
    { path: 'notifications', label: 'الإشعارات', icon: 'bell', perm: 'notifications.send', page: M.notifications }
  ] },
  { group: 'التفقد (الصف الحضوري)', items: [
    { path: 'attendance', label: 'أخذ التفقد', icon: 'att', perm: 'attendance.manage', page: T.take },
    { path: 'groups', label: 'المجموعات والأسماء', icon: 'group', perm: 'attendance.manage', page: T.groups },
    { path: 'reports', label: 'تقارير التفقد', icon: 'print', perm: 'attendance.manage', page: T.reports }
  ] },
  { group: 'النظام', items: [
    { path: 'settings', label: 'الإعدادات', icon: 'settings', perm: 'settings.view', page: C.settings },
    { path: 'team', label: 'المساعدون', icon: 'key', perm: 'users.view', page: C.team },
    { path: 'audit', label: 'سجل العمليات', icon: 'shield', perm: 'audit.view', page: C.audit },
    { path: 'account', label: 'حسابي وأمانه', icon: 'user', perm: null, page: C.account }
  ] }
];
// صفحات فرعية لا تظهر في القائمة
const HIDDEN = [
  { path: 'student', label: 'ملف الطالب', parent: 'students', perm: 'students.view', page: K.studentDetail },
  { path: 'assessment', label: 'محرر الاختبار', parent: 'assessments', perm: 'assess.manage', page: Q.editor },
  { path: 'submissions', label: 'تسليمات', parent: 'grading', perm: 'grading.manage', page: Q.submissions },
  { path: 'grade', label: 'تصحيح ورقة', parent: 'grading', perm: 'grading.manage', page: Q.grade }
];
const ROUTES = Object.fromEntries([...NAV.flatMap((g) => g.items), ...HIDDEN].map((i) => [i.path, i]));

function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { path: path || '', params: new URLSearchParams(qs || '') };
}

function renderShell() {
  const me = session.me;
  const name = pub['academy.name'] || 'المدرس هاني العجيل';
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="القائمة الرئيسية">
      <div class="brand"><img class="logo" src="img/emblem.png" alt=""><div><div class="brand-name">${esc(name)}</div><div class="brand-sub">لوحة الإدارة</div></div></div>
      <nav class="nav">${NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return '';
        return (g.group ? `<div class="nav-group">${g.group}</div>` : '') +
          items.map((i) => `<a href="#/${i.path}" data-path="${i.path}">${icon(i.icon)}<span>${i.label}</span>${i.badge ? `<span class="count" data-badge="${i.badge}" hidden></span>` : ''}</a>`).join('');
      }).join('')}</nav>
      <div class="sidebar-foot"><span class="avatar">${initials(me.user.fullName)}</span>
        <div class="who"><b>${esc(me.user.fullName)}</b><span class="muted">${esc(me.roles.map((r) => ROLE_NAMES[r] || r).join('، '))}</span></div>
        <button class="btn ghost sm" data-logout title="تسجيل الخروج" aria-label="تسجيل الخروج">${icon('logout')}</button></div>
    </aside>
    <div class="main">
      <header class="topbar"><div style="display:flex;align-items:center;gap:8px">
        <button class="btn ghost sm menu-btn" data-menu aria-label="القائمة">${icon('menu')}</button>
        <span class="crumbs" data-crumbs></span></div>
        <span class="small muted num" data-clock></span></header>
      <div class="content" data-content></div>
    </div></div>`;
  $('[data-logout]').onclick = async () => { try { await api('auth.logout'); } catch (e) { /* الجلسة قد تكون منتهية */ } session.token = null; session.me = null; location.hash = '#/login'; };
  $('[data-menu]').onclick = () => $('.shell').classList.toggle('nav-open');
}

/** بعد فتح اللوحة: تحميل مسبق لأكثر الصفحات استخداماً في اتصال واحد بالخلفية. */
function warmUp() {
  const list = [];
  if (can('dashboard.view')) list.push(['dashboard.summary']);
  if (can('students.view')) list.push(['classes.list'], ['students.list', {}]);
  if (can('assess.manage')) list.push(['assess.list', {}]);
  if (can('attendance.manage')) list.push(['attendance.groups', {}]);
  setTimeout(() => prefetch(list), 400);
  refreshBadges();
}

/** عدّادات القائمة: طلاب بانتظار الصف وأوراق بانتظار التصحيح. */
export async function refreshBadges() {
  if (!can('dashboard.view')) return;
  try {
    const d = await api('dashboard.summary');
    $$('[data-badge]').forEach((b) => { const n = d[b.dataset.badge] || 0; b.textContent = n; b.hidden = !n; });
  } catch (e) { /* غير مهم */ }
}
document.addEventListener('badges-changed', () => setTimeout(refreshBadges, 50));

function renderPage(route, params) {
  if (!$('.shell')) { renderShell(); warmUp(); }
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === (route.parent || route.path)));
  $('.shell').classList.remove('nav-open');
  $('[data-crumbs]').textContent = route.label;
  document.title = route.label + ' — ' + (pub['academy.name'] || 'المدرس هاني العجيل');
  const root = $('[data-content]');
  root.innerHTML = '';
  route.page(root, params);
  root.focus?.();
}

async function loadMe() {
  session.me = await api('auth.me', {}, { fresh: true });
  return session.me;
}

async function route() {
  const { path, params } = parseHash();
  if (!config.apiUrl) return A.renderConfig(app, boot);

  const publicPaths = { login: 1, forgot: 1, setup: 1, mfa: 1, invite: 1 };
  if (publicPaths[path]) {
    $('.shell') && (app.innerHTML = '');
    if (path === 'setup') return A.renderSetup(app, afterLogin);
    if (path === 'forgot') return A.renderForgot(app);
    if (path === 'invite') return A.renderAcceptInvite(app, afterLogin);
    if (path === 'mfa' && mfaTicket) return A.renderMfaVerify(app, mfaTicket, afterLogin);
    return A.renderLogin(app, { onSession: afterLogin, onMfa: (t) => { mfaTicket = t; location.hash = '#/mfa'; } });
  }

  if (!session.token) return (location.hash = '#/login');
  if (!session.me) {
    try { await loadMe(); } catch (e) { return; }
  }
  if (session.me.mfaSetupRequired) { app.innerHTML = ''; return A.renderMfaSetup(app, async () => { session.me = null; await loadMe(); go('dashboard'); }); }

  const r = ROUTES[path] || ROUTES[firstAllowed()];
  if (!r || (r.perm && !can(r.perm))) {
    app.innerHTML = '';
    return A.renderLogin(app, { onSession: afterLogin, onMfa: (t) => { mfaTicket = t; location.hash = '#/mfa'; } }),
      toast('هذا الحساب لا يملك صلاحية الوصول إلى لوحة الإدارة.', 'error');
  }
  if (!ROUTES[path]) return go(r.path);
  renderPage(r, params);
}

const firstAllowed = () => NAV.flatMap((g) => g.items).find((i) => !i.perm || can(i.perm))?.path;
const go = (p) => { if (location.hash === '#/' + p) route(); else location.hash = '#/' + p; };

async function afterLogin() {
  mfaTicket = null;
  session.me = null;
  app.innerHTML = '';
  await loadMe();
  const staff = session.me.roles.some((r) => r !== 'student');
  if (!staff) {
    await api('auth.logout').catch(() => {});
    session.token = null; session.me = null;
    toast('حسابات الطلاب تستخدم تطبيق الهاتف. لوحة الإدارة مخصصة للأستاذ ومساعديه.', 'error');
    return go('login');
  }
  go(session.me.mfaSetupRequired ? 'dashboard' : 'dashboard');
}

onUnauthenticated((e) => {
  app.innerHTML = '';
  toast(e.message, 'error');
  location.hash = '#/login';
});

document.addEventListener('settings-changed', async () => { pub = await api('settings.public'); A.setPublicSettings(pub); app.innerHTML = ''; route(); });
document.addEventListener('me-changed', () => { app.innerHTML = ''; route(); });
window.addEventListener('hashchange', route);

async function boot() {
  app.innerHTML = '<div class="empty" style="padding-top:30vh"><span class="ornament"></span><p>جارٍ التحميل…</p></div>';
  try {
    // الإعدادات + حالة التأسيس + بيانات المستخدم في اتصال واحد مدمج
    const [settings, setup] = await Promise.all([api('settings.public'), api('setup.status'),
      session.token ? api('auth.me').then((me) => { session.me = me; }).catch(() => {}) : null]);
    pub = settings; A.setPublicSettings(pub);
    applyBrand(pub['brand.colors']);
    if (setup.needsSuperAdmin && !session.token) { location.hash = '#/setup'; return route(); }
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED' || e.code === 'NETWORK') {
      app.innerHTML = `<div class="empty" style="padding-top:24vh"><span class="ornament"></span><h4>تعذّر الوصول إلى الخادم</h4><p>${esc(e.message)}</p>
        <button class="btn secondary" data-retry>إعادة المحاولة</button> <button class="btn ghost" data-reconfig>تغيير رابط الخادم</button></div>`;
      $('[data-retry]').onclick = boot;
      $('[data-reconfig]').onclick = () => { localStorage.removeItem('math_api_url'); A.renderConfig(app, boot); };
      return;
    }
  }
  route();
}

function applyBrand() { /* ألوان ثابتة لهوية المنصة */ }

boot();
