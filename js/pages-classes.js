// الصفوف، الطلاب، ملف الطالب، الدروس والفيديوهات، الملفات.
import { api, mutate, can } from './api.js';
import {
  esc, $, $$, toast, dialog, formDialog, confirmDialog, fmtDateTime, fmtDate, initials, emptyState, loadingRows, icon, head, guarded,
  classChip, CLASS_COLORS, readFileBase64, fmtSize, STATUS
} from './ui.js';

const statusBadge = (s) => { const [k, t] = STATUS[s] || ['', s]; return `<span class="badge ${k}">${esc(t)}</span>`; };
const pct = (n) => `<div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${Math.min(100, n || 0)}%"></i></div><span class="small num">${Math.round(n || 0)}%</span></div>`;
const badges = () => document.dispatchEvent(new CustomEvent('badges-changed'));

async function classOptions(all = false) {
  const r = await api('classes.list', all ? { all: true } : {});
  return r.items;
}
/** شارات صفوف الطالب (قد يكون في أكثر من صف). */
const classChips = (s, list) => {
  const ids = s.classIds || [];
  if (!ids.length) return classChip('', '');
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  return `<div class="chips">${ids.map((id) => byId[id] ? classChip(byId[id].name, byId[id].color) : '').join('')}</div>`;
};
/** مربعات اختيار الصفوف (اختيار صف أو أكثر). */
const classChecks = (list, selected = []) => list.length
  ? `<div class="checks">${list.map((c) => `<label class="check"><input type="checkbox" name="cls" value="${esc(c.id)}" ${selected.includes(c.id) ? 'checked' : ''}> <span>${classChip(c.name, c.color)}</span></label>`).join('')}</div>`
  : '<p class="small muted">لا صفوف بعد. أنشئ صفاً من صفحة «الصفوف».</p>';
/** نافذة صفوف طالب واحد: يمكن اختيار أكثر من صف أو إلغاء الكل. */
async function editClasses(s, list) {
  return dialog({ title: `صفوف الطالب: ${s.fullName}`, submitLabel: 'حفظ',
    body: `<p class="small muted" style="margin-top:0">اختر صفاً أو أكثر (مثلاً: الرياضيات والفيزياء). يرى الطالب دروس واختبارات وأخبار كل صفوفه، ويصله إشعار عند إضافته لصف جديد. إلغاء كل الصفوف يوقف وصوله للمحتوى.</p>${classChecks(list, s.classIds || [])}`,
    onSubmit: (f, d) => mutate('students.assign', { ids: [s.id], mode: 'set', classIds: $$('[name="cls"]:checked', d).map((x) => x.value) }) });
}
const classSelect = (items, value, { name = 'classId', none = '' } = {}) =>
  `<select class="input" name="${name}">${none ? `<option value="">${esc(none)}</option>` : ''}${items.map((c) => `<option value="${esc(c.id)}" ${c.id === value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;

/** نافذة كلمة المرور المؤقتة: تُعرض مرة واحدة لتسليمها للطالب. */
function showCredentials(email, password, title = 'بيانات دخول الطالب') {
  const text = `البريد: ${email}\nكلمة المرور: ${password}`;
  return dialog({ title, submitLabel: 'نسخ وإغلاق',
    body: `<p style="margin-top:0">سلّم هذه البيانات للطالب، ولن تظهر مرة أخرى. يستطيع تغيير كلمة المرور من التطبيق.</p>
      <div class="code-box" style="font-size:16px;text-align:right;direction:rtl;white-space:pre-line">${esc(text)}</div>`,
    onSubmit: async () => { try { await navigator.clipboard.writeText(text); toast('نُسخت البيانات'); } catch (e) { /* */ } return true; } });
}

// ════════════ الصفوف ════════════
export function classes(root) {
  return guarded(root, async () => {
    const items = await classOptions(true);
    const manage = can('classes.manage');
    root.innerHTML = head('التطبيق والطلاب', 'الصفوف', 'كل صف له دروسه واختباراته وأخباره. الطالب يرى محتوى صفه فقط.',
      manage ? `<button class="btn" data-new>${icon('plus')} صف جديد</button>` : '') +
      (items.length ? `<div class="class-grid">${items.map((c) => `
        <article class="card class-card" style="--c:${esc(c.color)}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><h3>${esc(c.name)}</h3>${c.status === 'archived' ? '<span class="badge">مؤرشف</span>' : ''}</div>
          ${c.description ? `<p class="small muted" style="margin:0">${esc(c.description)}</p>` : ''}
          <div class="nums"><div><b>${c.students}</b>طالب</div><div><b>${c.lessons}</b>درس</div><div><b>${c.assessments}</b>اختبار/واجب</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <a class="btn secondary sm" href="#/students?classId=${esc(c.id)}">الطلاب</a>
            <a class="btn secondary sm" href="#/lessons?classId=${esc(c.id)}">الدروس</a>
            ${manage ? `<button class="btn ghost sm" data-edit="${esc(c.id)}">${icon('edit', 16)} تعديل</button>` : ''}
          </div></article>`).join('')}</div>`
        : `<div class="card">${emptyState('ابدأ بإنشاء الصفوف', 'مثلاً: التاسع، العاشر، البكالوريا العلمي. بعدها أضف الطلاب إليها وارفع دروس كل صف.', manage ? '<button class="btn" data-new>إنشاء أول صف</button>' : '')}</div>`);
    const edit = async (c) => {
      const color = c?.color || CLASS_COLORS[items.length % CLASS_COLORS.length];
      const res = await dialog({ title: c ? 'تعديل الصف' : 'صف جديد', submitLabel: 'حفظ',
        body: `<div class="field"><label>اسم الصف *</label><input class="input" name="name" value="${esc(c?.name || '')}" required placeholder="مثال: البكالوريا العلمي"></div>
          <div class="field"><label>وصف مختصر</label><input class="input" name="description" value="${esc(c?.description || '')}"></div>
          <div class="field"><label>اللون</label><div class="swatches">${CLASS_COLORS.map((x, i) => `<input type="radio" name="color" id="sw${i}" value="${x}" ${x === color ? 'checked' : ''}><label for="sw${i}" style="background:${x}" title="${x}"></label>`).join('')}</div></div>
          ${c ? `<label class="check"><input type="checkbox" name="archived" ${c.status === 'archived' ? 'checked' : ''}> <span>أرشفة الصف (يختفي من القوائم)</span></label>` : ''}`,
        onSubmit: async (f) => {
          if (!f.name) throw new Error('اكتب اسم الصف.');
          const form = $$('dialog.dialog').pop();
          return mutate('classes.save', { id: c?.id, name: f.name, description: f.description, color: f.color, status: c && $('[name="archived"]', form)?.checked ? 'archived' : 'active' });
        } });
      if (res) { toast('حُفظ الصف'); classes(root); }
    };
    $$('[data-new]', root).forEach((b) => b.onclick = () => edit(null));
    $$('[data-edit]', root).forEach((b) => b.onclick = () => edit(items.find((x) => x.id === b.dataset.edit)));
  });
}

// ════════════ الطلاب ════════════
export function students(root, params) {
  const state = { classId: params.get('classId') || '', q: '', status: '', page: 1 };
  const manage = can('students.manage');
  let clsList = [];
  root.innerHTML = head('التطبيق والطلاب', 'الطلاب', 'الطالب يسجّل من التطبيق، ثم تضيفه هنا إلى صفه فتظهر له دروس الصف.',
    manage ? `<button class="btn" data-create>${icon('plus')} حساب طالب</button>` : '') + `
    <section class="card">
      <div class="toolbar">
        <input class="input search" type="search" placeholder="ابحث بالاسم أو الهاتف أو البريد" data-q>
        <select class="input" data-class style="width:auto"></select>
        <select class="input" data-status style="width:auto"><option value="">كل الحالات</option><option value="active">نشط</option><option value="suspended">موقوف</option></select>
      </div>
      <div class="toolbar no-print" data-bulk hidden style="background:var(--green-soft)"><b data-sel></b>
        <select class="input" data-target style="width:auto"></select><button class="btn sm" data-assign>إضافة إلى الصف</button><button class="btn secondary sm" data-unassign>إزالة من الصف</button></div>
      <div class="table-wrap"><table class="table"><thead><tr>${manage ? '<th style="width:36px"><input type="checkbox" data-all aria-label="تحديد الكل"></th>' : ''}<th>الطالب</th><th>الصفوف</th><th>الهاتف</th><th>الدروس المكتملة</th><th>المعدل</th><th>آخر ظهور</th><th></th></tr></thead><tbody data-rows></tbody></table></div>
      <div class="pager" data-pager></div>
    </section>`;
  const rows = $('[data-rows]', root);
  const selected = new Set();
  const updateBulk = () => {
    $('[data-bulk]', root).hidden = !selected.size;
    $('[data-sel]', root).textContent = `${selected.size} محدد`;
  };
  async function load() {
    rows.innerHTML = loadingRows(6, 7);
    try {
      const r = await api('students.list', { classId: state.classId, q: state.q, status: state.status, page: state.page, pageSize: 50 });
      selected.clear(); updateBulk();
      rows.innerHTML = r.items.length ? r.items.map((s) => `<tr>
        ${manage ? `<td><input type="checkbox" data-pick="${esc(s.id)}" aria-label="تحديد ${esc(s.fullName)}"></td>` : ''}
        <td><a class="person" href="#/student?id=${esc(s.id)}" style="text-decoration:none;color:inherit"><span class="avatar">${initials(s.fullName)}</span><div><b>${esc(s.fullName)}</b><div class="small muted" dir="ltr" style="text-align:right">${esc(s.email)}</div></div></a></td>
        <td>${classChips(s, clsList)}</td>
        <td class="num small">${esc(s.phone || '—')}</td>
        <td class="num">${s.lessonsWatched}</td>
        <td class="num">${s.avgScore == null ? '—' : s.avgScore + '%'}</td>
        <td class="small">${fmtDateTime(s.lastSeenAt)} ${s.status !== 'active' ? statusBadge(s.status) : ''}</td>
        <td style="text-align:left">${manage ? `<button class="btn ${(s.classIds || []).length ? 'secondary' : ''} sm" data-one="${esc(s.id)}">${(s.classIds || []).length ? 'الصفوف' : 'إضافة لصف'}</button>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="8">${emptyState(state.classId === 'none' ? 'لا أحد بالانتظار' : 'لا طلاب', state.classId === 'none' ? 'كل الطلاب المسجلين مضافون إلى صفوفهم.' : 'عندما يسجّل الطلاب من التطبيق سيظهرون هنا.')}</td></tr>`;
      $('[data-pager]', root).innerHTML = `<span>${r.total} طالب</span><span style="display:flex;gap:6px;align-items:center"><button class="btn secondary sm" data-prev ${r.page <= 1 ? 'disabled' : ''}>السابق</button><span class="num">${r.page} / ${r.pages}</span><button class="btn secondary sm" data-next ${r.page >= r.pages ? 'disabled' : ''}>التالي</button></span>`;
      $('[data-prev]', root).onclick = () => { state.page--; load(); };
      $('[data-next]', root).onclick = () => { state.page++; load(); };
      $$('[data-pick]', root).forEach((c) => c.onchange = () => { c.checked ? selected.add(c.dataset.pick) : selected.delete(c.dataset.pick); updateBulk(); });
      $$('[data-one]', root).forEach((b) => b.onclick = async () => {
        if (await editClasses(r.items.find((x) => x.id === b.dataset.one), clsList)) { toast('حُفظت الصفوف'); badges(); load(); }
      });
      const all = $('[data-all]', root); if (all) { all.checked = false; all.onchange = () => { $$('[data-pick]', root).forEach((c) => { c.checked = all.checked; c.onchange(); }); }; }
    } catch (e) { rows.innerHTML = `<tr><td colspan="8">${emptyState('تعذّر التحميل', e.message)}</td></tr>`; }
  }
  (async () => {
    clsList = await classOptions().catch(() => []);
    $('[data-class]', root).innerHTML = `<option value="">كل الصفوف</option><option value="none" ${state.classId === 'none' ? 'selected' : ''}>⏳ بانتظار إضافتهم لصف</option>` +
      clsList.map((c) => `<option value="${esc(c.id)}" ${c.id === state.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('[data-target]', root).innerHTML = clsList.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    load();
  })();
  let t; $('[data-q]', root).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300); };
  $('[data-class]', root).onchange = (e) => { state.classId = e.target.value; state.page = 1; load(); };
  $('[data-status]', root).onchange = (e) => { state.status = e.target.value; state.page = 1; load(); };
  $('[data-assign]', root).onclick = async () => {
    await mutate('students.assign', { ids: [...selected], classId: $('[data-target]', root).value, mode: 'add' });
    toast('أُضيف الطلاب إلى الصف'); badges(); load();
  };
  $('[data-unassign]', root).onclick = async () => {
    const c = clsList.find((x) => x.id === $('[data-target]', root).value);
    if (!await confirmDialog('إزالة من الصف', `سيُزال ${selected.size} طالب من صف «${c?.name || ''}» فقط، وتبقى صفوفهم الأخرى.`, 'إزالة')) return;
    await mutate('students.assign', { ids: [...selected], classId: c.id, mode: 'remove' });
    toast('أُزيل الطلاب من الصف'); badges(); load();
  };
  $('[data-create]', root)?.addEventListener('click', async () => {
    const res = await dialog({ title: 'إنشاء حساب طالب', submitLabel: 'إنشاء',
      body: `<p class="small muted" style="margin-top:0">للطلاب الذين لا يستطيعون التسجيل بأنفسهم. ستظهر كلمة مرور مؤقتة لتسلّمها للطالب.</p>
        <div class="form-grid two">
          <div class="field"><label>الاسم الكامل *</label><input class="input" name="fullName" required></div>
          <div class="field"><label>البريد الإلكتروني *</label><input class="input" name="email" type="email" dir="ltr" required></div>
          <div class="field"><label>هاتف الطالب *</label><input class="input" name="phone" dir="ltr" required></div>
          <div class="field"><label>هاتف ولي الأمر</label><input class="input" name="guardianPhone" dir="ltr"></div>
          <div class="field" style="grid-column:1/-1"><label>الصفوف (صف أو أكثر)</label>${classChecks(clsList, state.classId && state.classId !== 'none' ? [state.classId] : [])}</div>
        </div>`,
      onSubmit: (f, d) => mutate('students.create', { ...f, classIds: $$('[name="cls"]:checked', d).map((x) => x.value) }) });
    if (!res) return;
    await showCredentials(res.email, res.password);
    load();
  });
}

// ════════════ ملف الطالب ════════════
export function studentDetail(root, params) {
  const id = params.get('id');
  return guarded(root, async () => {
    const [s, clsList] = await Promise.all([api('students.get', { id }, { fresh: true }), classOptions()]);
    const manage = can('students.manage');
    root.innerHTML = head('ملف الطالب', s.fullName, s.email, `<a class="btn ghost" href="#/students">رجوع</a>`) + `
      <div class="grid cols-main">
        <div class="grid" style="align-content:start">
          <section class="card"><div class="card-head"><h3>تقدّم الدروس</h3><span class="small muted"><bdi dir="ltr">${s.lessons.filter((l) => l.completed).length} / ${s.lessons.length}</bdi> مكتمل</span></div>
            ${s.lessons.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>الدرس</th><th>الصف / الوحدة</th><th style="width:200px">المشاهدة</th><th>آخر مشاهدة</th></tr></thead><tbody>
              ${s.lessons.map((l) => `<tr><td>${esc(l.title)} ${l.completed ? '<span class="badge ok">مكتمل</span>' : ''}</td><td class="small muted">${esc([l.className, l.unit].filter(Boolean).join(' · ') || '—')}</td><td>${pct(l.percent)}</td><td class="small">${fmtDateTime(l.lastAt)}</td></tr>`).join('')}
            </tbody></table></div>` : emptyState('لا دروس', (s.classIds || []).length ? 'لم تُنشر دروس لصفوفه بعد.' : 'الطالب غير مضاف إلى أي صف.')}
          </section>
          <section class="card"><div class="card-head"><h3>الاختبارات والواجبات</h3></div>
            ${s.submissions.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>العنوان</th><th>النوع</th><th>الحالة</th><th>العلامة</th><th>التسليم</th></tr></thead><tbody>
              ${s.submissions.map((x) => `<tr><td>${esc(x.title)}</td><td>${x.kind === 'mcq' ? 'اختيار من متعدد' : 'ورقي'}</td>
                <td>${x.status === 'graded' ? '<span class="badge ok">مصحح</span>' : x.status === 'submitted' ? `<a class="badge warn" href="#/grade?id=${esc(x.id)}">بانتظار التصحيح</a>` : '<span class="badge">قيد الحل</span>'} ${x.late ? '<span class="badge bad">متأخر</span>' : ''}</td>
                <td class="num">${x.score == null ? '—' : `${x.score} / ${x.maxScore}`}</td><td class="small">${fmtDateTime(x.submittedAt)}</td></tr>`).join('')}
            </tbody></table></div>` : emptyState('لا تسليمات', 'لم يبدأ الطالب أي اختبار أو واجب بعد.')}
          </section>
        </div>
        <div class="grid" style="align-content:start">
          <section class="card card-pad">
            <h3 style="margin-bottom:12px">البيانات</h3>
            <dl class="kv" style="grid-template-columns:110px 1fr">
              <dt>الصفوف</dt><dd>${classChips(s, clsList)}</dd>
              <dt>الهاتف</dt><dd class="num">${esc(s.phone || '—')}</dd>
              <dt>ولي الأمر</dt><dd class="num">${esc(s.guardianPhone || '—')}</dd>
              <dt>الحالة</dt><dd>${statusBadge(s.status)}</dd>
              <dt>تاريخ التسجيل</dt><dd class="small">${fmtDate(s.createdAt)}</dd>
              <dt>آخر ظهور</dt><dd class="small">${fmtDateTime(s.lastSeenAt)}</dd>
              <dt>ملاحظات</dt><dd class="small">${esc(s.notes || '—')}</dd>
            </dl>
            ${manage ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:16px"><button class="btn sm" data-class>${icon('board', 16)} الصفوف</button><button class="btn secondary sm" data-edit>${icon('edit', 16)} تعديل</button></div>` : ''}
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:12px">${icon('device')} الجهاز والأمان</h3>
            ${s.deviceBound ? `<p style="margin:0 0 6px">الحساب مقفول على جهاز واحد${s.deviceInfo ? `: <b>${esc(s.deviceInfo)}</b>` : ''}</p><p class="small muted" style="margin:0 0 12px">منذ ${fmtDateTime(s.deviceBoundAt)}</p>`
              : '<p class="small muted" style="margin:0 0 12px">لم يُربط بجهاز بعد — سيُقفل على أول جهاز يدخل منه.</p>'}
            <p class="small muted">جلسات نشطة: <b class="num">${s.activeSessions}</b></p>
            ${manage ? `<div style="display:grid;gap:8px">
              ${s.deviceBound ? '<button class="btn secondary sm" data-reset>فك قفل الجهاز (غيّر هاتفه)</button>' : ''}
              <button class="btn secondary sm" data-pass>${icon('key', 16)} كلمة مرور مؤقتة</button>
              <button class="btn ${s.status === 'active' ? 'danger' : ''} sm" data-status>${s.status === 'active' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}</button></div>` : ''}
          </section>
        </div>
      </div>`;
    if (!manage) return;
    const again = () => studentDetail(root, params);
    $('[data-class]', root).onclick = async () => {
      if (await editClasses(s, clsList)) { toast('حُفظت الصفوف'); badges(); again(); }
    };
    $('[data-edit]', root).onclick = async () => {
      const r = await formDialog({ title: 'تعديل بيانات الطالب', values: s, fields: [
        { name: 'fullName', label: 'الاسم الكامل', required: true }, { name: 'phone', label: 'هاتف الطالب', ltr: true },
        { name: 'guardianPhone', label: 'هاتف ولي الأمر', ltr: true }, { name: 'notes', label: 'ملاحظات خاصة (لا يراها الطالب)', type: 'textarea', rows: 3 }],
        onSubmit: (f) => mutate('students.update', { id: s.id, ...f }) });
      if (r) { toast('حُفظت البيانات'); again(); }
    };
    $('[data-reset]', root)?.addEventListener('click', async () => {
      if (!await confirmDialog('فك قفل الجهاز', 'سيُسجَّل خروج الطالب من جهازه الحالي، ويُقفل الحساب على أول جهاز يدخل منه بعد ذلك.', 'فك القفل', false)) return;
      await mutate('students.resetDevice', { id: s.id }); toast('فُك القفل'); again();
    });
    $('[data-pass]', root).onclick = async () => {
      if (!await confirmDialog('كلمة مرور مؤقتة', 'سيتم إنشاء كلمة مرور جديدة وإلغاء كلمة المرور الحالية وتسجيل خروج الطالب.', 'إنشاء', false)) return;
      const r = await mutate('students.setPassword', { id: s.id });
      await showCredentials(r.email, r.password); again();
    };
    $('[data-status]', root).onclick = async () => {
      const to = s.status === 'active' ? 'suspended' : 'active';
      if (to === 'suspended' && !await confirmDialog('إيقاف الحساب', 'لن يستطيع الطالب الدخول إلى التطبيق حتى تعيد تفعيله.', 'إيقاف')) return;
      await mutate('students.setStatus', { id: s.id, status: to }); toast('تم'); again();
    };
  });
}

// ════════════ الدروس ════════════
export function lessons(root, params) {
  return guarded(root, async () => {
    const clsList = await classOptions();
    if (!clsList.length) {
      root.innerHTML = head('المحتوى', 'الدروس والفيديوهات', '') + `<div class="card">${emptyState('أنشئ صفاً أولاً', 'الدروس تُرفع لكل صف على حدة.', '<a class="btn" href="#/classes">الصفوف</a>')}</div>`;
      return;
    }
    const classId = params.get('classId') || localStorage.getItem('math_last_class') || clsList[0].id;
    const cls = clsList.find((c) => c.id === classId) || clsList[0];
    localStorage.setItem('math_last_class', cls.id);
    const r = await api('lessons.list', { classId: cls.id }, { fresh: true });
    const units = [];
    r.items.forEach((l) => { const u = l.unit || 'بدون وحدة'; let g = units.find((x) => x.name === u); if (!g) units.push(g = { name: u, items: [] }); g.items.push(l); });
    root.innerHTML = head('المحتوى', 'الدروس والفيديوهات', 'فيديو يوتيوب (غير مدرج) أو ملف Drive، مع ملفات PDF مرفقة. لا يمكن للطالب تنزيلها أو تصويرها.',
      `<button class="btn" data-new>${icon('plus')} درس جديد</button>`) + `
      <div class="segmented" style="margin-bottom:18px;flex-wrap:wrap" role="tablist">${clsList.map((c) => `<button aria-pressed="${c.id === cls.id}" data-cls="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
      ${r.items.length ? `<div class="units">${units.map((u) => `<section class="module"><div class="module-head"><span class="ornament"></span><h4>${esc(u.name)}</h4><span class="small muted">${u.items.length} درس</span></div>
        ${u.items.map((l) => `<div class="lesson-row">
          <span class="icon-btn" style="pointer-events:none;color:${l.videoProvider ? 'var(--brass)' : 'var(--stone)'}">${icon(l.videoProvider ? 'video' : 'file')}</span>
          <div class="t"><b>${esc(l.title)}</b><div class="tags">${l.status === 'published' ? '<span class="badge ok">منشور</span>' : '<span class="badge warn">مسودة</span>'}
            ${l.videoProvider ? `<span class="mini">${l.videoProvider === 'youtube' ? 'YouTube' : 'Drive'}${l.durationSec ? ' · ' + Math.round(l.durationSec / 60) + ' د' : ''}</span>` : ''}
            ${l.attachments.length ? `<span class="mini">${l.attachments.length} ملف</span>` : ''}
            <span class="mini">أكمله ${l.completedBy} من ${r.classStudents}</span></div></div>
          <button class="icon-btn" title="أعلى" data-up="${esc(l.id)}">${icon('up')}</button><button class="icon-btn" title="أسفل" data-down="${esc(l.id)}">${icon('down')}</button>
          <button class="icon-btn" title="من شاهد" data-viewers="${esc(l.id)}">${icon('eye')}</button>
          <button class="icon-btn" title="تعديل" data-edit="${esc(l.id)}">${icon('edit')}</button>
          <button class="icon-btn" title="حذف" data-del="${esc(l.id)}">${icon('trash')}</button></div>`).join('')}</section>`).join('')}</div>`
        : `<div class="card">${emptyState('لا دروس في ' + cls.name, 'أضف أول درس: عنوان، رابط الفيديو، وملف PDF إن وجد.', '<button class="btn" data-new>إضافة درس</button>')}</div>`}`;
    const reload = () => lessons(root, new URLSearchParams({ classId: cls.id }));
    $$('[data-cls]', root).forEach((b) => b.onclick = () => { location.hash = '#/lessons?classId=' + b.dataset.cls; });
    $$('[data-new]', root).forEach((b) => b.onclick = () => lessonDialog(null));
    $$('[data-edit]', root).forEach((b) => b.onclick = () => lessonDialog(r.items.find((x) => x.id === b.dataset.edit)));
    $$('[data-del]', root).forEach((b) => b.onclick = async () => {
      const l = r.items.find((x) => x.id === b.dataset.del);
      if (!await confirmDialog('حذف الدرس', `سيُحذف «${l.title}» وتقدّم الطلاب فيه. الملفات المرفقة تبقى في مكتبة الملفات.`, 'حذف')) return;
      await mutate('lessons.delete', { id: l.id }); toast('حُذف الدرس'); reload();
    });
    const move = async (id, d) => {
      const ids = r.items.map((x) => x.id); const i = ids.indexOf(id); const j = i + d;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await mutate('lessons.reorder', { classId: cls.id, ids }); reload();
    };
    $$('[data-up]', root).forEach((b) => b.onclick = () => move(b.dataset.up, -1));
    $$('[data-down]', root).forEach((b) => b.onclick = () => move(b.dataset.down, 1));
    $$('[data-viewers]', root).forEach((b) => b.onclick = async () => {
      const v = await api('lessons.viewers', { id: b.dataset.viewers }, { fresh: true });
      dialog({ title: 'مشاهدات: ' + v.lesson.title, submitLabel: 'إغلاق', onSubmit: () => true,
        body: v.items.length ? `<table class="table"><thead><tr><th>الطالب</th><th style="width:160px">المشاهدة</th><th>آخر مشاهدة</th></tr></thead><tbody>${v.items.map((x) => `<tr><td>${esc(x.fullName)} ${x.completed ? '<span class="badge ok">مكتمل</span>' : ''}</td><td>${pct(x.percent)}</td><td class="small">${fmtDateTime(x.lastAt)}</td></tr>`).join('')}</tbody></table>` : '<p>لا طلاب في هذا الصف.</p>' });
    });

    async function lessonDialog(l) {
      const media = await api('media.list', { pageSize: 200 }).catch(() => ({ items: [] }));
      const picked = new Set(l?.attachmentIds || []);
      const unitNames = [...new Set(r.items.map((x) => x.unit).filter(Boolean))];
      const attHtml = () => media.items.length ? media.items.map((m) => `<label class="check"><input type="checkbox" name="att" value="${esc(m.id)}" ${picked.has(m.id) ? 'checked' : ''}> <span>${icon(m.kind === 'pdf' ? 'file' : 'image', 16)} ${esc(m.title)} <span class="small muted">${fmtSize(m.sizeBytes)}</span></span></label>`).join('') : '<span class="small muted">لا ملفات بعد. ارفع ملفاً من الزر أدناه.</span>';
      const pr = dialog({ title: l ? 'تعديل الدرس' : 'درس جديد في ' + cls.name, submitLabel: 'حفظ',
        body: `<div class="form-grid two">
          <div class="field"><label>عنوان الدرس *</label><input class="input" name="title" value="${esc(l?.title || '')}" required placeholder="مثال: حل المعادلات من الدرجة الثانية"></div>
          <div class="field"><label>الوحدة</label><input class="input" name="unit" value="${esc(l?.unit || '')}" list="units-dl" placeholder="مثال: الجبر"><datalist id="units-dl">${unitNames.map((u) => `<option value="${esc(u)}">`).join('')}</datalist></div>
          <div class="field" style="grid-column:1/-1"><label>رابط الفيديو</label><input class="input" name="videoUrl" dir="ltr" value="${esc(l?.videoUrl || '')}" placeholder="https://youtu.be/… أو https://drive.google.com/file/d/…">
            <div class="hint">يوتيوب: اجعل الفيديو «غير مدرج» (Unlisted). Drive: شارك الملف «لأي شخص لديه الرابط — عارض». يُعرض داخل التطبيق فقط مع علامة مائية.</div></div>
          <div class="field"><label>مدة الفيديو (دقائق)</label><input class="input" type="number" min="0" step="1" name="durationMin" dir="ltr" value="${l?.durationSec ? Math.round(l.durationSec / 60) : ''}"><div class="hint">مهمة لفيديوهات Drive لحساب نسبة المشاهدة.</div></div>
          <div class="field"><label>الحالة</label><select class="input" name="status"><option value="published" ${l?.status !== 'draft' ? 'selected' : ''}>منشور — يظهر للطلاب الآن</option><option value="draft" ${l?.status === 'draft' ? 'selected' : ''}>مسودة</option></select></div>
          <div class="field" style="grid-column:1/-1"><label>شرح / ملاحظات للطالب</label><textarea class="input" name="description" rows="3">${esc(l?.description || '')}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>ملفات مرفقة (PDF أو صور)</label><div class="checks" data-atts>${attHtml()}</div>
            <div style="margin-top:8px"><label class="btn secondary sm" style="cursor:pointer">${icon('upload', 16)} رفع ملف جديد<input type="file" accept="application/pdf,image/*" hidden data-up-file></label> <span class="small muted" data-up-state></span></div></div>
        </div>`,
        onSubmit: (f, d) => {
          if (!f.title) throw new Error('اكتب عنوان الدرس.');
          const atts = $$('[name="att"]:checked', d).map((x) => x.value);
          return mutate('lessons.save', { id: l?.id, classId: cls.id, title: f.title, unit: f.unit, videoUrl: f.videoUrl, durationMin: Number(f.durationMin) || 0, status: f.status, description: f.description, attachmentIds: atts });
        } });
      const dlg = $$('dialog.dialog').pop();
      $('[data-up-file]', dlg).onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const st = $('[data-up-state]', dlg);
        st.textContent = 'جارٍ الرفع…';
        try {
          const b64 = await readFileBase64(file, 25);
          const m = await mutate('media.upload', { fileName: file.name, mimeType: file.type, base64: b64, title: file.name.replace(/\.[^.]+$/, '') });
          const box = $('[data-atts]', dlg);
          if (box.querySelector('.small.muted')) box.innerHTML = '';
          box.insertAdjacentHTML('afterbegin', `<label class="check"><input type="checkbox" name="att" value="${esc(m.id)}" checked> <span>${icon(m.kind === 'pdf' ? 'file' : 'image', 16)} ${esc(m.title)}</span></label>`);
          st.textContent = 'رُفع ✓';
        } catch (ex) { st.textContent = ex.message; }
        e.target.value = '';
      };
      const res = await pr;
      if (res) { toast(l ? 'حُفظ الدرس' : 'أُضيف الدرس' + (res.status === 'published' ? ' ووصل إشعار للطلاب' : '')); reload(); }
    }
  });
}

// ════════════ الملفات ════════════
export function files(root) {
  const state = { q: '', kind: '' };
  root.innerHTML = head('المحتوى', 'الملفات', 'ملفات PDF والصور خاصة ومحمية: لا روابط عامة، ويعرضها التطبيق فقط لطلاب الصف المرفقة بدرسه.',
    `<label class="btn" style="cursor:pointer">${icon('upload')} رفع ملفات<input type="file" accept="application/pdf,image/*" multiple hidden data-file></label>`) + `
    <section class="card"><div class="toolbar"><input class="input search" type="search" placeholder="بحث بالاسم" data-q>
      <select class="input" data-kind style="width:auto"><option value="">الكل</option><option value="pdf">PDF</option><option value="image">صور</option></select><span class="small muted" data-state></span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>الملف</th><th>الحجم</th><th>مستخدم في</th><th>تاريخ الرفع</th><th></th></tr></thead><tbody data-rows></tbody></table></div></section>`;
  const rows = $('[data-rows]', root);
  async function load() {
    rows.innerHTML = loadingRows(4, 5);
    const r = await api('media.list', { q: state.q, kind: state.kind, pageSize: 200 });
    rows.innerHTML = r.items.length ? r.items.map((m) => `<tr><td>${icon(m.kind === 'pdf' ? 'file' : 'image', 16)} <b>${esc(m.title)}</b></td><td class="small num">${fmtSize(m.sizeBytes)}</td>
      <td class="small muted">${m.usedIn.length ? esc(m.usedIn.join('، ')) : 'غير مستخدم'}</td><td class="small">${fmtDate(m.createdAt)}</td>
      <td style="text-align:left"><button class="btn ghost sm" data-open="${esc(m.id)}">${icon('eye', 16)}</button><button class="btn danger sm" data-del="${esc(m.id)}">${icon('trash', 16)}</button></td></tr>`).join('')
      : `<tr><td colspan="5">${emptyState('لا ملفات', 'ارفع ملزمات PDF وصوراً لإرفاقها بالدروس والاختبارات.')}</td></tr>`;
    $$('[data-del]', rows).forEach((b) => b.onclick = async () => {
      if (!await confirmDialog('حذف الملف', 'سيُزال من الدروس المرفق بها ويُحذف من Drive.', 'حذف')) return;
      try { await mutate('media.delete', { id: b.dataset.del }); toast('حُذف'); load(); } catch (e) { toast(e.message, 'error'); }
    });
    $$('[data-open]', rows).forEach((b) => b.onclick = async () => {
      const f = await api('files.get', { mediaAssetId: b.dataset.open });
      const bin = atob(f.base64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.open(URL.createObjectURL(new Blob([bytes], { type: f.mimeType })), '_blank');
    });
  }
  let t; $('[data-q]', root).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300); };
  $('[data-kind]', root).onchange = (e) => { state.kind = e.target.value; load(); };
  $('[data-file]', root).onchange = async (e) => {
    const list = [...e.target.files]; const st = $('[data-state]', root);
    for (let i = 0; i < list.length; i++) {
      st.textContent = `جارٍ رفع ${i + 1} من ${list.length}…`;
      try { const b64 = await readFileBase64(list[i], 25); await mutate('media.upload', { fileName: list[i].name, mimeType: list[i].type, base64: b64, title: list[i].name.replace(/\.[^.]+$/, '') }); }
      catch (ex) { toast(list[i].name + ': ' + ex.message, 'error'); }
    }
    st.textContent = ''; e.target.value = ''; toast('اكتمل الرفع'); load();
  };
  load().catch((e) => { rows.innerHTML = `<tr><td colspan="5">${emptyState('تعذّر التحميل', e.message)}</td></tr>`; });
}
