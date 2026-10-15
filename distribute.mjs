// Pure distribution logic: no DOM, no Firebase. Shared by app.js and check-distribute.mjs.

export const UNITS = [
  { id: '2', label: 'الوحدة الثانية' },
  { id: '4', label: 'الوحدة الرابعة' },
];

// Each row is one group: one person per unit does all of it. Each call is half an hour
// (كول ١ = 12–1, كول ٢ = 1–2). `tasks` feed the no-repeat rule.
export const ROWS = [
  { id: 'g1', label: 'الجارت + كول المغذيات', tasks: ['jaret', 'nutrition_call'] },
  { id: 'g2', label: 'الحبوب + كول ٢', time: '1:00 – 1:30', tasks: ['tablets', 'call2'] },
  { id: 'g3', label: 'الألبومين + التوزيع + كول ١', time: '12:00 – 12:30', tasks: ['albumin', 'distribution', 'call1'] },
  { id: 'g4', label: 'التجهيز + التوزيع + كول ١', time: '12:30 – 1:00', tasks: ['prep', 'distribution', 'call1'] },
  { id: 'g5', label: 'الإضافي + جارت نسائية + كول ٢', time: '1:30 – 2:00', tasks: ['extra', 'women_jaret', 'call2'] },
  { id: 'g6', label: 'التوزيع + كول ١', time: '12:00 – 12:30', tasks: ['distribution', 'call1'] },
  // Fixed: 1st crash-cart name → الوحدة الثانية, 2nd → الوحدة الرابعة. They also take part in the random groups.
  { id: 'crash', label: 'دواليب الصدمة', tasks: [], fixed: true },
];

const randomRows = ROWS.filter((r) => !r.fixed);
const rowById = Object.fromEntries(ROWS.map((r) => [r.id, r]));

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Map staffId -> Set of tasks they held in one saved schedule.
function tasksByStaff(schedule) {
  const byStaff = new Map();
  for (const rows of Object.values(schedule?.assignments ?? {})) {
    for (const [rowId, staffId] of Object.entries(rows)) {
      if (!staffId || !rowById[rowId]) continue;
      if (!byStaff.has(staffId)) byStaff.set(staffId, new Set());
      for (const t of rowById[rowId].tasks) byStaff.get(staffId).add(t);
    }
  }
  return byStaff;
}

// staff: [{ id, name, onLeave }]
// crashCartIds: the two fixed names (they are still drawn into the random groups too)
// history: saved schedules for earlier dates, newest first
export function distribute({ staff, units, crashCartIds = [], history = [], rand = Math.random, maxTries = 200 }) {
  const pool = staff.filter((s) => !s.onLeave).map((s) => s.id);
  const yesterday = tasksByStaff(history[0]);
  const dayBefore = tasksByStaff(history[1]);
  // Blocked if the person did any of this group's tasks on both of the last two saved days.
  const blocked = (staffId, cell) =>
    cell.tasks.some((t) => yesterday.get(staffId)?.has(t) && dayBefore.get(staffId)?.has(t));

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const cells = shuffle(
      units.flatMap((unit) => randomRows.map((r) => ({ unit, rowId: r.id, tasks: r.tasks }))),
      rand,
    );
    const people = shuffle([...pool], rand);
    const pairs = people.slice(0, cells.length).map((id, i) => [id, cells[i]]);
    if (pairs.some(([id, cell]) => blocked(id, cell))) continue;

    const assignments = Object.fromEntries(
      units.map((u) => [u, Object.fromEntries(ROWS.map((r) => [r.id, null]))]),
    );
    for (const [id, cell] of pairs) assignments[cell.unit][cell.rowId] = id;
    for (const u of units) assignments[u].crash = crashCartIds[UNITS.findIndex((x) => x.id === u)] ?? null;
    return { ok: true, assignments };
  }
  return { ok: false, assignments: null };
}
