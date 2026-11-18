// صفحات عامة: نظرة عامة، الإعدادات، المساعدون، سجل العمليات، حسابي.
import { api, mutate, session, can } from './api.js';
import { esc, $, $$, toast, dialog, bindForm, fmtDateTime, initials, STATUS, ROLE_NAMES, emptyState, loadingRows, icon, head, guarded, classChip } from './ui.js';

const statusBadge = (s) => { const [k, t] = STATUS[s] || ['', s]; return `<span class="badge ${k}">${esc(t)}</span>`; };

const ACTION_NAMES = {
  'setup.createSuperAdmin': 'تأسيس المنصة', 'auth.register': 'تسجيل طالب جديد', 'auth.acceptInvite': 'قبول دعوة مساعد',
  'auth.resetPassword': 'استعادة كلمة مرور', 'auth.changePassword': 'تغيير كلمة مرور', 'auth.mfa.enable': 'تفعيل التحقق الثنائي',
  'settings.update': 'تعديل الإعدادات', 'backup.run': 'نسخة احتياطية', 'team.invite': 'دعوة مساعد', 'team.revokeInvite': 'إلغاء دعوة',
  'team.setStatus': 'تغيير حالة مساعد', 'classes.create': 'إنشاء صف', 'classes.update': 'تعديل صف', 'classes.delete': 'حذف صف',
  'students.assign': 'إضافة طلاب إلى صف', 'students.create': 'إنشاء حساب طالب', 'students.update': 'تعديل طالب',
  'students.setStatus': 'تغيير حالة طالب', 'students.resetDevice': 'فك قفل جهاز طالب', 'students.setPassword': 'كلمة مرور مؤقتة لطالب',
  'lessons.create': 'إضافة درس', 'lessons.update': 'تعديل درس', 'lessons.delete': 'حذف درس', 'lessons.reorder': 'ترتيب الدروس',
  'media.upload': 'رفع ملف', 'media.delete': 'حذف ملف', 'assess.create': 'إنشاء اختبار/واجب', 'assess.update': 'تعديل اختبار/واجب',
  'assess.delete': 'حذف اختبار/واجب', 'assess.submit': 'تسليم طالب', 'assess.grade': 'تصحيح', 'assess.reopen': 'إعادة فتح تسليم',
  'assess.release': 'نشر النتائج', 'news.create': 'نشر خبر', 'news.update': 'تعديل خبر', 'news.delete': 'حذف خبر',
  'notifications.send': 'إرسال إشعار', 'notifications.schedule': 'جدولة إشعار', 'notifications.delete': 'حذف إشعار',
  'attendance.group.create': 'إنشاء مجموعة تفقد', 'attendance.group.update': 'تعديل مجموعة', 'attendance.group.delete': 'حذف مجموعة',
  'attendance.students.bulk': 'إضافة أسماء جماعية', 'attendance.students.import': 'استيراد طلاب صف', 'attendance.student.save': 'حفظ اسم طالب',
  'attendance.student.delete': 'حذف اسم', 'attendance.save': 'أخذ التفقد', 'attendance.session.delete': 'حذف جلسة تفقد'
};
const actionName = (a) => ACTION_NAMES[a] || a;

// ════════════ نظرة عامة ════════════
export function dashboard(root) {
  return guarded(root, async () => {
    const d = await api('dashboard.summary', {}, { fresh: true });
    const me = session.me.user;
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'صباح الخير' : 'مساء الخير';
    const stat = (cls, ic, label, value, sub = '') => `<div class="card stat ${cls}"><span class="ic">${icon(ic, 20)}</span><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    root.innerHTML = head('نظرة عامة', `${hello}، ${me.fullName}`, 'ملخص سريع لما يحتاج انتباهك اليوم.',
      can('content.manage') ? `<a class="btn" href="#/lessons">${icon('plus')} درس جديد</a><a class="btn secondary" href="#/attendance">${icon('att')} أخذ التفقد</a>` : '') + `
      <div class="grid cols-4" style="margin-bottom:20px">
        ${stat('c1', 'users', 'الطلاب', d.students, `${d.activeWeek} نشط هذا الأسبوع`)}
        ${stat('c2', 'clipboard', 'بانتظار التصحيح', d.pendingGrading, `${d.openAssessments} اختبار/واجب منشور`)}
        ${stat('c3', 'video', 'الدروس المنشورة', d.lessons)}
        ${stat('c4', 'att', 'تفقد اليوم', d.attendanceToday, 'جلسات مسجلة اليوم')}
      </div>
      ${d.waiting ? `<div class="alert info" style="align-items:center;justify-content:space-between"><span>${icon('users')} لديك <b>${d.waiting}</b> طالب سجّلوا في التطبيق وينتظرون إضافتهم إلى صف.</span><a class="btn sm" href="#/students?classId=none">إضافتهم الآن</a></div>` : ''}
      <div class="grid cols-main">
        <section class="card"><div class="card-head"><h3>أوراق بانتظار التصحيح</h3><a class="btn ghost sm" href="#/grading">الكل</a></div>
          ${d.gradingQueue.length ? `<ul class="list-plain">${d.gradingQueue.map((s) => `<li style="align-items:center"><span class="avatar">${initials(s.student)}</span>
            <div style="flex:1"><b>${esc(s.student)}</b><div class="small muted">${esc(s.title)} · ${fmtDateTime(s.submittedAt)}</div></div>
            <a class="btn sm" href="#/grade?id=${esc(s.id)}">صحّح</a></li>`).join('')}</ul>` : emptyState('لا شيء بانتظارك', 'كل الأوراق المسلّمة مصححة.')}
        </section>
        <section class="card"><div class="card-head"><h3>الصفوف</h3><a class="btn ghost sm" href="#/classes">إدارة</a></div>
          ${d.classes.length ? `<ul class="list-plain">${d.classes.map((c) => `<li style="align-items:center;justify-content:space-between">${classChip(c.name, c.color)}<span class="small muted num">${c.students} طالب</span></li>`).join('')}</ul>`
            : emptyState('لا صفوف بعد', 'أنشئ أول صف لتبدأ بإضافة الطلاب والدروس.', '<a class="btn" href="#/classes">إنشاء صف</a>')}
        </section>
      </div>`;
    document.dispatchEvent(new CustomEvent('badges-changed'));
  });
}

// ════════════ الإعدادات ════════════
export function settings(root) {
  return guarded(root, async () => {
    const all = await api('settings.get');
    const v = (k) => all[k]?.value;
    const editable = can('settings.manage');
    const dis = editable ? '' : 'disabled';
    const contact = v('contact') || {}; const reg = v('registration') || {}; const sec = v('security') || {};
    const txt = (name, label, val, attrs = '') => `<div class="field"><label>${label}</label><input class="input" name="${name}" value="${esc(val ?? '')}" ${attrs} ${dis}><div class="err"></div></div>`;
    const chk = (name, label, on, hint) => `<label class="check" style="align-items:flex-start"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${dis}> <span>${label}${hint ? `<span class="small muted" style="display:block">${hint}</span>` : ''}</span></label>`;
    root.innerHTML = head('النظام', 'الإعدادات', 'تنعكس فوراً على التطبيق دون إعادة بناء.') +
      (editable ? '' : '<div class="alert info">يمكنك الاطلاع فقط. التعديل متاح للأستاذ (المدير).</div>') + `
      <form novalidate data-settings>
        <div class="alert error" hidden data-alert></div>
        <div class="grid cols-2">
          <section class="card card-pad"><h3 style="margin-bottom:16px">هوية المنصة</h3>
            ${txt('academy.name', 'اسم المنصة', v('academy.name'), 'required')}
            ${txt('academy.tagline', 'العبارة التعريفية', v('academy.tagline'))}
            ${txt('teacher.name', 'اسم الأستاذ (يظهر للطلاب)', v('teacher.name'))}
            <div class="field"><label>نبذة عن الأستاذ / المنصة</label><textarea class="input" name="about.text" rows="3" ${dis}>${esc(v('about.text'))}</textarea></div>
          </section>
          <section class="card card-pad"><h3 style="margin-bottom:16px">التواصل (يظهر في التطبيق)</h3>
            ${txt('contact.phone', 'الهاتف', contact.phone, 'dir="ltr"')}
            ${txt('contact.whatsapp', 'واتساب', contact.whatsapp, 'dir="ltr"')}
            ${txt('contact.telegram', 'تلغرام', contact.telegram, 'dir="ltr"')}
            ${txt('contact.address', 'عنوان المعهد / الصف', contact.address)}
          </section>
          <section class="card card-pad"><h3 style="margin-bottom:16px">الحماية</h3>
            ${chk('sec.deviceLock', 'قفل الحساب على جهاز واحد', sec.deviceLock !== false, 'أول جهاز يدخل منه الطالب يُربط بحسابه، ولا يعمل الحساب على جهاز آخر إلا بعد فك القفل من صفحة الطالب.')}
            ${chk('sec.watermark', 'علامة مائية باسم الطالب ورقمه فوق الفيديو والملفات', sec.watermark !== false, 'تردع التصوير بهاتف آخر وتكشف مصدر أي تسريب.')}
            <p class="small muted" style="margin:6px 0 0">منع لقطات الشاشة وتسجيل الشاشة مفعّل دائماً داخل التطبيق، ولا يمكن تنزيل الفيديو أو الملفات.</p>
          </section>
          <section class="card card-pad"><h3 style="margin-bottom:16px">التسجيل والدروس</h3>
            <div class="field"><label>تسجيل الطلاب من التطبيق</label><select class="input" name="registration.mode" ${dis}>
              <option value="open" ${reg.mode !== 'closed' ? 'selected' : ''}>مفتوح — يسجّل الطالب ثم تضيفه إلى صفه</option>
              <option value="closed" ${reg.mode === 'closed' ? 'selected' : ''}>مغلق — الإدارة فقط تنشئ الحسابات</option></select></div>
            ${txt('video.completePercent', 'نسبة المشاهدة لاعتبار الدرس مكتملاً (%)', v('video.completePercent'), 'type="number" min="30" max="100" dir="ltr"')}
            ${txt('timezone', 'المنطقة الزمنية', v('timezone'), 'dir="ltr"')}
            <p class="small muted">تُحفظ نسخة احتياطية من قاعدة البيانات يومياً على Drive (آخر 14 نسخة).</p>
            ${editable ? '<button type="button" class="btn secondary sm" data-backup>نسخة احتياطية الآن</button>' : ''}
          </section>
        </div>
        ${editable ? '<div style="margin-top:20px"><button class="btn" type="submit">حفظ الإعدادات</button></div>' : ''}
      </form>`;
    if (!editable) return;
    const form = $('[data-settings]', root);
    $('[data-backup]', root)?.addEventListener('click', async (e) => {
      e.target.classList.add('loading');
      try { const r = await api('backup.run'); toast('حُفظت النسخة: ' + r.name); } catch (ex) { toast(ex.message, 'error'); } finally { e.target.classList.remove('loading'); }
    });
    bindForm(form, async (f) => {
      const on = (n) => form.querySelector(`[name="${n}"]`).checked;
      if (!f['academy.name']) throw Object.assign(new Error('اسم المنصة مطلوب.'), { fields: { 'academy.name': 'مطلوب' } });
      await mutate('settings.update', {
        'academy.name': f['academy.name'], 'academy.tagline': f['academy.tagline'], 'teacher.name': f['teacher.name'], 'about.text': f['about.text'],
        contact: { phone: f['contact.phone'], whatsapp: f['contact.whatsapp'], telegram: f['contact.telegram'], address: f['contact.address'] },
        registration: { ...reg, mode: f['registration.mode'] }, timezone: f.timezone,
        'video.completePercent': Math.max(30, Math.min(100, Number(f['video.completePercent']) || 85)),
        security: { ...sec, deviceLock: on('sec.deviceLock'), watermark: on('sec.watermark') }
      });
      toast('حُفظت الإعدادات');
      document.dispatchEvent(new CustomEvent('settings-changed'));
    });
  });
}

// ════════════ المساعدون ════════════
export function team(root) {
  return guarded(root, async () => {
    const r = await api('team.list', {}, { fresh: true });
    const isOwner = session.me.roles.includes('super_admin');
    root.innerHTML = head('النظام', 'المساعدون', 'أضف مساعداً إدارياً يدير الطلاب والدروس والتصحيح والتفقد (بدون الإعدادات والمساعدين).',
      isOwner ? `<button class="btn" data-invite>${icon('plus')} دعوة مساعد</button>` : '') + `
      <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead><tbody>
      ${r.items.map((u) => `<tr><td><div class="person"><span class="avatar">${initials(u.fullName)}</span><div><b>${esc(u.fullName)}</b><div class="small muted" dir="ltr" style="text-align:right">${esc(u.email)}</div></div></div></td>
        <td>${u.roles.map((x) => `<span class="badge plain">${esc(ROLE_NAMES[x] || x)}</span>`).join(' ')}</td><td>${statusBadge(u.status)}</td><td class="small">${fmtDateTime(u.lastLoginAt)}</td>
        <td style="text-align:left">${isOwner && !u.roles.includes('super_admin') ? `<button class="btn ${u.status === 'active' ? 'danger' : 'secondary'} sm" data-status="${esc(u.id)}" data-to="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></section>
      ${r.invites.length ? `<section class="card" style="margin-top:20px"><div class="card-head"><h3>دعوات بانتظار القبول</h3></div><ul class="list-plain">${r.invites.map((i) => `<li style="align-items:center"><span style="flex:1" dir="ltr">${esc(i.email)}</span><span class="small muted">تنتهي ${fmtDateTime(i.expiresAt)}</span>${isOwner ? `<button class="btn danger sm" data-revoke="${esc(i.id)}">إلغاء</button>` : ''}</li>`).join('')}</ul></section>` : ''}`;
    $('[data-invite]', root)?.addEventListener('click', async () => {
      const res = await dialog({ title: 'دعوة مساعد إداري', submitLabel: 'إنشاء الدعوة',
        body: `<div class="field"><label>بريد المساعد</label><input class="input" name="email" type="email" dir="ltr" required></div><p class="small muted">سيظهر لك رمز دعوة، أرسله للمساعد ليدخل به من صفحة «قبول الدعوة» في هذه اللوحة.</p>`,
        onSubmit: (f) => mutate('team.invite', { email: f.email }) });
      if (!res) return;
      await dialog({ title: 'رمز الدعوة', submitLabel: 'تم', body: `<p>أرسل للمساعد رابط اللوحة وهذا الرمز (صالح 7 أيام):</p><div class="code-box">${esc(res.code)}</div><p class="small muted" style="margin-top:10px">رابط القبول: <span dir="ltr" class="num">${esc(location.origin + location.pathname)}#/invite</span></p>`, onSubmit: () => true });
      team(root);
    });
    $$('[data-status]', root).forEach((b) => b.onclick = async () => { await mutate('team.setStatus', { id: b.dataset.status, status: b.dataset.to }); toast('تم'); team(root); });
    $$('[data-revoke]', root).forEach((b) => b.onclick = async () => { await mutate('team.revokeInvite', { id: b.dataset.revoke }); toast('أُلغيت الدعوة'); team(root); });
  });
}

// ════════════ سجل العمليات ════════════
export function audit(root) {
  const state = { page: 1, action: '' };
  root.innerHTML = head('النظام', 'سجل العمليات', 'كل عملية مسجلة: من نفّذها ومتى.') + `
    <section class="card"><div class="toolbar"><select class="input" data-action style="width:auto" aria-label="نوع العملية"><option value="">كل العمليات</option>
      <option value="students.">الطلاب</option><option value="lessons.">الدروس</option><option value="assess.">الاختبارات والتصحيح</option>
      <option value="attendance.">التفقد</option><option value="auth.">الأمان والدخول</option><option value="settings.">الإعدادات</option></select></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>العملية</th><th>المنفّذ</th><th>التفاصيل</th><th>الوقت</th></tr></thead><tbody data-rows></tbody></table></div><div class="pager" data-pager></div></section>`;
  const rows = $('[data-rows]', root), pager = $('[data-pager]', root);
  async function load() {
    rows.innerHTML = loadingRows(6, 4);
    try {
      const r = await api('audit.list', { page: state.page, action: state.action });
      rows.innerHTML = r.items.length ? r.items.map((a) => `<tr><td>${esc(actionName(a.action))}</td><td>${esc(a.actorName)}</td>
        <td class="small muted">${esc(Object.entries(a.details || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('، ') : v}`).join(' · ') || '—')}</td>
        <td class="small">${fmtDateTime(a.createdAt)}</td></tr>`).join('') : `<tr><td colspan="4">${emptyState('لا سجلات', 'لا توجد عمليات مطابقة.')}</td></tr>`;
      pager.innerHTML = `<span>${r.total} سجل</span><span style="display:flex;gap:6px;align-items:center"><button class="btn secondary sm" data-prev ${r.page <= 1 ? 'disabled' : ''}>السابق</button><span class="num">${r.page} / ${r.pages}</span><button class="btn secondary sm" data-next ${r.page >= r.pages ? 'disabled' : ''}>التالي</button></span>`;
      $('[data-prev]', pager).onclick = () => { state.page--; load(); };
      $('[data-next]', pager).onclick = () => { state.page++; load(); };
    } catch (e) { rows.innerHTML = `<tr><td colspan="4">${emptyState('تعذّر التحميل', e.message)}</td></tr>`; }
  }
  $('[data-action]', root).onchange = (e) => { state.action = e.target.value; state.page = 1; load(); };
  load();
}

// ════════════ حسابي ════════════
export function account(root) {
  return guarded(root, async () => {
    const me = session.me;
    const sessions = await api('auth.sessions.list', {}, { fresh: true });
    root.innerHTML = head('حسابي', me.user.fullName, me.user.email) + `
      <div class="grid cols-2">
        <section class="card card-pad"><h3 style="margin-bottom:16px">البيانات الشخصية</h3>
          <form novalidate data-profile><div class="alert error" hidden data-alert></div>
            <div class="field"><label>الاسم الكامل</label><input class="input" name="fullName" value="${esc(me.user.fullName)}" required><div class="err"></div></div>
            <div class="field"><label>الهاتف</label><input class="input" name="phone" dir="ltr" value="${esc(me.user.phone)}"></div>
            <button class="btn" type="submit">حفظ</button></form>
        </section>
        <section class="card card-pad"><h3 style="margin-bottom:16px">تغيير كلمة المرور</h3>
          <form novalidate data-password><div class="alert error" hidden data-alert></div>
            <div class="field"><label>كلمة المرور الحالية</label><input class="input" type="password" name="currentPassword" dir="ltr" required autocomplete="current-password"><div class="err"></div></div>
            <div class="field"><label>كلمة المرور الجديدة</label><input class="input" type="password" name="newPassword" dir="ltr" required autocomplete="new-password"><div class="hint">سيتم إنهاء جلساتك على الأجهزة الأخرى.</div><div class="err"></div></div>
            <button class="btn" type="submit">تغيير</button></form>
        </section>
        <section class="card" style="grid-column:1/-1"><div class="card-head"><h3>الجلسات النشطة</h3><span class="badge ${me.user.mfaEnabled ? 'ok' : 'warn'}">التحقق الثنائي ${me.user.mfaEnabled ? 'مفعّل' : 'غير مفعّل'}</span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>الجهاز</th><th>آخر نشاط</th><th>تنتهي</th><th></th></tr></thead><tbody>
          ${sessions.map((s) => `<tr><td>${esc(s.device || 'غير معروف')} ${s.current ? '<span class="badge ok">هذه الجلسة</span>' : ''}</td><td class="small">${fmtDateTime(s.lastSeenAt)}</td><td class="small">${fmtDateTime(s.expiresAt)}</td>
            <td style="text-align:left">${s.current ? '' : `<button class="btn danger sm" data-revoke="${esc(s.id)}">إنهاء</button>`}</td></tr>`).join('')}
          </tbody></table></div></section>
      </div>`;
    bindForm($('[data-profile]', root), async (f) => { const u = await mutate('profile.update', f); session.me.user = u; toast('حُفظت البيانات'); document.dispatchEvent(new CustomEvent('me-changed')); });
    bindForm($('[data-password]', root), async (f) => { await mutate('auth.changePassword', f); toast('تم تغيير كلمة المرور'); account(root); });
    $$('[data-revoke]', root).forEach((b) => b.onclick = async () => { await mutate('auth.sessions.revoke', { sessionId: b.dataset.revoke }); toast('أُنهيت الجلسة'); account(root); });
  });
}
