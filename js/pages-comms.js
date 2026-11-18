// الأخبار والإعلانات (لوحة ثابتة في التطبيق: برنامج امتحانات، مواعيد...) والإشعارات.
import { api, mutate } from './api.js';
import { esc, $, $$, toast, dialog, confirmDialog, fmtDateTime, emptyState, icon, head, guarded, toLocalInput, fromLocalInput, compressImage } from './ui.js';

const KIND_NAMES = { manual: 'يدوي', news: 'خبر', lesson: 'درس جديد', assessment: 'اختبار/واجب', grade: 'نتيجة', class: 'إضافة لصف', general: 'عام' };

async function imgUrl(id) {
  const f = await api('files.get', { mediaAssetId: id });
  return `data:${f.mimeType};base64,${f.base64}`;
}

// ════════════ الأخبار ════════════
export function news(root) {
  return guarded(root, async () => {
    const [r, cls] = await Promise.all([api('news.list', {}, { fresh: true }), api('classes.list')]);
    root.innerHTML = head('التواصل', 'الأخبار والإعلانات', 'تبقى ظاهرة في الصفحة الرئيسية للتطبيق: برنامج الامتحانات، تغيير موعد، عطلة... المثبّت يظهر أولاً.',
      `<button class="btn" data-new>${icon('plus')} خبر جديد</button>`) + `
      <section class="card">${r.items.length ? r.items.map((n) => `<article class="news-item">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1"><h3 style="font-size:17px">${n.pinned ? `<span class="pin">${icon('pin', 16)}</span> ` : ''}${esc(n.title)}</h3>
            <div class="meta">${n.status === 'hidden' ? '<span class="badge warn">مخفي</span>' : '<span class="badge ok">ظاهر</span>'}
              <span>${n.classNames.length ? 'لصفوف: ' + esc(n.classNames.join('، ')) : 'لكل الطلاب'}</span><span>${fmtDateTime(n.publishedAt || n.createdAt)}</span>
              ${n.expiresAt ? `<span>يختفي ${fmtDateTime(n.expiresAt)}</span>` : ''}</div></div>
          <button class="icon-btn" data-edit="${esc(n.id)}" title="تعديل">${icon('edit')}</button><button class="icon-btn" data-del="${esc(n.id)}" title="حذف">${icon('trash')}</button></div>
        ${n.imageFileId ? `<img data-img="${esc(n.imageFileId)}" alt="" style="max-width:320px;border-radius:10px;border:1px solid var(--line)">` : ''}
        <div class="body">${esc(n.body)}</div></article>`).join('')
        : emptyState('لا أخبار', 'انشر برنامج الامتحانات أو أي إعلان تريده أن يبقى ظاهراً للطلاب.', '<button class="btn" data-new>نشر أول خبر</button>')}</section>`;
    $$('[data-img]', root).forEach(async (im) => { try { im.src = await imgUrl(im.dataset.img); } catch (e) { im.remove(); } });
    const edit = async (n) => {
      let imageFileId = n?.imageFileId || '';
      const p = dialog({ title: n ? 'تعديل الخبر' : 'خبر جديد', submitLabel: n ? 'حفظ' : 'نشر',
        body: `<div class="field"><label>العنوان *</label><input class="input" name="title" value="${esc(n?.title || '')}" required placeholder="مثال: برنامج امتحانات الفصل الأول"></div>
          <div class="field"><label>النص</label><textarea class="input" name="body" rows="7" placeholder="الأحد 1/12: الجبر&#10;الثلاثاء 3/12: الهندسة">${esc(n?.body || '')}</textarea></div>
          <div class="field"><label>صورة (اختياري — مثل صورة جدول)</label><div style="display:flex;gap:10px;align-items:center"><img data-prev alt="" style="max-height:80px;border-radius:8px;${imageFileId ? '' : 'display:none'}">
            <label class="btn secondary sm" style="cursor:pointer">${icon('image', 16)} اختيار صورة<input type="file" accept="image/*" hidden data-file></label><button type="button" class="btn ghost sm" data-noimg ${imageFileId ? '' : 'hidden'}>إزالة</button><span class="small muted" data-st></span></div></div>
          <div class="field"><label>يظهر لـ</label><div class="checks">${cls.items.map((c) => `<label class="check"><input type="checkbox" name="cls" value="${esc(c.id)}" ${(n?.classIds || []).includes(c.id) ? 'checked' : ''}> <span>${esc(c.name)}</span></label>`).join('')}</div><div class="hint">بدون تحديد = لكل الطلاب.</div></div>
          <label class="check"><input type="checkbox" name="pinned" ${n?.pinned ? 'checked' : ''}> <span>تثبيت أعلى الصفحة الرئيسية</span></label>
          <div class="form-grid two"><div class="field"><label>يختفي تلقائياً في (اختياري)</label><input class="input" type="datetime-local" name="expiresAt" value="${esc(toLocalInput(n?.expiresAt))}"></div>
          <div class="field"><label>الحالة</label><select class="input" name="status"><option value="published">ظاهر</option><option value="hidden" ${n?.status === 'hidden' ? 'selected' : ''}>مخفي</option></select></div></div>
          ${n ? '' : '<label class="check"><input type="checkbox" name="notify" checked> <span>إرسال إشعار للطلاب</span></label>'}`,
        onSubmit: (f, d) => {
          if (!f.title) throw new Error('اكتب العنوان.');
          return mutate('news.save', { id: n?.id, title: f.title, body: f.body, imageFileId, classIds: $$('[name="cls"]:checked', d).map((x) => x.value),
            pinned: $('[name="pinned"]', d).checked, expiresAt: fromLocalInput(f.expiresAt), status: f.status, notify: n ? false : $('[name="notify"]', d).checked });
        } });
      const d = $$('dialog.dialog').pop();
      if (imageFileId) imgUrl(imageFileId).then((u) => { $('[data-prev]', d).src = u; }).catch(() => {});
      $('[data-file]', d).onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        $('[data-st]', d).textContent = 'جارٍ الرفع…';
        try {
          const b64 = await compressImage(file, 1800);
          const m = await mutate('media.upload', { fileName: 'خبر.jpg', mimeType: 'image/jpeg', base64: b64, title: 'صورة خبر' });
          imageFileId = m.id; const pv = $('[data-prev]', d); pv.src = 'data:image/jpeg;base64,' + b64; pv.style.display = ''; $('[data-noimg]', d).hidden = false;
          $('[data-st]', d).textContent = '';
        } catch (ex) { $('[data-st]', d).textContent = ex.message; }
      };
      $('[data-noimg]', d).onclick = () => { imageFileId = ''; $('[data-prev]', d).style.display = 'none'; $('[data-noimg]', d).hidden = true; };
      if (await p) { toast('حُفظ الخبر'); news(root); }
    };
    $$('[data-new]', root).forEach((b) => b.onclick = () => edit(null));
    $$('[data-edit]', root).forEach((b) => b.onclick = () => edit(r.items.find((x) => x.id === b.dataset.edit)));
    $$('[data-del]', root).forEach((b) => b.onclick = async () => {
      if (!await confirmDialog('حذف الخبر', 'سيختفي من تطبيق الطلاب.', 'حذف')) return;
      await mutate('news.delete', { id: b.dataset.del }); toast('حُذف'); news(root);
    });
  });
}

// ════════════ الإشعارات ════════════
export function notifications(root) {
  return guarded(root, async () => {
    const [r, cls] = await Promise.all([api('notifications.list', {}, { fresh: true }), api('classes.list')]);
    root.innerHTML = head('التواصل', 'الإشعارات', 'تصل إلى قسم الإشعارات في تطبيق الطالب. الدروس والاختبارات والنتائج ترسل إشعاراتها تلقائياً.') + `
      <div class="grid cols-main" style="align-items:start">
        <section class="card"><div class="card-head"><h3>السجل</h3></div>
          ${r.items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>الإشعار</th><th>إلى</th><th>قُرئ</th><th>الوقت</th><th></th></tr></thead><tbody>
          ${r.items.map((n) => `<tr><td><b>${esc(n.title)}</b><div class="small muted">${esc((n.body || '').slice(0, 90))}</div><span class="mini">${KIND_NAMES[n.kind] || n.kind}</span></td>
            <td class="small">${n.targetType === 'all' ? 'كل الطلاب' : esc(n.targetName || (n.targetType === 'classes' ? 'صفوف محددة' : '—'))}</td>
            <td class="num small">${n.status === 'scheduled' ? '<span class="badge warn">مجدول</span>' : `${n.readCount} / ${n.recipientCount}`}</td>
            <td class="small">${fmtDateTime(n.status === 'scheduled' ? n.scheduledAt : n.sentAt)}</td>
            <td><button class="icon-btn" data-del="${esc(n.id)}" title="حذف">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>`
            : emptyState('لا إشعارات بعد', 'أرسل أول إشعار من النموذج.')}
        </section>
        <section class="card card-pad" style="position:sticky;top:84px"><h3 style="margin-bottom:14px">${icon('bell')} إشعار جديد</h3>
          <form novalidate data-send><div class="alert error" hidden data-alert></div>
            <div class="field"><label>إلى</label><select class="input" name="target"><option value="all">كل الطلاب</option>${cls.items.map((c) => `<option value="class:${esc(c.id)}">صف ${esc(c.name)}</option>`).join('')}<option value="student">طالب محدد…</option></select></div>
            <div class="field" data-stu hidden><label>الطالب</label><input class="input" list="stu-dl" name="studentName" placeholder="اكتب اسم الطالب"><datalist id="stu-dl"></datalist></div>
            <div class="field"><label>العنوان *</label><input class="input" name="title" required maxlength="150" placeholder="مثال: تذكير بموعد الحصة"></div>
            <div class="field"><label>النص</label><textarea class="input" name="body" rows="4" maxlength="1000"></textarea></div>
            <div class="field"><label>الإرسال</label><input class="input" type="datetime-local" name="scheduledAt"><div class="hint">اتركه فارغاً للإرسال الآن.</div></div>
            <button class="btn block" type="submit">${icon('bell')} إرسال</button>
          </form></section>
      </div>`;
    const form = $('[data-send]', root);
    let stuMap = {};
    form.target.onchange = async () => {
      const isStu = form.target.value === 'student';
      $('[data-stu]', form).hidden = !isStu;
      if (isStu && !Object.keys(stuMap).length) {
        const s = await api('students.list', { pageSize: 200 });
        stuMap = Object.fromEntries(s.items.map((x) => [`${x.fullName} — ${x.phone || x.email}`, x.id]));
        $('#stu-dl').innerHTML = Object.keys(stuMap).map((k) => `<option value="${esc(k)}">`).join('');
      }
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[type="submit"]', form); const alert = $('[data-alert]', form); alert.hidden = true; btn.classList.add('loading');
      try {
        const t = form.target.value; let targetType = t, targetId = '';
        if (t.startsWith('class:')) { targetType = 'class'; targetId = t.slice(6); }
        if (t === 'student') { targetId = stuMap[form.studentName.value]; if (!targetId) throw new Error('اختر الطالب من القائمة.'); }
        if (!form.title.value.trim()) throw new Error('اكتب العنوان.');
        const n = await mutate('notifications.send', { title: form.title.value.trim(), body: form.body.value.trim(), targetType, targetId, scheduledAt: fromLocalInput(form.scheduledAt.value) });
        toast(n.status === 'scheduled' ? 'جُدول الإشعار' : `أُرسل إلى ${n.recipientCount} طالب`);
        notifications(root);
      } catch (ex) { alert.textContent = ex.message; alert.hidden = false; }
      finally { btn.classList.remove('loading'); }
    });
    $$('[data-del]', root).forEach((b) => b.onclick = async () => {
      if (!await confirmDialog('حذف الإشعار', 'سيُحذف من تطبيقات الطلاب أيضاً.', 'حذف')) return;
      await mutate('notifications.delete', { id: b.dataset.del }); toast('حُذف'); notifications(root);
    });
  });
}
