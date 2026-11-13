// Пиксельный персонаж 12×18 в стиле референса (базовое тело + футболка цвета игрока)
const BODY_TOP = [
  '...oooooo...',
  '..osshhsso..',
  '..osssssso..',
  '..osesseso..',
  '..osssssso..',
  '...odssdo...',
  '....oddo....',
  '..occcccco..',
  '.occcccccco.',
  '.osccccccso.',
  '.osccccccso.',
  '.osppppppso.',
  '..oppppppo..',
];
const LEGS = {
  stand: ['..osso.osso.', '..osso.osso.', '..osso.osso.', '..oddo.oddo.', '..oooo.oooo.'],
  walkA: ['.osso..osso.', '.osso..osso.', 'osso....osso', 'oddo....oddo', 'oooo....oooo'],
  walkB: ['...osssso...', '...osssso...', '...osssso...', '...oddddo...', '...oooooo...'],
  jump:  ['..osso.osso.', '..oddo.oddo.', '..oooo.oooo.', '............', '............'],
};
const PUNCH = ['.occcccccco.', '.osccccccsss', '.oscccccco..']; // рука вперёд (строки 8–10)

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c})`;
}

const cache = new Map();
export function getSprite(color, frame, punch) {
  const key = color + frame + (punch ? 'p' : '');
  if (cache.has(key)) return cache.get(key);
  const rows = [...BODY_TOP, ...LEGS[frame]];
  if (punch) rows.splice(8, 3, ...PUNCH);
  const pal = { o: '#6b3f1d', s: '#f2cc96', h: '#ffe4b8', d: '#d39a5c', e: '#4a2c12',
    c: color, p: shade(color, 0.55) };
  const cv = document.createElement('canvas'); cv.width = 12; cv.height = 18;
  const g = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  cache.set(key, cv);
  return cv;
}
