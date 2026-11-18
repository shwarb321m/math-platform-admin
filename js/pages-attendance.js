// التفقد للصف الحضوري (منفصل عن التطبيق): المجموعات والأسماء، أخذ التفقد، التقارير القابلة للطباعة.
import { api, mutate } from './api.js';
import { esc, $, $$, toast, dialog, formDialog, confirmDialog, emptyState, icon, head, guarded, CLASS_COLORS, fmtDay, todayYmd, fmtDateTime } from './ui.js';

const STATUSES = [['present', 'حاضر', 'ح'], ['absent', 'غائب', 'غ'], ['late', 'متأخر', 'م'], ['excused', 'بعذر', 'ع']];
const LABEL = Object.fromEntries(STATUSES.map(([k, l]) => [k, l]));
const SHORT = Object.fromEntries(STATUSES.map(([k, , s]) => [k, s]));
const rateCls = (r) => (r == null ? '' : r < 60 ? 'lo' : r < 85 ? 'mid' : 'hi');
const rate = (r) => `<span class="rate ${rateCls(r)}">${r == null ? '—' : r + '%'}</span>`;

async function groupList() { return (await api('attendance.groups', {})).items; }
const lastGroup = (items, wanted) => items.find((g) => g.id === wanted) || items.find((g) => g.id === localStorage.getItem('math_att_group')) || items[0];
const noGroups = (root, title) => {
  root.innerHTML = head('التفقد', title, '') + `<div class="card">${emptyState('أنشئ مجموعة أولاً', 'المجموعة = صف حضوري أو شعبة (مثال: بكالوريا — السبت والثلاثاء 4 م). ثم أضف أسماء الطلاب.', '<a class="btn" href="#/groups">إنشاء مجموعة</a>')}</div>`;
};

// ════════════ أخذ التفقد ════════════
export function take(root, params) {
  return guarded(root, async () => {
    const groups = await groupList();
    if (!groups.length) return noGroups(root, 'أخذ التفقد');
    const g = lastGroup(groups, params.get('groupId'));
    localStorage.setItem('math_att_group', g.id);
    const date = params.get('date') || todayYmd();
    const s = await api('attendance.session', { groupId: g.id, date }, { fresh: true });
    const marks = Object.fromEntries(s.items.map((x) => [x.studentId, x.status]));
    root.innerHTML = head('التفقد', 'أخذ التفقد', 'اضغط الحالة بجانب كل اسم ثم احفظ. يمكنك تعديل أي يوم سابق بتغيير التاريخ.',
      `<a class="btn secondary" href="#/reports?groupId=${esc(g.id)}">${icon('print')} التقرير</a>`) + `
      <section class="card" style="margin-bottom:16px"><div class="toolbar" style="border:0">
        <select class="input" data-group style="width:auto">${groups.map((x) => `<option value="${esc(x.id)}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <input class="input" type="date" data-date value="${esc(date)}" style="width:auto" dir="ltr">
        <span class="small muted">${fmtDay(date)}${s.session ? ' · <span class="badge ok">مسجّل</span>' : ' · <span class="badge plain">جلسة جديدة</span>'}</span>
        <input class="input" data-topic placeholder="موضوع الحصة (اختياري)" value="${esc(s.session?.topic || '')}" style="flex:1;min-width:200px">
      </div></section>
      ${s.items.length ? `<section class="card">
        <div class="toolbar" style="justify-content:space-between"><div class="att-summary" data-sum></div>
          <div style="display:flex;gap:6px"><button class="btn secondary sm" data-allp>${icon('check', 16)} الكل حاضر</button><button class="btn ghost sm" data-clear>مسح</button></div></div>
        <div class="att-list">${s.items.map((x, i) => `<div class="att-row" data-row="${esc(x.studentId)}"><span class="idx">${i + 1}</span><span class="n">${esc(x.fullName)}</span>
          <div class="att-btns">${STATUSES.map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${x.status === k}">${l}</button>`).join('')}</div></div>`).join('')}</div>
        <div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0;justify-content:flex-end"><span class="small muted" data-dirty></span><button class="btn" data-save>${icon('check')} حفظ التفقد</button></div>
      </section>${s.session ? `<p style="margin-top:12px"><button class="btn ghost sm" data-delses>${icon('trash', 16)} حذف تفقد هذا اليوم</button></p>` : ''}`
        : `<div class="card">${emptyState('لا أسماء في هذه المجموعة', 'أضف أسماء الطلاب أولاً (يمكن لصق قائمة كاملة دفعة واحدة).', `<a class="btn" href="#/groups?groupId=${esc(g.id)}">إضافة الأسماء</a>`)}</div>`}`;
    const go = (p) => { location.hash = '#/attendance?' + new URLSearchParams({ groupId: g.id, date, ...p }); };
    $('[data-group]', root).onchange = (e) => go({ groupId: e.target.value });
    $('[data-date]', root).onchange = (e) => e.target.value && go({ date: e.target.value });
    if (!s.items.length) return;
    let dirty = false;
    const sum = () => {
      const c = { present: 0, absent: 0, late: 0, excused: 0, '': 0 };
      Object.values(marks).forEach((v) => { c[v || '']++; });
      $('[data-sum]', root).innerHTML = STATUSES.map(([k, l]) => `<span><span class="cell ${k}">${SHORT[k]}</span> ${l}: <b>${c[k]}</b></span>`).join('') + (c[''] ? `<span class="muted">بدون تحديد: <b>${c['']}</b></span>` : '');
      $('[data-dirty]', root).textContent = dirty ? 'تغييرات غير محفوظة' : '';
    };
    const paint = (id) => $$(`[data-row="${CSS.escape(id)}"] [data-s]`, root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === marks[id])));
    $$('.att-row', root).forEach((row) => row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const id = row.dataset.row; marks[id] = marks[id] === b.dataset.s ? '' : b.dataset.s; dirty = true; paint(id); sum();
    }));
    $('[data-allp]', root).onclick = () => { Object.keys(marks).forEach((id) => { if (!marks[id]) marks[id] = 'present'; paint(id); }); dirty = true; sum(); };
    $('[data-clear]', root).onclick = () => { Object.keys(marks).forEach((id) => { marks[id] = ''; paint(id); }); dirty = true; sum(); };
    $('[data-save]', root).onclick = async (e) => {
      e.target.classList.add('loading');
      try {
        await mutate('attendance.saveSession', { groupId: g.id, date, topic: $('[data-topic]', root).value.trim(), marks: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })) });
        dirty = false; toast('حُفظ التفقد'); take(root, new URLSearchParams({ groupId: g.id, date }));
      } catch (ex) { toast(ex.message, 'error'); } finally { e.target.classList.remove('loading'); }
    };
    $('[data-delses]', root)?.addEventListener('click', async () => {
      if (!await confirmDialog('حذف تفقد اليوم', `سيُحذف تفقد ${fmtDay(date)} بالكامل.`, 'حذف')) return;
      await mutate('attendance.deleteSession', { id: s.session.id }); toast('حُذف'); take(root, new URLSearchParams({ groupId: g.id, date }));
    });
    sum();
  });
}

// ════════════ المجموعات والأسماء ════════════
export function groups(root, params) {
  return guarded(root, async () => {
    const items = (await api('attendance.groups', { all: true }, { fresh: true })).items;
    const g = items.length ? lastGroup(items, params.get('groupId')) : null;
    if (g) localStorage.setItem('math_att_group', g.id);
    const roster = g ? (await api('attendance.students', { groupId: g.id, includeLeft: true }, { fresh: true })).items : [];
    root.innerHTML = head('التفقد', 'المجموعات والأسماء', 'قسم منفصل عن التطبيق لطلاب الصف الحضوري. لا يحتاج الطالب حساباً.',
      `<button class="btn" data-newg>${icon('plus')} مجموعة جديدة</button>`) +
      (!g ? `<div class="card">${emptyState('لا مجموعات', 'أنشئ مجموعة لكل صف أو شعبة تدرّسها حضورياً.', '<button class="btn" data-newg>إنشاء مجموعة</button>')}</div>` : `
      <div class="segmented" style="margin-bottom:18px;flex-wrap:wrap">${items.map((x) => `<button aria-pressed="${x.id === g.id}" data-g="${esc(x.id)}">${esc(x.name)} <span class="small num">(${x.students})</span>${x.status === 'archived' ? ' · مؤرشفة' : ''}</button>`).join('')}</div>
      <div class="grid cols-main" style="align-items:start">
        <section class="card"><div class="card-head"><h3>الأسماء <span class="small muted num">(${roster.filter((s) => s.status !== 'left').length})</span></h3>
          <div style="display:flex;gap:6px"><button class="btn sm" data-add>${icon('plus', 16)} اسم</button><button class="btn secondary sm" data-bulk>لصق قائمة</button><button class="btn secondary sm" data-import>من صف بالتطبيق</button></div></div>
          ${roster.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>ولي الأمر</th><th></th></tr></thead><tbody>
          ${roster.map((s, i) => `<tr ${s.status === 'left' ? 'style="opacity:.55"' : ''}><td class="num small">${i + 1}</td><td><b>${esc(s.fullName)}</b>${s.linkedUserId ? ' <span class="mini">مسجّل بالتطبيق</span>' : ''}${s.status === 'left' ? ' <span class="badge">غادر</span>' : ''}${s.notes ? `<div class="small muted">${esc(s.notes)}</div>` : ''}</td>
            <td class="num small">${esc(s.phone || '—')}</td><td class="num small">${esc(s.guardianPhone || '—')}</td>
            <td style="text-align:left;white-space:nowrap"><a class="icon-btn" href="#/reports?groupId=${esc(g.id)}&studentId=${esc(s.id)}" title="تقرير الطالب">${icon('print')}</a><button class="icon-btn" data-edit="${esc(s.id)}" title="تعديل">${icon('edit')}</button><button class="icon-btn" data-del="${esc(s.id)}" title="حذف">${icon('trash')}</button></td></tr>`).join('')}
          </tbody></table></div>` : emptyState('لا أسماء', 'أضف الأسماء واحداً واحداً، أو الصق قائمة كاملة من Excel أو واتساب.')}
        </section>
        <section class="card card-pad"><h3 style="margin-bottom:10px">${esc(g.name)}</h3>
          <dl class="kv" style="grid-template-columns:90px 1fr"><dt>المواعيد</dt><dd>${esc(g.schedule || '—')}</dd><dt>الطلاب</dt><dd class="num">${g.students}</dd><dt>الجلسات</dt><dd class="num">${g.sessions}</dd></dl>
          <div style="display:grid;gap:8px;margin-top:16px"><a class="btn" href="#/attendance?groupId=${esc(g.id)}">${icon('att', 16)} أخذ التفقد</a>
            <button class="btn secondary sm" data-editg>${icon('edit', 16)} تعديل المجموعة</button><button class="btn danger sm" data-delg>${g.sessions ? 'أرشفة المجموعة' : 'حذف المجموعة'}</button></div>
        </section>
      </div>`);
    const reload = (id) => groups(root, new URLSearchParams(id ? { groupId: id } : {}));
    const groupDialog = async (x) => {
      const r = await dialog({ title: x ? 'تعديل المجموعة' : 'مجموعة جديدة', submitLabel: 'حفظ',
        body: `<div class="field"><label>الاسم *</label><input class="input" name="name" value="${esc(x?.name || '')}" required placeholder="مثال: بكالوريا علمي — المجموعة أ"></div>
          <div class="field"><label>المواعيد</label><input class="input" name="schedule" value="${esc(x?.schedule || '')}" placeholder="السبت والثلاثاء 4:00 م"></div>
          <input type="hidden" name="color" value="${esc(x?.color || CLASS_COLORS[items.length % CLASS_COLORS.length])}">
          ${x ? `<label class="check"><input type="checkbox" name="archived" ${x.status === 'archived' ? 'checked' : ''}> <span>مؤرشفة (تختفي من أخذ التفقد)</span></label>` : ''}`,
        onSubmit: (f, d) => { if (!f.name) throw new Error('اكتب الاسم.'); return mutate('attendance.saveGroup', { id: x?.id, name: f.name, schedule: f.schedule, color: f.color, status: x && $('[name="archived"]', d)?.checked ? 'archived' : 'active' }); } });
      if (r) { toast('حُفظت المجموعة'); reload(r.id); }
    };
    $$('[data-newg]', root).forEach((b) => b.onclick = () => groupDialog(null));
    if (!g) return;
    $$('[data-g]', root).forEach((b) => b.onclick = () => reload(b.dataset.g));
    $('[data-editg]', root).onclick = () => groupDialog(g);
    $('[data-delg]', root).onclick = async () => {
      if (g.sessions) { await mutate('attendance.saveGroup', { id: g.id, name: g.name, schedule: g.schedule, color: g.color, status: 'archived' }); toast('أُرشفت المجموعة'); return reload(); }
      if (!await confirmDialog('حذف المجموعة', 'ستُحذف المجموعة وأسماؤها.', 'حذف')) return;
      await mutate('attendance.deleteGroup', { id: g.id }); toast('حُذفت'); localStorage.removeItem('math_att_group'); reload();
    };
    const studentDialog = async (s) => {
      const r = await formDialog({ title: s ? 'تعديل الاسم' : 'إضافة طالب', fields: [
        { name: 'fullName', label: 'الاسم الكامل', required: true }, { name: 'phone', label: 'هاتف الطالب', ltr: true },
        { name: 'guardianPhone', label: 'هاتف ولي الأمر', ltr: true }, { name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2 },
        ...(s ? [{ name: 'left', label: 'غادر المجموعة (يبقى في التقارير القديمة)', type: 'checkbox' }] : [])],
        values: s ? { ...s, left: s.status === 'left' } : {},
        onSubmit: (f) => { if (!f.fullName) throw new Error('اكتب الاسم.'); return mutate('attendance.saveStudent', { id: s?.id, groupId: g.id, fullName: f.fullName, phone: f.phone, guardianPhone: f.guardianPhone, notes: f.notes, status: f.left ? 'left' : 'active' }); } });
      if (r) { toast('حُفظ'); reload(g.id); }
    };
    $('[data-add]', root).onclick = () => studentDialog(null);
    $$('[data-edit]', root).forEach((b) => b.onclick = () => studentDialog(roster.find((x) => x.id === b.dataset.edit)));
    $$('[data-del]', root).forEach((b) => b.onclick = async () => {
      if (!await confirmDialog('حذف الاسم', 'إن كان له تفقد سابق سيُعلَّم «غادر» ويبقى في التقارير.', 'حذف')) return;
      await mutate('attendance.deleteStudent', { id: b.dataset.del }); toast('تم'); reload(g.id);
    });
    $('[data-bulk]', root).onclick = async () => {
      const r = await dialog({ title: 'لصق قائمة أسماء', submitLabel: 'إضافة',
        body: `<p class="small muted" style="margin-top:0">اسم في كل سطر. يمكن إضافة الهاتف بعد فاصلة: <span class="num">أحمد علي، 0999123456</span>. الأسماء المكررة تُتجاهل.</p>
          <textarea class="input" name="text" rows="12" placeholder="أحمد علي&#10;ليلى حسن، 0933000000&#10;…" required></textarea>`,
        onSubmit: (f) => { if (!f.text) throw new Error('الصق الأسماء.'); return mutate('attendance.bulkAdd', { groupId: g.id, text: f.text }); } });
      if (r) { toast(`أُضيف ${r.added} اسم`); reload(g.id); }
    };
    $('[data-import]', root).onclick = async () => {
      const cls = await api('classes.list');
      if (!cls.items.length) return toast('لا توجد صفوف في التطبيق بعد.', 'error');
      const r = await dialog({ title: 'استيراد من صف بالتطبيق', submitLabel: 'استيراد',
        body: `<p class="small muted" style="margin-top:0">ينسخ أسماء طلاب الصف المسجلين في التطبيق إلى هذه المجموعة (بدون تكرار).</p>
          <div class="field"><label>الصف</label><select class="input" name="classId">${cls.items.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students})</option>`).join('')}</select></div>`,
        onSubmit: (f) => mutate('attendance.importClass', { groupId: g.id, classId: f.classId }) });
      if (r) { toast(`أُضيف ${r.added} اسم`); reload(g.id); }
    };
  });
}

// ════════════ التقارير ════════════
export function reports(root, params) {
  return guarded(root, async () => {
    const groupsAll = (await api('attendance.groups', { all: true })).items;
    if (!groupsAll.length) return noGroups(root, 'تقارير التفقد');
    const g = lastGroup(groupsAll, params.get('groupId'));
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const from = params.get('from') || first, to = params.get('to') || todayYmd();
    const studentId = params.get('studentId');
    const set = (p) => { location.hash = '#/reports?' + new URLSearchParams({ groupId: g.id, from, to, ...p }); };
    const controls = `<section class="card no-print" style="margin-bottom:16px"><div class="toolbar" style="border:0">
      <select class="input" data-group style="width:auto">${groupsAll.map((x) => `<option value="${esc(x.id)}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <label class="small">من <input class="input" type="date" data-from value="${esc(from)}" dir="ltr" style="width:auto"></label>
      <label class="small">إلى <input class="input" type="date" data-to value="${esc(to)}" dir="ltr" style="width:auto"></label>
      <div class="segmented"><button data-range="month">هذا الشهر</button><button data-range="last">الشهر الماضي</button><button data-range="all">الكل</button></div>
      <button class="btn" data-print style="margin-inline-start:auto">${icon('print')} طباعة / PDF</button>${studentId ? '<button class="btn secondary" data-back>تقرير المجموعة</button>' : ''}</div></section>`;
    if (studentId) {
      const r = await api('attendance.studentReport', { studentId, from, to }, { fresh: true });
      root.innerHTML = head('تقارير التفقد', 'تقرير طالب: ' + r.student.fullName, r.group.name) + controls + `
        <section class="card card-pad">
          <div class="print-head"><div><h2>${esc(r.academy || '')} — تقرير حضور</h2><div>الطالب: <b>${esc(r.student.fullName)}</b> · المجموعة: ${esc(r.group.name)}${r.teacher ? ' · الأستاذ: ' + esc(r.teacher) : ''}</div></div><div class="small num">${esc(from)} ← ${esc(to)}</div></div>
          <div class="att-summary" style="margin-bottom:14px;font-size:15px">${STATUSES.map(([k, l]) => `<span><span class="cell ${k}">${SHORT[k]}</span> ${l}: <b>${r.totals[k]}</b></span>`).join('')}<span>نسبة الحضور: ${rate(r.rate)}</span></div>
          <table class="table"><thead><tr><th>#</th><th>التاريخ</th><th>الموضوع</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>
          ${r.items.map((x, i) => `<tr><td class="num">${i + 1}</td><td>${fmtDay(x.date)} <span class="small muted num">${esc(x.date)}</span></td><td class="small">${esc(x.topic || '—')}</td><td>${x.status ? `<span class="cell ${x.status}">${SHORT[x.status]}</span> ${LABEL[x.status]}` : '—'}</td><td class="small">${esc(x.note || '')}</td></tr>`).join('') || `<tr><td colspan="5">${emptyState('لا جلسات', 'لا جلسات تفقد في هذه الفترة.')}</td></tr>`}
          </tbody></table>
          <p class="small muted print-only" style="margin-top:20px">توقيع الأستاذ: ____________________ &nbsp;&nbsp; توقيع ولي الأمر: ____________________</p>
        </section>`;
    } else {
      const r = await api('attendance.report', { groupId: g.id, from, to }, { fresh: true });
      const tot = r.rows.reduce((a, x) => { STATUSES.forEach(([k]) => { a[k] += x.totals[k]; }); return a; }, { present: 0, absent: 0, late: 0, excused: 0 });
      const marked = tot.present + tot.absent + tot.late + tot.excused;
      root.innerHTML = head('تقارير التفقد', 'تقرير ' + g.name, 'جدول الحضور لكل طالب في كل جلسة، مع النسب. جاهز للطباعة أو الحفظ PDF.') + controls + `
        <div class="grid cols-4 no-print" style="margin-bottom:16px">
          <div class="card stat c1"><div class="label">الجلسات</div><div class="value">${r.sessions.length}</div></div>
          <div class="card stat c3"><div class="label">نسبة الحضور العامة</div><div class="value">${marked ? Math.round((tot.present + tot.late) / marked * 100) + '%' : '—'}</div></div>
          <div class="card stat c2"><div class="label">مرات الغياب</div><div class="value">${tot.absent}</div></div>
          <div class="card stat c4"><div class="label">مرات التأخر</div><div class="value">${tot.late}</div></div></div>
        <section class="card">
          <div class="print-only" style="padding:0"><div class="print-head"><div><h2>${esc(r.academy || '')} — تقرير الحضور</h2><div>المجموعة: <b>${esc(g.name)}</b>${g.schedule ? ' · ' + esc(g.schedule) : ''}${r.teacher ? ' · الأستاذ: ' + esc(r.teacher) : ''}</div></div><div style="text-align:left"><div class="small num">${esc(from)} ← ${esc(to)}</div><div class="small">${fmtDateTime(r.generatedAt)}</div></div></div></div>
          ${r.sessions.length ? `<div class="table-wrap"><table class="table matrix"><thead><tr><th>الطالب</th>${r.sessions.map((s) => `<th title="${esc(s.topic || '')}"><div class="small">${esc(fmtDay(s.date))}</div></th>`).join('')}<th>ح</th><th>غ</th><th>م</th><th>ع</th><th>النسبة</th></tr></thead><tbody>
            ${r.rows.map((x) => `<tr><td><a class="no-link" href="#/reports?${new URLSearchParams({ groupId: g.id, from, to, studentId: x.studentId })}" style="color:inherit;text-decoration:none"><b>${esc(x.fullName)}</b></a>${x.left ? ' <span class="small muted">(غادر)</span>' : ''}</td>
              ${x.cells.map((c) => `<td>${c ? `<span class="cell ${c}" title="${LABEL[c]}">${SHORT[c]}</span>` : '<span class="muted">·</span>'}</td>`).join('')}
              <td class="num">${x.totals.present}</td><td class="num">${x.totals.absent}</td><td class="num">${x.totals.late}</td><td class="num">${x.totals.excused}</td><td>${rate(x.rate)}</td></tr>`).join('')}
            <tr style="background:#F7F8FC"><td><b>عدد الحضور</b></td>${r.sessions.map((s) => `<td class="num small">${s.counts.present + s.counts.late}/${r.rows.length}</td>`).join('')}<td colspan="5"></td></tr>
          </tbody></table></div>
          <p class="small muted" style="padding:10px 18px">ح = حاضر · غ = غائب · م = متأخر · ع = غياب بعذر. النسبة = (الحضور + التأخر) ÷ الجلسات المسجلة.</p>`
          : emptyState('لا جلسات في هذه الفترة', 'غيّر الفترة أو خذ التفقد أولاً.', `<a class="btn" href="#/attendance?groupId=${esc(g.id)}">أخذ التفقد</a>`)}
        </section>`;
    }
    $('[data-group]', root).onchange = (e) => { location.hash = '#/reports?' + new URLSearchParams({ groupId: e.target.value, from, to }); };
    $('[data-from]', root).onchange = (e) => set({ from: e.target.value, ...(studentId ? { studentId } : {}) });
    $('[data-to]', root).onchange = (e) => set({ to: e.target.value, ...(studentId ? { studentId } : {}) });
    $$('[data-range]', root).forEach((b) => b.onclick = () => {
      const d = new Date(); const p = (n) => String(n).padStart(2, '0');
      let f = first, t = todayYmd();
      if (b.dataset.range === 'last') { const l = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); f = `${l.getFullYear()}-${p(l.getMonth() + 1)}-01`; t = `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}`; }
      if (b.dataset.range === 'all') { f = '2000-01-01'; }
      set({ from: f, to: t, ...(studentId ? { studentId } : {}) });
    });
    $('[data-print]', root).onclick = () => window.print();
    $('[data-back]', root)?.addEventListener('click', () => set({}));
  });
}
