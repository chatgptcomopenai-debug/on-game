// Прогресс игрока (хранится на устройстве): кубки и лига, уровень, монеты, шапки, герои, задания
import { CFG } from './config.js';
const KEY = 'izb-meta-v2';
export const HAT_LIST = [
  { id: 'none', name: 'Без шапки', lvl: 1, cost: 0 },
  { id: 'cap', name: 'Кепка', lvl: 1, cost: 0 },
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
export const LEAGUES = [[0, 'Бронза', '🥉'], [30, 'Серебро', '🥈'], [80, 'Золото', '🥇'], [160, 'Алмаз', '💎'], [300, 'Легенда', '👑']];
const QUESTS = [
  { k: 'games', n: 3, text: 'Сыграй 3 матча', coins: 40 },
  { k: 'wins', n: 1, text: 'Победи в матче', coins: 60 },
  { k: 'dmg', n: 1200, text: 'Нанеси 1200 урона', coins: 50 },
  { k: 'kos', n: 8, text: 'Выбей 8 охотников, будучи Избранным', coins: 60 },
  { k: 'slays', n: 4, text: 'Добей Избранного 4 раза', coins: 60 },
  { k: 'picks', n: 12, text: 'Подбери 12 оружий', coins: 40 },
  { k: 'pts', n: 15, text: 'Набери 15 очков короны', coins: 50 },
];
const DEF = { xp: 0, level: 1, coins: 0, trophies: 0, owned: ['none', 'cap'], hat: 'none', hero: 'brawler', games: 0, wins: 0, quests: [] };
let M = { ...DEF };
try { M = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch {} };
function fillQuests() { while (M.quests.length < 3) { const free = QUESTS.filter(q => !M.quests.some(a => a.k === q.k)); const q = free[Math.floor(Math.random() * free.length)]; M.quests.push({ k: q.k, p: 0 }); } }
fillQuests();
export const meta = () => M;
export const xpNeed = lvl => 150 + lvl * 100;
export const league = (t = M.trophies) => { let l = LEAGUES[0]; for (const x of LEAGUES) if (t >= x[0]) l = x; return l; };
export const questInfo = q => { const d = QUESTS.find(x => x.k === q.k); return { ...d, p: Math.min(q.p, d.n) }; };
export const heroUnlocked = k => M.trophies >= (CFG.heroes[k].unlock || 0);
export function hatState(h) { if (M.owned.includes(h.id)) return 'owned'; if (M.level < h.lvl) return 'locked'; return h.cost > 0 ? 'buy' : 'free'; }
export function selectHat(id) {
  const h = HAT_LIST.find(x => x.id === id); if (!h) return 'Нет такой шапки';
  const s = hatState(h);
  if (s === 'locked') return `Откроется на ${h.lvl} уровне`;
  if (s === 'buy') { if (M.coins < h.cost) return `Нужно ${h.cost} 💰`; M.coins -= h.cost; M.owned.push(id); }
  if (s === 'free') M.owned.push(id);
  M.hat = id; save(); return true;
}
export function selectHero(id) { if (!heroUnlocked(id)) return false; M.hero = id; save(); return true; }
// награда за матч: place — место (0 = победа), n — игроков, st — статистика игрока, pts — очки короны
export function reward(place, n, st, pts) {
  const before = { level: M.level, league: league()[1], trophies: M.trophies };
  const tro = [8, 4, 1, -2, -3, -3][Math.min(5, place)] + (place === 0 && n >= 5 ? 2 : 0);
  let coins = 10 + pts * 3 + [30, 15, 8, 0, 0, 0][Math.min(5, place)];
  const xp = 40 + pts * 12 + Math.round(st.dmg / 20);
  M.trophies = Math.max(0, M.trophies + tro); M.games++; if (place === 0) M.wins++;
  const add = { games: 1, wins: place === 0 ? 1 : 0, dmg: st.dmg, kos: st.kos, slays: st.slays, picks: st.picks, pts };
  const done = [];
  for (const q of M.quests) { q.p += add[q.k] || 0; const d = QUESTS.find(x => x.k === q.k); if (q.p >= d.n) { done.push(d); coins += d.coins; } }
  M.quests = M.quests.filter(q => q.p < QUESTS.find(x => x.k === q.k).n); fillQuests();
  M.coins += coins; M.xp += xp;
  while (M.xp >= xpNeed(M.level)) { M.xp -= xpNeed(M.level); M.level++; }
  const hats = HAT_LIST.filter(h => h.lvl > before.level && h.lvl <= M.level && !h.cost).map(h => { if (!M.owned.includes(h.id)) M.owned.push(h.id); return h.name; });
  const heroes = Object.keys(CFG.heroes).filter(k => (CFG.heroes[k].unlock || 0) > before.trophies && (CFG.heroes[k].unlock || 0) <= M.trophies).map(k => CFG.heroes[k].name);
  save();
  return { coins, xp, tro, levelUp: M.level > before.level, level: M.level, leagueUp: league()[1] !== before.league && tro > 0 ? league() : null, hats, heroes, done };
}
