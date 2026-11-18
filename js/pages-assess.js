// الاختبارات (اختيار من متعدد) والواجبات الورقية: القائمة، المحرر، التسليمات، تصحيح الأوراق المصوّرة.
import { api, mutate } from './api.js';
import {
  esc, $, $$, toast, dialog, confirmDialog, fmtDateTime, initials, emptyState, loadingRows, icon, head, guarded,
  classChip, toLocalInput, fromLocalInput, compressImage, readFileBase64, fmtSize, imageViewer
} from './ui.js';

const KIND = { mcq: 'اختبار — اختيار من متعدد', paper: 'واجب ورقي — يُصوَّر ويُرفع' };
const KIND_SHORT = { mcq: 'اختيار من متعدد', paper: 'ورقي' };
const ST = { draft: ['warn', 'مسودة'], published: ['ok', 'منشور'], closed: ['', 'مغلق'] };
const stBadge = (s) => { const [k, t] = ST[s] || ['', s]; return `<span class="badge ${k}">${t}</span>`; };
const SUB = { submitted: ['warn', 'بانتظار التصحيح'], graded: ['ok', 'مصحح'], in_progress: ['', 'يحل الآن'], todo: ['plain', 'لم يبدأ'], missed: ['bad', 'لم يسلّم'] };
const subBadge = (s) => { const [k, t] = SUB[s] || ['', s]; return `<span class="badge ${k}">${t}</span>`; };
const badges = () => document.dispatchEvent(new CustomEvent('badges-changed'));

const imgCache = new Map();
/** يجلب ملفاً محمياً من الخادم ويحوله لرابط محلي مؤقت. */
async function fileUrl(payload) {
  const key = JSON.stringify(payload);
  if (imgCache.has(key)) return imgCache.get(key);
  const f = await api('files.get', payload);
  const url = `data:${f.mimeType};base64,${f.base64}`;
  imgCache.set(key, url);
  return url;
}

// ════════════ القائمة ════════════
export function assessments(root, params) {
  const state = { classId: params.get('classId') || '', kind: '' };
  return guarded(root, async () => {
    const [cls, r] = await Promise.all([api('classes.list'), api('assess.list', { classId: state.classId, kind: state.kind }, { fresh: true })]);
    const color = Object.fromEntries(cls.items.map((c) => [c.id, c.color]));
    root.innerHTML = head('الاختبارات والواجبات', 'الاختبارات والواجبات', 'اختبار مؤتمت بالاختيار من متعدد، أو واجب يحلّه الطالب على ورقة ويصوّره من التطبيق.',
      `<a class="btn" href="#/assessment?kind=mcq${state.classId ? '&classId=' + state.classId : ''}">${icon('plus')} اختبار اختيار من متعدد</a>
       <a class="btn secondary" href="#/assessment?kind=paper${state.classId ? '&classId=' + state.classId : ''}">${icon('camera')} واجب ورقي</a>`) + `
      <section class="card"><div class="toolbar">
        <select class="input" data-class style="width:auto"><option value="">كل الصفوف</option>${cls.items.map((c) => `<option value="${esc(c.id)}" ${c.id === state.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select class="input" data-kind style="width:auto"><option value="">النوعان</option><option value="mcq" ${state.kind === 'mcq' ? 'selected' : ''}>اختيار من متعدد</option><option value="paper" ${state.kind === 'paper' ? 'selected' : ''}>ورقي</option></select></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>العنوان</th><th>الصف</th><th>النوع</th><th>الحالة</th><th>آخر موعد</th><th>التسليمات</th><th></th></tr></thead><tbody>
      ${r.items.length ? r.items.map((a) => `<tr>
        <td><a href="#/assessment?id=${esc(a.id)}"><b>${esc(a.title)}</b></a>${a.kind === 'mcq' ? `<div class="small muted">${a.questionsCount} سؤال${a.durationMin ? ' · ' + a.durationMin + ' دقيقة' : ''}</div>` : `<div class="small muted">من ${a.maxScore}</div>`}</td>
        <td>${classChip(a.className, color[a.classId])}</td><td class="small">${KIND_SHORT[a.kind]}</td><td>${stBadge(a.status)}</td>
        <td class="small">${a.dueAt ? fmtDateTime(a.dueAt) : '—'}</td>
        <td><span class="num">${a.stats.submitted + a.stats.graded} / ${a.classStudents}</span> ${a.stats.pending ? `<span class="badge warn">${a.stats.pending} للتصحيح</span>` : ''}</td>
        <td style="text-align:left;white-space:nowrap"><a class="btn secondary sm" href="#/submissions?id=${esc(a.id)}">التسليمات</a> <a class="btn ghost sm" href="#/assessment?id=${esc(a.id)}">${icon('edit', 16)}</a></td></tr>`).join('')
        : `<tr><td colspan="7">${emptyState('لا اختبارات بعد', 'أنشئ اختباراً أو واجباً لصف، وسيصل إشعار لطلابه عند النشر.')}</td></tr>`}
      </tbody></table></div></section>`;
    $('[data-class]', root).onchange = (e) => { state.classId = e.target.value; assessments(root, new URLSearchParams(state)); };
    $('[data-kind]', root).onchange = (e) => { state.kind = e.target.value; assessments(root, new URLSearchParams(state)); };
  });
}

// ════════════ المحرر ════════════
export function editor(root, params) {
  const id = params.get('id');
  return guarded(root, async () => {
    const [cls, a] = await Promise.all([api('classes.list'), id ? api('assess.get', { id }, { fresh: true }) : null]);
    if (!cls.items.length) { root.innerHTML = head('الاختبارات', 'اختبار جديد', '') + `<div class="card">${emptyState('أنشئ صفاً أولاً', 'الاختبار يُنشر لصف محدد.', '<a class="btn" href="#/classes">الصفوف</a>')}</div>`; return; }
    const kind = a?.kind || (params.get('kind') === 'paper' ? 'paper' : 'mcq');
    const v = a || { classId: params.get('classId') || cls.items[0].id, status: 'draft', showResults: 'immediate', showAnswers: true, maxScore: 10, durationMin: kind === 'mcq' ? 20 : 0 };
    const locked = !!a?.hasSubmissions;
    const qs = (a?.questions || []).map((q) => ({ text: q.text, imageFileId: q.imageFileId, options: q.options.slice(), correctIndex: q.correctIndex, points: q.points, explanation: q.explanation }));
    if (kind === 'mcq' && !qs.length) qs.push({ text: '', imageFileId: '', options: ['', '', '', ''], correctIndex: 0, points: 1, explanation: '' });
    const media = await api('media.list', { pageSize: 200 }).catch(() => ({ items: [] }));
    const atts = new Set(v.attachmentIds || []);

    root.innerHTML = head(KIND[kind], a ? a.title : (kind === 'mcq' ? 'اختبار جديد' : 'واجب ورقي جديد'), kind === 'mcq'
      ? 'يصحَّح تلقائياً فور التسليم. الأسئلة تُخلط لكل طالب إن فعّلت الخيار.'
      : 'الطالب يكتب الحل على ورقة، يصوّرها بكاميرا التطبيق ويرفعها. تصحّحها أنت وتكتب الدرجة والملاحظة.',
      `<a class="btn ghost" href="#/assessments">رجوع</a>${a ? `<a class="btn secondary" href="#/submissions?id=${esc(a.id)}">التسليمات</a><button class="btn danger" data-del>${icon('trash', 16)} حذف</button>` : ''}`) + `
      <form novalidate data-form>
        <div class="alert error" hidden data-alert></div>
        <div class="grid cols-main" style="align-items:start">
          <div>
            <section class="card card-pad" style="margin-bottom:20px">
              <div class="field"><label>العنوان *</label><input class="input" name="title" value="${esc(v.title || '')}" required placeholder="${kind === 'mcq' ? 'مثال: اختبار الوحدة الأولى — المعادلات' : 'مثال: واجب التكامل بالتجزئة'}"></div>
              <div class="field"><label>${kind === 'mcq' ? 'تعليمات قبل البدء' : 'نص الواجب / المسائل المطلوبة'}</label><textarea class="input" name="instructions" rows="${kind === 'paper' ? 6 : 3}">${esc(v.instructions || '')}</textarea></div>
              <div class="field"><label>ملفات مرفقة (ورقة الأسئلة PDF أو صور)</label><div class="checks" data-atts>${media.items.length ? media.items.map((m) => `<label class="check"><input type="checkbox" name="att" value="${esc(m.id)}" ${atts.has(m.id) ? 'checked' : ''}> <span>${esc(m.title)} <span class="small muted">${fmtSize(m.sizeBytes)}</span></span></label>`).join('') : '<span class="small muted">لا ملفات. ارفع من الزر.</span>'}</div>
                <div style="margin-top:8px"><label class="btn secondary sm" style="cursor:pointer">${icon('upload', 16)} رفع ملف<input type="file" accept="application/pdf,image/*" hidden data-att-file></label> <span class="small muted" data-att-state></span></div></div>
            </section>
            ${kind === 'mcq' ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>الأسئلة <span class="small muted num" data-qcount></span></h3>
              ${locked ? '<span class="badge warn">بدأ الطلاب بالحل — الأسئلة مقفلة</span>' : ''}</div><div data-qs></div>
              ${locked ? '' : `<button type="button" class="btn secondary" data-addq>${icon('plus')} إضافة سؤال</button>`}` : ''}
          </div>
          <aside class="card card-pad" style="position:sticky;top:84px">
            <h3 style="margin-bottom:14px">الإعدادات</h3>
            <div class="field"><label>الصف</label><select class="input" name="classId" ${locked ? 'disabled' : ''}>${cls.items.map((c) => `<option value="${esc(c.id)}" ${c.id === v.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label>يفتح في (اختياري)</label><input class="input" type="datetime-local" name="opensAt" value="${esc(toLocalInput(v.opensAt))}"></div>
            <div class="field"><label>آخر موعد للتسليم</label><input class="input" type="datetime-local" name="dueAt" value="${esc(toLocalInput(v.dueAt))}"></div>
            ${kind === 'mcq' ? `<div class="field"><label>مدة الاختبار (دقائق، 0 = بدون مؤقت)</label><input class="input" type="number" min="0" max="600" name="durationMin" dir="ltr" value="${esc(v.durationMin ?? 0)}"><div class="hint">يبدأ المؤقت عند ضغط الطالب «ابدأ»، ويُسلَّم تلقائياً عند انتهائه.</div></div>`
              : `<div class="field"><label>الدرجة العظمى</label><input class="input" type="number" min="1" max="1000" name="maxScore" dir="ltr" value="${esc(v.maxScore || 10)}"></div>`}
            <div class="field"><label>إظهار النتيجة للطالب</label><select class="input" name="showResults">
              <option value="immediate" ${v.showResults === 'immediate' ? 'selected' : ''}>${kind === 'mcq' ? 'فور التسليم' : 'فور التصحيح'}</option>
              <option value="after_due" ${v.showResults === 'after_due' ? 'selected' : ''}>بعد انتهاء الموعد</option>
              <option value="manual" ${v.showResults === 'manual' ? 'selected' : ''}>عندما أنشرها يدوياً</option></select></div>
            ${kind === 'mcq' ? `<label class="check"><input type="checkbox" name="showAnswers" ${v.showAnswers ? 'checked' : ''}> <span>إظهار الإجابات الصحيحة مع النتيجة</span></label>
              <label class="check"><input type="checkbox" name="shuffle" ${v.shuffle ? 'checked' : ''}> <span>خلط ترتيب الأسئلة لكل طالب</span></label>` : ''}
            <label class="check"><input type="checkbox" name="allowLate" ${v.allowLate ? 'checked' : ''}> <span>قبول التسليم المتأخر (يُعلَّم متأخراً)</span></label>
            <div class="field" style="margin-top:8px"><label>الحالة</label><select class="input" name="status">
              <option value="draft" ${v.status === 'draft' ? 'selected' : ''}>مسودة — لا يراه الطلاب</option>
              <option value="published" ${v.status === 'published' ? 'selected' : ''}>منشور — يصل إشعار للطلاب</option>
              <option value="closed" ${v.status === 'closed' ? 'selected' : ''}>مغلق — لا يقبل تسليمات</option></select></div>
            <button class="btn block" type="submit">${icon('check')} حفظ</button>
          </aside>
        </div>
      </form>`;

    const form = $('[data-form]', root);
    const box = $('[data-qs]', root);
    const drawQs = () => {
      if (!box) return;
      $('[data-qcount]', root).textContent = `(${qs.length} — مجموع العلامات ${qs.reduce((s, q) => s + (Number(q.points) || 0), 0)})`;
      box.innerHTML = qs.map((q, i) => `<div class="q-card" data-q="${i}">
        <div class="q-head"><span class="q-num">${i + 1}</span><b style="flex:1">السؤال ${i + 1}</b>
          <label class="small muted">العلامة <input class="input" type="number" min="1" max="100" data-f="points" value="${esc(q.points)}" dir="ltr" style="width:70px;min-height:34px;padding:4px 8px" ${locked ? 'disabled' : ''}></label>
          ${locked ? '' : `<button type="button" class="icon-btn" data-qup title="أعلى">${icon('up')}</button><button type="button" class="icon-btn" data-qdel title="حذف">${icon('trash')}</button>`}</div>
        <textarea class="input" rows="2" data-f="text" placeholder="نص السؤال (يمكن كتابة الرموز: √ ² ³ π ∫ ≤ ≥ ≠ ÷ ×)" ${locked ? 'disabled' : ''}>${esc(q.text)}</textarea>
        <div style="display:flex;gap:10px;align-items:center;margin:8px 0 12px;flex-wrap:wrap">
          ${q.imageFileId ? `<img class="q-img" data-img="${esc(q.imageFileId)}" alt="صورة السؤال">` : ''}
          ${locked ? '' : `<label class="btn ghost sm" style="cursor:pointer">${icon('image', 16)} ${q.imageFileId ? 'تغيير الصورة' : 'إرفاق صورة (معادلة/شكل)'}<input type="file" accept="image/*" hidden data-qimg></label>${q.imageFileId ? '<button type="button" class="btn ghost sm" data-qimgdel>إزالة الصورة</button>' : ''}`}
          <div class="symbols small" style="display:flex;gap:4px;flex-wrap:wrap">${locked ? '' : ['√', '²', '³', 'π', '∫', '≤', '≥', '≠', '×', '÷', '±', '∞', 'Σ', 'Δ', 'θ', '°'].map((s) => `<button type="button" class="mini" data-sym="${s}" style="cursor:pointer">${s}</button>`).join('')}</div>
        </div>
        ${q.options.map((o, k) => `<div class="opt-row"><button type="button" class="correct" aria-pressed="${q.correctIndex === k}" data-correct="${k}" title="الإجابة الصحيحة" ${locked ? 'disabled' : ''}>${icon('check', 16)}</button>
          <input class="input" data-opt="${k}" value="${esc(o)}" placeholder="الخيار ${'أبجد هوزح'.replace(' ', '')[k] || k + 1}" ${locked ? 'disabled' : ''}>
          ${locked || q.options.length <= 2 ? '' : `<button type="button" class="icon-btn" data-optdel="${k}">${icon('x')}</button>`}</div>`).join('')}
        ${locked || q.options.length >= 8 ? '' : '<button type="button" class="btn ghost sm" data-optadd>+ خيار</button>'}
        <input class="input" style="margin-top:10px" data-f="explanation" value="${esc(q.explanation || '')}" placeholder="شرح الحل (يظهر للطالب بعد النتيجة — اختياري)" ${locked ? 'disabled' : ''}>
      </div>`).join('');
      $$('[data-img]', box).forEach(async (im) => { try { im.src = await fileUrl({ mediaAssetId: im.dataset.img }); } catch (e) { im.alt = 'تعذّر تحميل الصورة'; } });
    };
    drawQs();
    if (box && !locked) {
      box.addEventListener('input', (e) => {
        const card = e.target.closest('[data-q]'); if (!card) return;
        const q = qs[Number(card.dataset.q)];
        if (e.target.dataset.f) { q[e.target.dataset.f] = e.target.dataset.f === 'points' ? Number(e.target.value) || 1 : e.target.value; if (e.target.dataset.f === 'points') $('[data-qcount]', root).textContent = `(${qs.length} — مجموع العلامات ${qs.reduce((s, x) => s + (Number(x.points) || 0), 0)})`; }
        if (e.target.dataset.opt !== undefined) q.options[Number(e.target.dataset.opt)] = e.target.value;
      });
      let lastFocus = null;
      box.addEventListener('focusin', (e) => { if (e.target.matches('textarea, input[data-opt], input[data-f="explanation"]')) lastFocus = e.target; });
      box.addEventListener('click', async (e) => {
        const card = e.target.closest('[data-q]'); if (!card) return;
        const i = Number(card.dataset.q); const q = qs[i];
        const t = e.target.closest('button, [data-sym]'); if (!t) return;
        if (t.dataset.sym) {
          const el = lastFocus && card.contains(lastFocus) ? lastFocus : $('[data-f="text"]', card);
          const p = el.selectionStart ?? el.value.length;
          el.value = el.value.slice(0, p) + t.dataset.sym + el.value.slice(el.selectionEnd ?? p);
          el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); el.setSelectionRange(p + 1, p + 1); return;
        }
        if (t.dataset.correct !== undefined) q.correctIndex = Number(t.dataset.correct);
        else if (t.dataset.optdel !== undefined) { const k = Number(t.dataset.optdel); q.options.splice(k, 1); if (q.correctIndex >= q.options.length) q.correctIndex = 0; else if (q.correctIndex > k) q.correctIndex--; }
        else if (t.hasAttribute('data-optadd')) q.options.push('');
        else if (t.hasAttribute('data-qdel')) { if (qs.length > 1 || await confirmDialog('حذف السؤال', 'حذف السؤال الوحيد؟', 'حذف')) qs.splice(i, 1); }
        else if (t.hasAttribute('data-qup') && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
        else if (t.hasAttribute('data-qimgdel')) q.imageFileId = '';
        else return;
        drawQs();
      });
      box.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-qimg]')) return;
        const card = e.target.closest('[data-q]'); const q = qs[Number(card.dataset.q)];
        const file = e.target.files[0]; if (!file) return;
        try {
          toast('جارٍ رفع الصورة…');
          const b64 = await compressImage(file, 1400);
          const m = await mutate('media.upload', { fileName: 'سؤال.jpg', mimeType: 'image/jpeg', base64: b64, title: 'صورة سؤال — ' + (form.title.value || 'اختبار') });
          q.imageFileId = m.id; drawQs();
        } catch (ex) { toast(ex.message, 'error'); }
      });
      $('[data-addq]', root).onclick = () => { qs.push({ text: '', imageFileId: '', options: ['', '', '', ''], correctIndex: 0, points: 1, explanation: '' }); drawQs(); box.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    }
    $('[data-att-file]', root).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const st = $('[data-att-state]', root); st.textContent = 'جارٍ الرفع…';
      try {
        const b64 = await readFileBase64(file, 25);
        const m = await mutate('media.upload', { fileName: file.name, mimeType: file.type, base64: b64, title: file.name.replace(/\.[^.]+$/, '') });
        const ab = $('[data-atts]', root); if (ab.querySelector('.small.muted')) ab.innerHTML = '';
        ab.insertAdjacentHTML('afterbegin', `<label class="check"><input type="checkbox" name="att" value="${esc(m.id)}" checked> <span>${esc(m.title)}</span></label>`);
        st.textContent = 'رُفع ✓';
      } catch (ex) { st.textContent = ex.message; }
    };
    $('[data-del]', root)?.addEventListener('click', async () => {
      const n = a.hasSubmissions;
      if (!await confirmDialog('حذف ' + (kind === 'mcq' ? 'الاختبار' : 'الواجب'), n ? 'توجد تسليمات للطلاب وستُحذف معه نهائياً مع صور الأوراق.' : 'سيُحذف نهائياً.', 'حذف')) return;
      await mutate('assess.delete', { id: a.id, force: true }); toast('حُذف'); location.hash = '#/assessments';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[type="submit"]', form); const alert = $('[data-alert]', form);
      alert.hidden = true; btn.classList.add('loading');
      try {
        const f = Object.fromEntries(new FormData(form));
        const chk = (n) => !!form.querySelector(`[name="${n}"]`)?.checked;
        if (!f.title?.trim()) throw new Error('اكتب العنوان.');
        const payload = { id: a?.id, kind, classId: f.classId || v.classId, title: f.title.trim(), instructions: f.instructions,
          attachmentIds: $$('[name="att"]:checked', form).map((x) => x.value),
          opensAt: fromLocalInput(f.opensAt), dueAt: fromLocalInput(f.dueAt), durationMin: Number(f.durationMin) || 0, maxScore: Number(f.maxScore) || 10,
          showResults: f.showResults, showAnswers: chk('showAnswers'), shuffle: chk('shuffle'), allowLate: chk('allowLate'), status: f.status };
        if (kind === 'mcq' && !locked) {
          qs.forEach((q, i) => {
            if (!q.text.trim() && !q.imageFileId) throw new Error(`السؤال ${i + 1}: اكتب نص السؤال أو أرفق صورته.`);
            if (q.options.filter((o) => o.trim()).length < 2) throw new Error(`السؤال ${i + 1}: أضف خيارين على الأقل.`);
            if (!q.options[q.correctIndex]?.trim()) throw new Error(`السؤال ${i + 1}: الإجابة الصحيحة المحددة فارغة.`);
          });
          // حذف الخيارات الفارغة مع الحفاظ على مؤشر الإجابة الصحيحة
          payload.questions = qs.map((q) => {
            const correct = q.options[q.correctIndex];
            const opts = q.options.map((o) => o.trim()).filter(Boolean);
            return { ...q, options: opts, correctIndex: opts.indexOf(correct.trim()) };
          });
        }
        const res = await mutate('assess.save', payload);
        toast(res.status === 'published' && a?.status !== 'published' ? 'نُشر ووصل إشعار لطلاب الصف' : 'حُفظ');
        if (!a) location.hash = '#/assessment?id=' + res.id; else editor(root, params);
      } catch (ex) { alert.textContent = ex.message; alert.hidden = false; alert.scrollIntoView({ block: 'center' }); }
      finally { btn.classList.remove('loading'); }
    });
  });
}

// ════════════ التصحيح: قائمة ما يحتاج تصحيحاً ════════════
export function grading(root) {
  return guarded(root, async () => {
    const r = await api('assess.list', {}, { fresh: true });
    const items = r.items.filter((a) => a.status !== 'draft');
    const pending = items.filter((a) => a.stats.pending);
    const manualPending = items.filter((a) => a.showResults === 'manual' && a.stats.graded);
    root.innerHTML = head('الاختبارات والواجبات', 'التصحيح', 'الأوراق المصوّرة التي سلّمها الطلاب. الاختبارات المؤتمتة تُصحَّح تلقائياً.') + `
      ${pending.length ? `<div class="class-grid" style="margin-bottom:24px">${pending.map((a) => `<a class="card class-card" href="#/submissions?id=${esc(a.id)}" style="text-decoration:none;color:inherit;--c:var(--brass)">
        <h3>${esc(a.title)}</h3><div class="small muted">${esc(a.className)} · ${KIND_SHORT[a.kind]}</div>
        <div class="nums"><div><b>${a.stats.pending}</b>بانتظار التصحيح</div><div><b>${a.stats.graded}</b>مصحح</div><div><b>${a.classStudents}</b>طالب</div></div>
        <span class="btn sm" style="justify-self:start">ابدأ التصحيح</span></a>`).join('')}</div>`
        : `<div class="card" style="margin-bottom:24px">${emptyState('لا أوراق بانتظار التصحيح', 'عندما يسلّم الطلاب واجباتهم الورقية ستظهر هنا.')}</div>`}
      ${manualPending.length ? `<section class="card" style="margin-bottom:24px"><div class="card-head"><h3>نتائج لم تُنشر بعد للطلاب</h3></div><ul class="list-plain">${manualPending.map((a) => `<li style="align-items:center"><span style="flex:1"><b>${esc(a.title)}</b> <span class="small muted">${esc(a.className)}</span></span><button class="btn sm" data-release="${esc(a.id)}">نشر النتائج</button></li>`).join('')}</ul></section>` : ''}
      <section class="card"><div class="card-head"><h3>كل الاختبارات والواجبات المنشورة</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>العنوان</th><th>الصف</th><th>النوع</th><th>سلّم</th><th>مصحح</th><th></th></tr></thead><tbody>
        ${items.map((a) => `<tr><td><b>${esc(a.title)}</b></td><td class="small">${esc(a.className)}</td><td class="small">${KIND_SHORT[a.kind]}</td><td class="num">${a.stats.submitted + a.stats.graded} / ${a.classStudents}</td><td class="num">${a.stats.graded}</td>
          <td style="text-align:left"><a class="btn secondary sm" href="#/submissions?id=${esc(a.id)}">النتائج</a></td></tr>`).join('') || `<tr><td colspan="6">${emptyState('لا شيء', 'لم يُنشر أي اختبار بعد.')}</td></tr>`}
        </tbody></table></div></section>`;
    $$('[data-release]', root).forEach((b) => b.onclick = async () => { const x = await mutate('assess.release', { id: b.dataset.release }); toast(`نُشرت النتيجة لـ ${x.released} طالب`); grading(root); });
    badges();
  });
}

// ════════════ تسليمات اختبار/واجب ════════════
export function submissions(root, params) {
  const id = params.get('id');
  return guarded(root, async () => {
    const r = await api('assess.submissions', { id }, { fresh: true });
    const a = r.assessment;
    const max = a.kind === 'mcq' ? a.questions.reduce((s, q) => s + q.points, 0) : a.maxScore;
    const done = r.items.filter((x) => x.score != null);
    const avg = done.length ? done.reduce((s, x) => s + x.score, 0) / done.length : null;
    const firstPending = r.items.find((x) => x.status === 'submitted');
    root.innerHTML = head(a.className + ' · ' + KIND_SHORT[a.kind], a.title, a.dueAt ? 'آخر موعد: ' + fmtDateTime(a.dueAt) : '',
      `<a class="btn ghost" href="#/grading">رجوع</a><button class="btn secondary" data-print>${icon('print')} طباعة النتائج</button>
       ${a.showResults === 'manual' ? '<button class="btn secondary" data-release>نشر النتائج للطلاب</button>' : ''}
       ${firstPending ? `<a class="btn" href="#/grade?id=${esc(firstPending.submissionId)}">${icon('check')} صحّح التالي</a>` : ''}`) + `
      <div class="print-only"><div class="print-head"><div><h2>${esc(a.title)}</h2><div>${esc(a.className)} — ${KIND_SHORT[a.kind]}</div></div><div class="small">${fmtDateTime(new Date().toISOString())}</div></div></div>
      <div class="grid cols-4" style="margin-bottom:20px">
        <div class="card stat c1"><div class="label">سلّموا</div><div class="value"><bdi dir="ltr">${r.items.filter((x) => ['submitted', 'graded'].includes(x.status)).length} / ${r.items.length}</bdi></div></div>
        <div class="card stat c2"><div class="label">بانتظار التصحيح</div><div class="value">${r.items.filter((x) => x.status === 'submitted').length}</div></div>
        <div class="card stat c3"><div class="label">متوسط الدرجات</div><div class="value"><bdi dir="ltr">${avg == null ? '—' : (Math.round(avg * 10) / 10) + ' / ' + max}</bdi></div></div>
        <div class="card stat c4"><div class="label">لم يسلّموا</div><div class="value">${r.items.filter((x) => ['todo', 'missed'].includes(x.status)).length}</div></div>
      </div>
      <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>الطالب</th><th>الحالة</th><th>وقت التسليم</th><th>الدرجة</th>${a.kind === 'paper' ? '<th class="no-print">الصور</th>' : ''}<th class="no-print"></th></tr></thead><tbody>
      ${r.items.map((x, i) => `<tr><td class="num small">${i + 1}</td><td><div class="person"><span class="avatar">${initials(x.fullName)}</span><b>${esc(x.fullName)}</b></div></td>
        <td>${subBadge(x.status)} ${x.late ? '<span class="badge bad">متأخر</span>' : ''} ${x.status === 'graded' && !x.released ? '<span class="badge plain no-print">غير منشورة</span>' : ''}</td>
        <td class="small">${fmtDateTime(x.submittedAt)}</td><td><bdi dir="ltr"><b>${x.score == null ? '—' : x.score}</b>${x.score == null ? '' : ' / ' + max}</bdi></td>
        ${a.kind === 'paper' ? `<td class="num small no-print">${x.photos || '—'}</td>` : ''}
        <td class="no-print" style="text-align:left">${x.submissionId && x.status !== 'in_progress' ? `<a class="btn ${x.status === 'submitted' ? '' : 'secondary'} sm" href="#/grade?id=${esc(x.submissionId)}">${x.status === 'submitted' ? 'صحّح' : 'عرض'}</a>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="7">${emptyState('لا طلاب', 'لا يوجد طلاب في هذا الصف.')}</td></tr>`}
      </tbody></table></div></section>`;
    $('[data-print]', root).onclick = () => window.print();
    $('[data-release]', root)?.addEventListener('click', async () => { const x = await mutate('assess.release', { id }); toast(`نُشرت النتيجة لـ ${x.released} طالب`); submissions(root, params); });
  });
}

// ════════════ تصحيح ورقة ════════════
export function grade(root, params) {
  const id = params.get('id');
  return guarded(root, async () => {
    const s = await api('assess.submission', { id }, { fresh: true });
    const a = s.assessment;
    const list = await api('assess.submissions', { id: a.id }, { fresh: true });
    const queue = list.items.filter((x) => x.status === 'submitted' && x.submissionId !== s.id);
    const next = queue[0];
    root.innerHTML = head(a.title, s.student.fullName, `سلّم ${fmtDateTime(s.submittedAt)}${s.late ? ' — متأخر' : ''}`,
      `<a class="btn ghost" href="#/submissions?id=${esc(a.id)}">كل التسليمات</a>${next ? `<a class="btn secondary" href="#/grade?id=${esc(next.submissionId)}">التالي (${queue.length})</a>` : ''}`) + `
      <div class="grade-layout">
        <section class="card card-pad">
          ${a.kind === 'paper' ? `<h3 style="margin-bottom:12px">${icon('camera')} صور ورقة الإجابة <span class="small muted">(${s.photos.length}) — اضغط للتكبير</span></h3>
            <div class="photos" data-photos>${s.photos.map((p, i) => `<button type="button" data-ph="${i}" aria-label="الصورة ${i + 1}"><div class="skeleton" style="height:100%"></div></button>`).join('') || '<p class="muted">لا صور.</p>'}</div>
            ${s.note ? `<div class="answer-box" style="margin-top:14px"><div class="small muted">ملاحظة الطالب:</div>${esc(s.note)}</div>` : ''}`
          : `<h3 style="margin-bottom:12px">إجابات الطالب</h3>${(s.review || []).map((q, i) => `<div class="q-card"><div class="q-head"><span class="q-num" style="background:${q.correct ? 'var(--mint)' : 'var(--danger)'}">${i + 1}</span><b style="flex:1">${esc(q.text)}</b><span class="small muted num">${q.correct ? q.points : 0} / ${q.points}</span></div>
              ${q.options.map((o, k) => `<div class="small" style="padding:4px 8px;border-radius:6px;${k === q.correctIndex ? 'background:var(--mint-soft);' : ''}${k === q.chosen && !q.correct ? 'background:var(--danger-soft);' : ''}">${k === q.chosen ? '● ' : '○ '}${esc(o)}${k === q.correctIndex ? ' ✓' : ''}</div>`).join('')}</div>`).join('')}`}
        </section>
        <aside class="card card-pad sticky">
          <form novalidate data-grade>
            <div class="alert error" hidden data-alert></div>
            <div class="field"><label>الدرجة (من ${a.maxScore})</label><div style="display:flex;align-items:center;gap:10px"><input class="input score-input" name="score" type="number" min="0" max="${a.maxScore}" step="0.5" dir="ltr" value="${s.score ?? ''}" required><span class="muted" style="font-size:20px">/ ${a.maxScore}</span></div>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">${[a.maxScore, a.maxScore * 0.9, a.maxScore * 0.75, a.maxScore / 2, 0].map((n) => `<button type="button" class="mini" data-quick="${Math.round(n * 2) / 2}" style="cursor:pointer">${Math.round(n * 2) / 2}</button>`).join('')}</div></div>
            <div class="field"><label>ملاحظة للطالب</label><textarea class="input" name="feedback" rows="5" placeholder="مثال: الحل صحيح لكن انتبه لإشارة الجذر في الخطوة الثالثة.">${esc(s.feedback || '')}</textarea>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${['ممتاز، أحسنت 👏', 'حل صحيح مع أخطاء حسابية بسيطة', 'راجع القانون المستخدم', 'الخطوات ناقصة — اكتب الحل كاملاً', 'الصورة غير واضحة، أعد التصوير'].map((t) => `<button type="button" class="mini" data-fb="${esc(t)}" style="cursor:pointer">${esc(t)}</button>`).join('')}</div></div>
            ${a.kind === 'paper' ? '' : ''}
            <label class="check"><input type="checkbox" name="release" checked> <span>إرسال النتيجة للطالب الآن (إشعار)</span></label>
            <button class="btn block" type="submit">${icon('check')} حفظ الدرجة${next ? ' والانتقال للتالي' : ''}</button>
            ${s.status === 'graded' ? `<p class="small muted" style="margin:10px 0 0">صُحّحت ${fmtDateTime(s.gradedAt)}</p>` : ''}
            <button type="button" class="btn ghost sm" data-reopen style="margin-top:8px">إعادة فتح التسليم للطالب (ليعيد الرفع)</button>
          </form>
        </aside>
      </div>`;
    if (a.kind === 'paper') {
      const urls = [];
      await Promise.all(s.photos.map(async (p, i) => {
        try {
          urls[i] = await fileUrl({ submissionId: s.id, index: i });
          const b = $(`[data-ph="${i}"]`, root); if (b) b.innerHTML = `<img src="${urls[i]}" alt="صفحة ${i + 1}">`;
        } catch (e) { const b = $(`[data-ph="${i}"]`, root); if (b) b.textContent = 'تعذّر التحميل'; }
      }));
      $$('[data-ph]', root).forEach((b) => b.onclick = () => urls.length && imageViewer(urls.filter(Boolean), Number(b.dataset.ph)));
    }
    const form = $('[data-grade]', root);
    $$('[data-quick]', root).forEach((b) => b.onclick = () => { form.score.value = b.dataset.quick; });
    $$('[data-fb]', root).forEach((b) => b.onclick = () => { form.feedback.value = (form.feedback.value ? form.feedback.value + '\n' : '') + b.dataset.fb; });
    $('[data-reopen]', root).onclick = async () => {
      if (!await confirmDialog('إعادة فتح التسليم', 'سيتمكن الطالب من حذف الصور وإعادة التصوير والتسليم من جديد.', 'إعادة فتح', false)) return;
      await mutate('assess.reopen', { submissionId: s.id }); toast('أُعيد فتح التسليم'); badges(); location.hash = '#/submissions?id=' + a.id;
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[type="submit"]', form); const alert = $('[data-alert]', form); alert.hidden = true; btn.classList.add('loading');
      try {
        if (form.score.value === '') throw new Error('اكتب الدرجة.');
        await mutate('assess.grade', { submissionId: s.id, score: Number(form.score.value), feedback: form.feedback.value.trim(), release: form.release.checked });
        toast('حُفظت الدرجة'); badges();
        location.hash = next ? '#/grade?id=' + next.submissionId : '#/submissions?id=' + a.id;
      } catch (ex) { alert.textContent = ex.message; alert.hidden = false; }
      finally { btn.classList.remove('loading'); }
    });
  });
}
