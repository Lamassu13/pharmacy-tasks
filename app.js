import { UNITS, ROWS, distribute } from './distribute.mjs?v=5';

// All data lives in this browser's localStorage (single user, no server).
const KEY = 'pharmacy-tasks';
const $ = (id) => document.getElementById(id);

function load() {
  try {
    return { staff: [], crashCart: [], schedules: {}, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { staff: [], crashCart: [], schedules: {} };
  }
}
const data = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(data));

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sortedStaff = () => [...data.staff].sort((x, y) => x.name.localeCompare(y.name, 'ar'));

function setMsg(text, isError = false) {
  $('msg').textContent = text;
  $('msg').className = isError ? 'msg error' : 'msg';
}

// ---------- Staff ----------

function renderStaff() {
  $('staff-list').innerHTML = sortedStaff().map((s) => `
    <li>
      <label><input type="checkbox" data-id="${s.id}" ${s.onLeave ? '' : 'checked'}> ${esc(s.name)}</label>
      <span class="hint">${s.onLeave ? 'مجاز' : ''}</span>
      <button class="del" data-id="${s.id}" title="حذف">🗑</button>
    </li>`).join('');
}

$('staff-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('staff-name').value.trim();
  if (!name) return;
  data.staff.push({ id: newId(), name, onLeave: false });
  save();
  $('staff-name').value = '';
  renderAll();
});

// Checked = available (✅), unchecked = on leave (مجاز)
$('staff-list').addEventListener('change', (e) => {
  if (!e.target.matches('input[type=checkbox]')) return;
  data.staff.find((s) => s.id === e.target.dataset.id).onLeave = !e.target.checked;
  save();
  renderAll();
});

$('staff-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.del');
  if (!btn || !confirm('حذف الموظف؟')) return;
  data.staff = data.staff.filter((s) => s.id !== btn.dataset.id);
  data.crashCart = data.crashCart.filter((id) => id !== btn.dataset.id);
  save();
  renderAll();
});

// ---------- Crash-cart pair (fixed) ----------

function renderCrashSelects() {
  const opts = (selected) => ['<option value="">— اختر —</option>',
    ...sortedStaff().map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`)].join('');
  $('crash-a').innerHTML = opts(data.crashCart[0]);
  $('crash-b').innerHTML = opts(data.crashCart[1]);
}

for (const id of ['crash-a', 'crash-b']) {
  $(id).addEventListener('change', () => {
    data.crashCart = [$('crash-a').value, $('crash-b').value].filter(Boolean);
    // Show the fixed names in today's table straight away: 1st → الوحدة الثانية, 2nd → الوحدة الرابعة.
    const day = (data.schedules[$('date').value] ??= { assignments: {} });
    UNITS.forEach((u, i) => ((day.assignments[u.id] ??= {}).crash = data.crashCart[i] ?? null));
    save();
    renderTable();
  });
}

// ---------- Schedule ----------

const assignments = () => data.schedules[$('date').value]?.assignments ?? {};

function renderTable() {
  const a = assignments();
  const opts = (selected) => ['<option value="">—</option>',
    ...sortedStaff().map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}${s.onLeave ? ' (مجاز)' : ''}</option>`)].join('');
  const rows = ROWS.map((r) => `
    <tr>
      <th class="task">${r.label}${r.time ? `<small class="time">${r.time.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]).split(' – ').map((t) => `<span>${t}</span>`).join('<span>–</span>')}</small>` : ''}</th>
      ${UNITS.map((u) => `<td><select data-unit="${u.id}" data-row="${r.id}">${opts(a[u.id]?.[r.id])}</select></td>`).join('')}
    </tr>`).join('');
  $('schedule').innerHTML = `
    <thead><tr><th>المهمة</th>${UNITS.map((u) => `<th>${u.label}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>`;
}

// Manual edits: each change writes only that one cell.
$('schedule').addEventListener('change', (e) => {
  const { unit, row } = e.target.dataset;
  if (!unit) return;
  const day = (data.schedules[$('date').value] ??= { assignments: {} });
  (day.assignments[unit] ??= {})[row] = e.target.value || null;
  save();
});

// Saved schedules strictly before `date`, newest first.
const history = (date) => Object.keys(data.schedules)
  .filter((d) => d < date)
  .sort()
  .reverse()
  .slice(0, 2)
  .map((d) => data.schedules[d]);

$('generate').addEventListener('click', () => {
  const units = UNITS.map((u) => u.id).filter((id) => $(`unit-${id}`).checked);
  const date = $('date').value;
  if (!units.length) return setMsg('اختر وحدة واحدة على الأقل', true);

  const res = distribute({ staff: data.staff, units, crashCartIds: data.crashCart, history: history(date) });
  if (!res.ok) {
    return setMsg('تعذّر التوزيع دون تكرار المهمة أكثر من يومين متتاليين. أضف موظفين أو عدّل المجازين.', true);
  }
  // Replaces the whole day: units that are unchecked are cleared.
  data.schedules[date] = { assignments: res.assignments };
  save();
  renderTable();
  setMsg('تم التوزيع ✅');
});

$('date').addEventListener('change', renderTable);

// ---------- Backup (browser data can be cleared) ----------

$('export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `pharmacy-backup-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import').addEventListener('change', async (e) => {
  try {
    const imported = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(imported.staff)) throw new Error('bad file');
    Object.assign(data, { crashCart: [], schedules: {} }, imported);
    save();
    renderAll();
    setMsg('تم الاستيراد ✅');
  } catch {
    setMsg('ملف غير صالح', true);
  }
  e.target.value = '';
});

// ---------- Boot ----------

function renderAll() {
  renderStaff();
  renderCrashSelects();
  renderTable();
}

$('date').value = todayIso();
renderAll();
