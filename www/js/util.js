// Shared helpers: DOM, text, dates, avatars, icons and photo/voice processing

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const haptic = p => { try { navigator.vibrate && navigator.vibrate(p || 8); } catch (e) {} };
export const LS = {
  get(k) { try { const v = localStorage.getItem(k); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

// Text with links turned clickable (escaped first)
export function linkify(t) {
  return esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

/* ---------- dates ---------- */
export const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const pad = n => String(n).padStart(2, '0');
export const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const dayKey = t => iso(new Date(t));
export const hhmm = t => { const d = new Date(t); return d.getHours() + ':' + pad(d.getMinutes()); };
export const fmtDur = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
export const ago = t => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'עכשיו';
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`;
  if (s < 172800) return 'אתמול';
  return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
};
export const listTime = t => {
  const d = new Date(t), n = new Date();
  if (iso(d) === iso(n)) return hhmm(t);
  n.setDate(n.getDate() - 1);
  if (iso(d) === iso(n)) return 'אתמול';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
};
export const dayLabel = t => {
  const k = dayKey(t), n = new Date();
  if (k === iso(n)) return 'היום';
  n.setDate(n.getDate() - 1);
  if (k === iso(n)) return 'אתמול';
  return new Date(t).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
};
export const daysTo = s => {
  const p = s.split('-').map(Number), t = new Date(p[0], p[1] - 1, p[2], 12), n = new Date();
  n.setHours(12, 0, 0, 0);
  return Math.round((t - n) / 864e5);
};
// Next birthday from a stored 'YYYY-MM-DD' (or 'MM-DD'): {date:'YYYY-MM-DD', days, age|null}
export function nextBirthday(b) {
  if (!b) return null;
  const p = b.split('-').map(Number), y = p.length === 3 ? p[0] : null, m = p.length === 3 ? p[1] : p[0], d = p.length === 3 ? p[2] : p[1];
  if (!m || !d) return null;
  const now = new Date(); now.setHours(12, 0, 0, 0);
  let year = now.getFullYear(), t = new Date(year, m - 1, d, 12);
  if (t < now && iso(t) !== iso(now)) { year++; t = new Date(year, m - 1, d, 12); }
  return { date: iso(t), days: Math.round((t - now) / 864e5), age: y ? year - y : null };
}

/* ---------- people & groups ---------- */
export const COLORS = ['orange', 'blue', 'green', 'pink', 'purple', 'teal'];
export const EMOJIS = ['🏠', '❤️', '🌳', '👨‍👩‍👧‍👦', '🎉', '🍽️', '✈️', '⚽', '🐶', '🌻'];
export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
export const first = n => String(n || '').trim().split(/\s+/)[0];
export const nameOf = u => (u && u.name) || 'בן/בת משפחה';
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const userColor = id => `var(--g-${COLORS[hash(id) % COLORS.length]})`;
export const chatId = (a, b) => [a, b].sort().join('_');
export function newCode() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, x => a[x % a.length]).join('');
}
export function avatar(u, size) {
  size = size || 36;
  if (u && u.photo) return `<img class="av-img" src="${esc(u.photo)}" width="${size}" height="${size}" alt="" referrerpolicy="no-referrer" loading="lazy">`;
  return `<span class="av-ini" style="--c:${userColor((u && u.id) || 'x')};width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px" aria-hidden="true">${esc(nameOf(u).trim().charAt(0))}</span>`;
}
export const gtile = (g, cls) => `<span class="gtile ${cls || ''}" style="--c:var(--g-${esc(g.color || 'orange')})" aria-hidden="true">${esc(g.emoji || '🏠')}</span>`;

/* ---------- photos: shrunk in the browser and stored in the database ---------- */
// onload rather than img.decode(): decode() can stall while the page is in the background
function loadImg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { setTimeout(() => URL.revokeObjectURL(url), 2000); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}
function shrink(img, max, q) {
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  let d = c.toDataURL('image/jpeg', q);
  while (d.length > 850000 && q > .35) { q -= .1; d = c.toDataURL('image/jpeg', q); }
  return { data: d, w, h };
}
export async function prepImage(file) { const img = await loadImg(file); return { full: shrink(img, 1600, .8), thumb: shrink(img, 420, .72) }; }
export async function chatImage(file) { const img = await loadImg(file); return shrink(img, 1280, .75); }

/* ---------- voice notes ---------- */
export function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
export function recorderMime() {
  if (!window.MediaRecorder) return null;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
}

/* ---------- icons (SF Symbols–like, 24 grid) ---------- */
export const I = {
  house: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M12 17.5s-3-1.8-3-4a1.6 1.6 0 0 1 3-.9 1.6 1.6 0 0 1 3 .9c0 2.2-3 4-3 4z"/>',
  houseF: '<path d="M12 2.8 2.6 10.5a.8.8 0 0 0 1 1.3l1-.8v8.5c0 .8.7 1.5 1.5 1.5h11.8c.8 0 1.5-.7 1.5-1.5V11l1 .8a.8.8 0 0 0 1-1.3zm0 15.2s-3.4-2-3.4-4.5a1.9 1.9 0 0 1 3.4-1.1 1.9 1.9 0 0 1 3.4 1.1c0 2.5-3.4 4.5-3.4 4.5z" fill="currentColor" stroke="none"/>',
  feed: '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  feedF: '<path d="M7 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm1 4.3a.8.8 0 0 0 0 1.6h8a.8.8 0 0 0 0-1.6zm0 4a.8.8 0 0 0 0 1.6h8a.8.8 0 0 0 0-1.6zm0 4a.8.8 0 0 0 0 1.6h5a.8.8 0 0 0 0-1.6z" fill="currentColor" stroke="none"/>',
  chat: '<path d="M12 4c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.6C4.3 15 3.5 13.1 3.5 11c0-3.9 3.8-7 8.5-7z"/>',
  chatF: '<path d="M12 3.5c5 0 9 3.3 9 7.5s-4 7.5-9 7.5c-1 0-1.9-.1-2.8-.3l-4.9 2.3c-.5.2-1-.2-.8-.7l1.2-3.6C3.6 14.8 3 13 3 11c0-4.2 4-7.5 9-7.5z" fill="currentColor" stroke="none"/>',
  chats: '<path d="M9.5 4C5.4 4 2.5 6.6 2.5 9.8c0 1.6.7 3 1.9 4.1L3.6 17l3.4-1.6c.8.2 1.6.3 2.5.3"/><path d="M14.5 8.5c3.9 0 7 2.5 7 5.6 0 1.5-.7 2.9-1.8 3.9l.8 2.8-3.2-1.5c-.9.3-1.8.4-2.8.4-3.9 0-7-2.5-7-5.6s3.1-5.6 7-5.6z"/>',
  chatsF: '<path d="M9.5 3.3c-4.5 0-7.7 2.9-7.7 6.5 0 1.6.7 3.1 1.8 4.2l-.8 3.2c-.1.5.4.9.8.7l3.6-1.6c.2 0 .5.1.7.1-.1-.5-.2-1-.2-1.5 0-3.9 3.6-6.8 8-6.8l.6.0c-1.2-2.6-4.4-4.8-8.8-4.8z" fill="currentColor" stroke="none"/><path d="M14.5 8.2c-4.2 0-7.6 2.7-7.6 6.1s3.4 6.1 7.6 6.1c.9 0 1.8-.1 2.6-.4l3.4 1.6c.4.2.9-.2.8-.7l-.7-2.8c1.1-1.1 1.6-2.4 1.6-3.8 0-3.4-3.4-6.1-7.7-6.1z" fill="currentColor" stroke="none"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  calF: '<path d="M8 2.5a1 1 0 0 1 1 1V4h6v-.5a1 1 0 1 1 2 0V4h.5A3.5 3.5 0 0 1 21 7.5V9H3V7.5A3.5 3.5 0 0 1 6.5 4H7v-.5a1 1 0 0 1 1-1zM3 10.5h18v7a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 17.5z" fill="currentColor" stroke="none"/>',
  photo: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M3.5 17l5-5 4 4 2.5-2.5L20.5 19"/>',
  photoF: '<path d="M6 4h12a3 3 0 0 1 3 3v8.6l-4.4-4.4a1 1 0 0 0-1.4 0L13 13.4 9.7 10.1a1 1 0 0 0-1.4 0L3 15.4V7a3 3 0 0 1 3-3zm2.5 3.3a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM3 18.2l6-6 7.8 7.8H6a3 3 0 0 1-3-1.8zm11.4-3.4 1.5-1.5 5.1 5.1A3 3 0 0 1 18.5 20h-.5z" fill="currentColor" stroke="none"/>',
  list: '<path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11"/><path d="M3.5 6.5l1.3 1.3 2.2-2.6M3.5 12l1.3 1.3 2.2-2.6M3.5 17.5l1.3 1.3 2.2-2.6"/>',
  listF: '<g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11"/><path d="M3.3 6.5l1.4 1.4 2.4-2.8M3.3 12l1.4 1.4 2.4-2.8M3.3 17.5l1.4 1.4 2.4-2.8"/></g>',
  people: '<circle cx="9" cy="8" r="3.3"/><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.2c2 .7 3.5 2.6 3.5 5.3"/>',
  user: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.3 18.5c1.3-2 3.3-3 5.7-3s4.4 1 5.7 3"/>',
  userF: '<path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 4.5a3.2 3.2 0 1 1 0 6.4A3.2 3.2 0 0 1 12 7zm0 13a7.8 7.8 0 0 1-6-2.8c1.3-1.9 3.5-3 6-3s4.7 1.1 6 3a7.8 7.8 0 0 1-6 2.8z" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  comment: '<path d="M12 4.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5c-.9 0-1.8-.1-2.6-.4L5 19l1-3.3C4.8 14.4 4 12.8 4 11c0-3.6 3.6-6.5 8-6.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<g fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></g>',
  back: '<path d="M9.5 5l7 7-7 7" stroke-width="2.4"/>',
  chev: '<path d="M14.5 6l-6 6 6 6" stroke-width="2.2"/>',
  next: '<path d="M14.5 6l-6 6 6 6" stroke-width="2.2"/>',
  prev: '<path d="M9.5 6l6 6-6 6" stroke-width="2.2"/>',
  send: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke-width="2.4"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5V17a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z"/><circle cx="12" cy="12.5" r="3.5"/>',
  xmark: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke-width="2.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7" stroke-width="2.2"/>',
  checks: '<path d="M2.5 12.5l4 4 9-9M11 16.5l.5.5 9-9" stroke-width="2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4M6.5 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="12" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l8.5-8.5M16 6l2.5 2.5M14 8l2 2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  warn: '<path d="M12 4l9 16H3zM12 10v4.5M12 17.5h.01"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01" stroke-width="2.2"/>',
  phone: '<path d="M5.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 7.2 7.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2z"/>',
  phoneF: '<path d="M5.5 3h3a.8.8 0 0 1 .7.5l1.5 4a.8.8 0 0 1-.3 1l-1.6 1a10.5 10.5 0 0 0 5.7 5.7l1-1.6a.8.8 0 0 1 1-.3l4 1.5a.8.8 0 0 1 .5.7v3A2.5 2.5 0 0 1 18.5 21 17.5 17.5 0 0 1 3 5.5 2.5 2.5 0 0 1 5.5 3z" fill="currentColor" stroke="none"/>',
  phoneDown: '<path d="M3.2 14.6c-.6-.6-.6-1.6 0-2.2A12.5 12.5 0 0 1 12 8.8c3.4 0 6.5 1.3 8.8 3.6.6.6.6 1.6 0 2.2l-1.6 1.6a.9.9 0 0 1-1.1.1l-2.6-1.6a.9.9 0 0 1-.4-.8v-1.6a10 10 0 0 0-6.2 0v1.6c0 .3-.2.6-.4.8l-2.6 1.6a.9.9 0 0 1-1.1-.1z" fill="currentColor" stroke="none"/>',
  video: '<rect x="2.5" y="6" width="13.5" height="12" rx="3"/><path d="M16 10.5l5.5-3.3v9.6L16 13.5"/>',
  videoF: '<path d="M5.5 5.5h8A3 3 0 0 1 16.5 8.5v7a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3zM17.5 10l3.9-2.4c.5-.3 1.1.1 1.1.6v7.6c0 .6-.6.9-1.1.6L17.5 14z" fill="currentColor" stroke="none"/>',
  videoOff: '<rect x="2.5" y="6" width="13.5" height="12" rx="3"/><path d="M16 10.5l5.5-3.3v9.6L16 13.5M3 3l18 18"/>',
  mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  micOff: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3.5 3.5l17 17"/>',
  flip: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5V17a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z"/><path d="M9 12.5a3 3 0 0 1 5.3-1.9M15 12.5a3 3 0 0 1-5.3 1.9M14.6 9.2v1.6H13M9.4 15.8v-1.6H11"/>',
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>',
  pause: '<g fill="currentColor" stroke="none"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></g>',
  reply: '<path d="M10 5.5 4 11.5l6 6M4.5 11.5H14a6 6 0 0 1 6 6v1"/>',
  poll: '<path d="M4 20V10M10 20V4M16 20v-7M2.5 20.5h19"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  cake: '<path d="M4 20.5h16M5 20.5v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 15.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0M12 11.5V8M12 6.5c-.9 0-1.5-.7-1.5-1.5 0-1 1.5-2.5 1.5-2.5s1.5 1.5 1.5 2.5c0 .8-.6 1.5-1.5 1.5z"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.8h.01M15 9.8h.01" stroke-width="2"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
  clip: '<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.3-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.3-2.3l7.6-7.6"/>',
  capsule: '<rect x="4" y="9" width="16" height="11.5" rx="2.5"/><path d="M3 6h18v3H3zM12 6v14.5M9.5 3.5c1 0 2.5 1 2.5 2.5-1.5 0-3-.5-3-1.5 0-.6.2-1 .5-1zM14.5 3.5c-1 0-2.5 1-2.5 2.5 1.5 0 3-.5 3-1.5 0-.6-.2-1-.5-1z"/>',
  quote: '<path d="M10 7H6.5A2.5 2.5 0 0 0 4 9.5V12h4.5v4.5H4M20 7h-3.5A2.5 2.5 0 0 0 14 9.5V12h4.5v4.5H14"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" stroke-width="2"/>',
  together: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  togetherF: '<path d="M12 2.5l2 5.2 5.2 2-5.2 2L12 17l-2-5.3-5.2-2 5.2-2zM18.5 14.5l.9 2.2 2.1.8-2.1.8-.9 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" stroke="none"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke-width="2"/>',
  compose: '<path d="M11 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-5"/><path d="M17.5 3.5l3 3L12 15l-3.8.8L9 12z"/>'
};
export const icon = (n, s, sw) => `<svg width="${s || 22}" height="${s || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

/* ---------- emoji ---------- */
export const EMOJI_SETS = [
  ['😀', 'פרצופים', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤨 😐 😶 😏 🙄 😬 😌 😔 😴 😷 🤒 🥵 🥶 🥴 🤯 🤠 🥳 😎 🤓 🧐 😕 🙁 😮 😲 😳 🥺 😨 😰 😥 😢 😭 😱 😖 😞 😩 😫 🥱 😤 😡 🤬 😈 👻 💩 🤡'],
  ['👋', 'ידיים ואנשים', '👋 🤚 ✋ 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 👍 👎 ✊ 👊 👏 🙌 👐 🤲 🤝 🙏 💪 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👪 👨‍👩‍👧‍👦 👨‍👩‍👧 👩‍👦 🤰 🤱 💑 🧕 👮 👩‍⚕️ 👨‍🍳 👩‍🏫 🧑‍🎓 🦸 🧚'],
  ['❤️', 'לבבות', '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 😻 💋 🫶'],
  ['🎉', 'חגיגות', '🎉 🎊 🎈 🎂 🍰 🧁 🎁 🕯️ 🕎 🍷 🥂 🍾 🎆 🎇 ✨ 🎵 🎶 🪅 🏆 🥇 🎓 💍 👑 🌟 💯'],
  ['🍕', 'אוכל', '🍕 🍔 🍟 🌭 🥪 🌮 🥙 🧆 🥗 🍝 🍜 🍲 🍛 🍣 🥟 🍳 🥞 🧇 🥩 🍗 🥖 🍞 🥐 🧀 🥚 🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🥦 🥕 🌽 🍫 🍬 🍭 🍩 🍪 🍦 ☕ 🍵 🧃 🥤'],
  ['🐶', 'חיות וטבע', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐤 🦆 🦉 🐴 🦄 🐝 🦋 🐞 🐢 🐙 🐬 🐳 🐠 🌸 🌹 🌻 🌷 🌱 🌳 🌴 🍀 🌈 ☀️ 🌙 ⭐ ☁️ ⛄ 🔥 💧 🌊'],
  ['⚽', 'פעילות ומקומות', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏊 🚴 🧘 🏃 💃 🕺 🎮 🎲 🧩 🎨 🎬 🎤 🎧 🎸 🎹 📚 ✏️ 🚗 🚌 ✈️ 🚀 🏖️ ⛺ 🏠 🏫 🏥 ⏰ 📱 💻 📷 🎒 🧳 🛒 💡 🔑']
].map(([icon, name, list]) => ({ icon, name, list: list.split(' ') }));
// A message of 1–3 emoji (and nothing else) is shown large, like iMessage
export function isJumbo(t) {
  if (!t || t.length > 40 || !/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(t) || /^[\d#*\s]+$/.test(t)) return false;
  const seg = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(t.trim())].filter(s => s.segment.trim()).length : t.trim().split(/\s+/).length;
  return seg > 0 && seg <= 3;
}

/* ---------- videos: re-encoded in the browser to ~650 kbps, stored in chunks ---------- */
export const VIDEO_MAX_SEC = 60;
export const CHUNK = 700000;
export async function prepVideo(file, onProgress) {
  const fail = c => { const e = new Error(c); e.code = c; return e; };
  if (!file.type.startsWith('video/')) throw fail('type');
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.src = url; v.playsInline = true; v.preload = 'auto';
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(fail('decode')); });
    const dur = v.duration;
    if (!isFinite(dur) || dur > VIDEO_MAX_SEC + 0.5) throw fail('long');
    const r = Math.min(1, 640 / Math.max(v.videoWidth || 640, v.videoHeight || 360));
    const w = Math.max(2, Math.round((v.videoWidth || 640) * r / 2) * 2), h = Math.max(2, Math.round((v.videoHeight || 360) * r / 2) * 2);
    // poster frame
    await new Promise(res => { v.onseeked = res; v.currentTime = Math.min(0.2, dur / 2); });
    const tc = document.createElement('canvas'), tr = Math.min(1, 360 / Math.max(w, h));
    tc.width = Math.round(w * tr); tc.height = Math.round(h * tr);
    tc.getContext('2d').drawImage(v, 0, 0, tc.width, tc.height);
    const thumb = tc.toDataURL('image/jpeg', .7);
    // already small: keep the original file
    if (file.size < 2.4e6) { onProgress && onProgress(1); return { data: await blobToDataURL(file), mime: file.type, thumb, dur: Math.round(dur), w, h }; }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    if (!window.MediaRecorder || !c.captureStream) throw fail('unsupported');
    const ctx = c.getContext('2d'), stream = c.captureStream(30);
    let actx = null;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = actx.createMediaStreamDestination();
      actx.createMediaElementSource(v).connect(dest);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) { v.muted = true; }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 650000, audioBitsPerSecond: 64000 }, mime ? { mimeType: mime } : {}));
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    await new Promise(res => { v.onseeked = res; v.currentTime = 0; });
    // draw every decoded frame (requestVideoFrameCallback), falling back to animation frames
    let raf = 0;
    const rvfc = typeof v.requestVideoFrameCallback === 'function';
    const draw = () => { ctx.drawImage(v, 0, 0, w, h); onProgress && onProgress(Math.min(.99, v.currentTime / dur)); if (!v.ended) raf = rvfc ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw); };
    if (actx && actx.state === 'suspended') await actx.resume().catch(() => {});
    rec.start(500);
    await v.play();
    draw();
    await new Promise(res => { v.onended = res; });
    if (rvfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(raf); else cancelAnimationFrame(raf);
    ctx.drawImage(v, 0, 0, w, h);
    rec.stop(); await stopped;
    if (actx) actx.close().catch(() => {});
    const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
    onProgress && onProgress(1);
    return { data: await blobToDataURL(blob), mime: blob.type, thumb, dur: Math.round(dur), w, h };
  } finally { v.pause(); v.removeAttribute('src'); URL.revokeObjectURL(url); }
}
export function splitChunks(s) { const out = []; for (let i = 0; i < s.length; i += CHUNK) out.push(s.slice(i, i + CHUNK)); return out; }
export async function dataURLToObjectURL(d) { const r = await fetch(d); return URL.createObjectURL(await r.blob()); }

/* ---------- question of the day: the same question for the whole family each day ---------- */
export const QUESTIONS = [
  'מה הדבר הכי טוב שקרה לך השבוע?', 'איזה מאכל של המשפחה היית לוקח/ת לאי בודד?', 'מה הזיכרון הכי מצחיק שלך מטיול משפחתי?',
  'אם היית יכול/ה לחיות בכל מקום בעולם, איפה?', 'מי בן המשפחה שהכי מצחיק אותך, ולמה?', 'איזה חג את/ה הכי אוהב/ת ולמה?',
  'מה למדת לאחרונה שהפתיע אותך?', 'איזו מסורת משפחתית חשוב לך שנשמור?', 'מה השיר שתמיד מזכיר לך את הבית?',
  'אם היה לך יום חופשי מחר, מה היית עושה?', 'מה הדבר שאת/ה הכי גאה בו השנה?', 'איזה כוח־על היית בוחר/ת?',
  'מה הארוחה המושלמת שלך?', 'מה הדבר הראשון שהיית קונה עם מיליון שקל?', 'איזה סיפור על סבא או סבתא את/ה הכי אוהב/ת?',
  'מה הדבר הכי טעים שאכלת אי פעם?', 'אם המשפחה שלנו הייתה סרט, איך הוא היה נקרא?', 'מה החלום הכי גדול שלך?',
  'על מה את/ה מודה היום?', 'מה התחביב שתמיד רצית לנסות?', 'איזה זיכרון ילדות את/ה הכי אוהב/ת?',
  'מה העצה הכי טובה שקיבלת?', 'לאן היית רוצה שנטייל כולנו ביחד?', 'מה הדבר שהכי משמח אותך בבוקר?',
  'איזה ספר או סרט כדאי לכולנו לראות?', 'מה המקום האהוב עליך בבית?', 'איזו מילה מתארת אותך הכי טוב השבוע?',
  'מה הדבר הכי אמיץ שעשית?', 'איזו חיה היית רוצה להיות ליום אחד?', 'מה היית אומר/ת לעצמך מלפני עשר שנים?',
  'איזה ריח מזכיר לך את הבית?', 'מי המורה שהכי השפיע/ה עליך?', 'מה הבדיחה הכי טובה שאת/ה מכיר/ה?',
  'מה הכי בא לך לעשות יחד בשבת הקרובה?', 'אם היית ממציא/ה חג חדש, מה חוגגים בו?', 'מה גורם לך לצחוק בכל פעם?'
];
export function questionFor(dateKey) { let h = 0; for (const c of dateKey) h = (h * 33 + c.charCodeAt(0)) | 0; return QUESTIONS[Math.abs(h) % QUESTIONS.length]; }

/* ---------- camera & microphone: say exactly why access failed and how to fix it ---------- */
export const inAppBrowser = () => /GSA\/|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|; wv\)/i.test(navigator.userAgent);
const iosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export function mediaHelp(err, kind) {
  const what = kind === 'video' ? 'למצלמה ולמיקרופון' : 'למיקרופון';
  const name = (err && err.name) || '';
  if (inAppBrowser()) return { title: 'צריך לפתוח בדפדפן', msg: `האפליקציה פתוחה בתוך אפליקציה אחרת (גוגל, וואטסאפ או אינסטגרם), ושם אין גישה ${what}. פתחו את התפריט (⋮ או ···) ובחרו "פתיחה ב-Chrome"${iosDevice() ? ' או "פתיחה ב-Safari"' : ''}.`, link: true };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { title: 'הדפדפן לא תומך', msg: 'הדפדפן הזה לא מאפשר שיחות. פתחו את Nest ב-Chrome' + (iosDevice() ? ' או ב-Safari' : '') + '.', link: true };
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    // On Android an app installed from Chrome has no camera/mic entry of its own: Chrome holds those permissions
    const both = kind === 'video' ? 'מיקרופון ומצלמה' : 'מיקרופון';
    const how = iosDevice()
      ? (installed() ? 'פתחו את "הגדרות" באייפון ← Safari ← מצלמה ומיקרופון ← "שאל" או "אפשר". אחר כך סגרו ופתחו את Nest.' : 'הקישו על "aA" בשורת הכתובת ← "הגדרות אתר" ← מצלמה ומיקרופון ← "אפשר". אחר כך רעננו את הדף.')
      : (installed()
        ? `ההרשאות של Nest נמצאות בתוך Chrome, לא בהגדרות האפליקציה: פתחו את Chrome ← ⋮ ← הגדרות ← הגדרות אתרים ← ${both} ← manorkeshet417-code.github.io ← "אפשר".`
        : `הקישו על הסמל שמשמאל לכתובת (🔒 או ⚙) ← "הרשאות" ← אפשרו ${both}, ורעננו את הדף.`)
        + ` אם זה עדיין חסום: הגדרות הטלפון ← אפליקציות ← Chrome ← הרשאות ← ${both} ← "אפשר".`;
    return { title: `הגישה ${what} חסומה`, msg: `בעבר נבחר "חסימה" כשהדפדפן ביקש רשות, או שלדפדפן עצמו אין רשות. ${how}` };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return { title: kind === 'video' ? 'המצלמה תפוסה' : 'המיקרופון תפוס', msg: 'אפליקציה אחרת משתמשת בהם עכשיו (למשל שיחת וואטסאפ, זום או המצלמה). סגרו אותה ונסו שוב.' };
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return { title: kind === 'video' ? 'לא נמצאה מצלמה' : 'לא נמצא מיקרופון', msg: 'לא מצאנו את ההתקן במכשיר הזה. ' + (kind === 'video' ? 'אפשר לנסות שיחה קולית במקום.' : '') };
  return { title: `אין גישה ${what}`, msg: 'משהו חסם את הגישה. נסו לרענן את הדף, ולוודא שאתם ב-Chrome' + (iosDevice() ? ' או ב-Safari' : '') + '.' };
}
