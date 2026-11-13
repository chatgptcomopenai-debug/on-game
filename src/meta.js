// Прогресс игрока (хранится на устройстве): уровень, опыт, монеты, шапки
const KEY = 'izb-meta-v1';
export const HAT_LIST = [
  { id: 'none', name: 'Без шапки', lvl: 1, cost: 0 },
  { id: 'cap', name: 'Кепка', lvl: 1, cost: 0 },
  { id: 'band', name: 'Повязка ниндзя', lvl: 2, cost: 0 },
  { id: 'flower', name: 'Цветочек', lvl: 1, cost: 60 },
  { id: 'cat', name: 'Кошачьи ушки', lvl: 1, cost: 120 },
  { id: 'horns', name: 'Шлем викинга', lvl: 3, cost: 0 },
  { id: 'chef', name: 'Колпак повара', lvl: 4, cost: 0 },
  { id: 'cowboy', name: 'Ковбойская шляпа', lvl: 1, cost: 200 },
  { id: 'wizard', name: 'Колпак мага', lvl: 1, cost: 260 },
  { id: 'top', name: 'Цилиндр', lvl: 1, cost: 320 },
  { id: 'pirate', name: 'Пират', lvl: 5, cost: 200 },
  { id: 'halo', name: 'Нимб', lvl: 8, cost: 0 },
];
const DEF = { xp: 0, level: 1, coins: 0, owned: ['none', 'cap'], hat: 'none', hero: 'brawler', games: 0, wins: 0 };
let M = { ...DEF };
try { M = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch {} };
export const meta = () => M;
export const xpNeed = lvl => 150 + lvl * 100;
export function hatState(h) {
  if (M.owned.includes(h.id)) return 'owned';
  if (M.level < h.lvl) return 'locked';
  return h.cost > 0 ? 'buy' : 'free';
}
export function selectHat(id) {
  const h = HAT_LIST.find(x => x.id === id); if (!h) return 'Нет такой шапки';
  const s = hatState(h);
  if (s === 'locked') return `Откроется на ${h.lvl} уровне`;
  if (s === 'buy') { if (M.coins < h.cost) return `Нужно ${h.cost} 💰`; M.coins -= h.cost; M.owned.push(id); }
  if (s === 'free') M.owned.push(id);
  M.hat = id; save(); return true;
}
// награда за матч
export function reward(score, place, n) {
  const coins = Math.round(score / 25) + [40, 25, 15][place] + (n > 3 ? 5 : 0) | 0;
  const xp = Math.round(score / 2) + 30;
  const before = M.level;
  M.coins += coins; M.xp += xp; M.games++; if (place === 0) M.wins++;
  while (M.xp >= xpNeed(M.level)) { M.xp -= xpNeed(M.level); M.level++; }
  const unlocked = HAT_LIST.filter(h => h.lvl > before && h.lvl <= M.level && !h.cost).map(h => { if (!M.owned.includes(h.id)) M.owned.push(h.id); return h.name; });
  save();
  return { coins, xp, levelUp: M.level > before, level: M.level, unlocked };
}
export function selectHero(id) { M.hero = id; save(); }
