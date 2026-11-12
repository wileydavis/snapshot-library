// Which snapshots are shown, and in what order: FIND, the map's square, WITH SOUND, then the order.
import { energyRow, brightCol, distance } from './profile.js';

export function narrow(all, { find = '', cell = null, soundOnly = false, order = 'new', near = null } = {}) {
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  let list = all.filter((s) => {
    if (soundOnly && !s.has_clip) return false;
    if (cell && !(s.p && 3 - energyRow(s.p) === cell[0] && brightCol(s.p) === cell[1])) return false;
    if (!words.length) return true;
    const hay = [s.name, s.notes, ...(s.tags || []), ...(s.effects || [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const t = (s) => s.taken_at || s.received_at || 0;
  const by = (f, dir) => (a, b) => {                      // those with no sound kept go last
    if (!a.p || !b.p) return (a.p ? 0 : 1) - (b.p ? 0 : 1) || t(b) - t(a);
    return dir * (f(a.p) - f(b.p)) || t(b) - t(a);
  };
  const sorts = {
    new: (a, b) => t(b) - t(a), old: (a, b) => t(a) - t(b),
    'energy-up': by((p) => p.energy, 1), 'energy-down': by((p) => p.energy, -1),
    'bright-up': by((p) => p.bright, 1), 'bright-down': by((p) => p.bright, -1),
    name: (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }),
    like: near && near.p ? by((p) => distance(near.p, p), 1) : (a, b) => t(b) - t(a),
  };
  return list.sort(sorts[order] || sorts.new);
}
