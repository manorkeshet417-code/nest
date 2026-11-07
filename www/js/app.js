// Nest app: state, screens and actions
import { $, $$, esc, haptic, LS, linkify, MONTHS, DAYS, iso, dayKey, hhmm, fmtDur, ago, listTime, dayLabel, daysTo, nextBirthday,
  COLORS, EMOJIS, REACTIONS, first, nameOf, userColor, chatId, avatar, gtile, prepImage, chatImage, blobToDataURL, recorderMime, icon,
  EMOJI_SETS, isJumbo, prepVideo, dataURLToObjectURL, questionFor, VIDEO_MAX_SEC, mediaHelp, inAppBrowser } from './util.js';
import { FIREBASE_CONFIG, VAPID_KEY, PUSH_URL } from './config.js';
import { LiveBackend } from './backend-live.js';
import { LocalBackend } from './backend-local.js';
import { CallManager } from './calls.js';

const root = document.documentElement; root.lang = 'he'; root.dir = 'rtl';
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (standalone()) root.classList.add('native');
const app = $('#app'), navEl = $('#nav'), sheetEl = $('#sheet'), screenEl = $('#screen'), fileEl = $('#file'), phoneEl = $('.phone');
const onSite = /\.github\.io$/.test(location.hostname);
const params = new URLSearchParams(location.search);

let be = null, calls = null;
const S = {
  booting: true, user: null, groups: [], chats: [], members: {},
  screen: 'root', tab: 'groups', gid: null, gtab: 'feed', cid: null,
  data: { posts: [], messages: [], events: [], images: [], lists: [], capsules: [], quotes: [] }, dm: [],
  drafts: {}, img: null, vid: null, hub: null, day: { answers: {} }, poll: null, reply: null, rec: null, viewer: null, comments: null, incoming: null,
  anim: '', busy: false, joinCode: params.get('join') || ''
};
const full = {}, loadedFull = new Set();
const unsub = { groups: null, chats: null, incoming: null, group: [], dm: null, comments: null };
const seen = LS.get('nest.seen') || {}, seenChat = LS.get('nest.seenChat') || {};
const me = () => S.user && S.user.id;
const group = () => S.groups.find(g => g.id === S.gid);
const chat = () => S.chats.find(c => c.id === S.cid);
const otherOf = c => c && c.members.find(m => m !== me());
const isOwner = g => g && S.user && g.ownerId === S.user.id;
const scope = () => S.screen === 'chat' ? { t: 'c', id: S.cid } : { t: 'g', id: S.gid };
const curMsgs = () => S.screen === 'chat' ? S.dm : S.data.messages;
const isFrame = () => getComputedStyle(screenEl).overflowY === 'auto';
const scrollY = () => isFrame() ? screenEl.scrollTop : window.scrollY;
const scrollTo = y => { if (isFrame()) screenEl.scrollTop = y; else window.scrollTo(0, y); };
const scrollMax = () => isFrame() ? screenEl.scrollHeight - screenEl.clientHeight : document.documentElement.scrollHeight - innerHeight;
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
const chatVisible = () => S.screen === 'chat' || (S.screen === 'group' && S.gtab === 'chat');
const local = () => be && be.mode === 'local';

/* ---------- HUD & sheets ---------- */
let hudT;
function hud(msg, warn) {
  const h = $('#hud'); h.className = 'hud' + (warn ? ' warn' : '');
  h.innerHTML = `<span class="hud-ic">${icon(warn ? 'warn' : 'check', 18, 2.2)}</span><span>${esc(msg)}</span>`;
  requestAnimationFrame(() => h.classList.add('show'));
  clearTimeout(hudT); hudT = setTimeout(() => h.classList.remove('show'), 2600);
}
function fail(e) {
  console.error(e);
  const c = (e && e.code) || '';
  hud(c.includes('permission') ? 'אין הרשאה לפעולה הזו' : c.includes('unavailable') || !navigator.onLine ? 'אין חיבור. נסו שוב בעוד רגע' : 'משהו השתבש. נסו שוב', true);
}
function confirmSheet(o) {
  return new Promise(res => {
    sheetEl.innerHTML = `<div class="scrim"></div><div class="asheet" role="dialog" aria-modal="true"><div class="ag glass">${o.title || o.msg ? `<div class="am">${o.title ? `<b>${esc(o.title)}</b>` : ''}${esc(o.msg || '')}</div>` : ''}${o.top || ''}${o.actions.map((a, i) => `<button type="button" class="aa${a.destructive ? ' destructive' : ''}" data-r="${i}">${esc(a.label)}</button>`).join('')}</div><button type="button" class="aa cancel glass" data-r="-1">ביטול</button></div>`;
    const sc = sheetEl.querySelector('.scrim'), as = sheetEl.querySelector('.asheet');
    requestAnimationFrame(() => { sc.classList.add('show'); as.classList.add('show'); });
    const close = v => { sc.classList.remove('show'); as.classList.remove('show'); setTimeout(() => { if (sheetEl.contains(as)) sheetEl.innerHTML = ''; }, 320); res(v); };
    sc.onclick = () => close(-1);
    as.querySelectorAll('[data-r]').forEach(b => b.onclick = () => close(+b.dataset.r));
    as.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => close(b.dataset.pick));
    as.querySelector('.cancel').focus({ preventScroll: true });
  });
}
let closeForm = null;
function formSheet(o) {
  sheetEl.innerHTML = `<div class="scrim"></div><div class="fsheet${o.tall ? ' tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title)}"><div class="grab"></div><div class="fh"><button type="button" class="nb-btn" data-f="cancel" style="justify-self:start">ביטול</button><b>${esc(o.title)}</b>${o.action ? `<button type="button" class="nb-btn" data-f="ok" style="font-weight:600">${esc(o.action)}</button>` : '<span></span>'}</div><div class="fb">${o.body}</div>${o.footer || ''}</div>`;
  const sc = sheetEl.querySelector('.scrim'), fs = sheetEl.querySelector('.fsheet');
  requestAnimationFrame(() => { sc.classList.add('show'); fs.classList.add('show'); });
  const close = () => { closeForm = null; sc.classList.remove('show'); fs.classList.remove('show'); setTimeout(() => { if (sheetEl.contains(fs)) sheetEl.innerHTML = ''; }, 340); o.onClose && o.onClose(); };
  closeForm = close; sc.onclick = close; fs.querySelector('[data-f=cancel]').onclick = close;
  const ok = fs.querySelector('[data-f=ok]');
  if (ok) ok.onclick = async () => { ok.disabled = true; try { if (await o.onOk(fs) !== false) close(); } catch (e) { fail(e); } finally { ok.disabled = false; } };
  const f = fs.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 350);
  return fs;
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); haptic(); hud('הועתק'); } catch (e) { hud('לא הצלחנו להעתיק. סמנו והעתיקו ידנית', true); } }

/* ---------- notifications ---------- */
let swReg = null, prevAct = {};
if (onSite && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(r => { swReg = r; }).catch(() => {});
  // a new version took over: reload when nothing is in progress
  let hadController = !!navigator.serviceWorker.controller, updatePending = false;
  const applyUpdate = () => { if (!updatePending) return; if ((calls && calls.state) || S.incoming || S.sosAlert || S.rec || closeForm || typing()) { setTimeout(applyUpdate, 5000); return; } location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController) { hadController = true; return; } updatePending = true; applyUpdate(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && swReg) swReg.update().catch(() => {}); });
  setInterval(() => { if (swReg) swReg.update().catch(() => {}); }, 30 * 60 * 1000);
}
function notify(title, body, tag, urgent) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !swReg) return;
  swReg.showNotification(title, { body, tag, renotify: true, requireInteraction: !!urgent, vibrate: urgent ? [600, 200, 600, 200, 600, 200, 600] : [200], icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', lang: 'he', dir: 'rtl' }).catch(() => {});
}
const isSos = b => /🆘|📍 מיקום החירום/.test(b || ''), isCheckin = b => /✅ הגיע\/ה בשלום|✅ ביטול SOS|🚶 יצא\/ה לדרך/.test(b || '');
const muted = LS.get('nest.muted') || {};
// New activity from someone else: a system notification when the app is in the background, a banner when elsewhere in the app
function activity(key, title, body, lastAt, lastBy, viewing) {
  const prev = prevAct[key]; prevAct[key] = lastAt || 0;
  if (prev === undefined || !lastAt || lastAt <= prev || !lastBy || lastBy === me()) return;
  // SOS and late arrivals are driven by the live safety docs (evalSafety), never muted
  if (isSos(body)) return;
  if (key.startsWith('g:') && muted[key.slice(2)] && !isCheckin(body)) return;
  // with push on, the sender's push covers the background case (same tag, so never twice)
  if (isCheckin(body)) { if (!(S.pushOn && document.hidden)) notify(title, body, key); chime(); hud(body.slice(0, 70)); return; }
  if (document.hidden && !S.pushOn) notify(title, body, key);
  else if (!viewing) hud(`${title}: ${body}`.slice(0, 70));
}

/* ---------- navigation ---------- */
function go(screen, o, push) {
  o = o || {};
  const from = S.screen;
  S.anim = screen !== 'root' && from === 'root' ? 'push' : screen === 'root' && from !== 'root' ? 'pop' : screen === 'groupInfo' ? 'push' : from === 'groupInfo' ? 'pop' : 'fade';
  if (screen === 'root') { closeGroup(); closeDM(); if (o.tab) S.tab = o.tab; }
  if (screen === 'group' || screen === 'groupInfo') { closeDM(); if (o.gid && o.gid !== S.gid) openGroup(o.gid); if (o.gtab) S.gtab = o.gtab; S.hub = o.hub || null; }
  if (screen === 'chat') { closeGroup(); if (o.cid && o.cid !== S.cid) openDM(o.cid); }
  S.screen = screen; S.reply = null;
  if (push !== false) { try { history.pushState({ screen, gid: S.gid, cid: S.cid, tab: S.tab, gtab: S.gtab, hub: S.hub }, ''); } catch (e) {} }
  render(true);
}
window.addEventListener('popstate', e => {
  if (closeForm) { closeForm(); return; }
  if (S.viewer) { S.viewer = null; renderViewer(); return; }
  const st = e.state || { screen: 'root' };
  go(st.screen || 'root', st, false);
});
function back() { if (history.state && history.state.screen && history.state.screen !== 'root') history.back(); else go('root'); }
function onScroll() { const nb = $('.navbar'); if (nb) nb.classList.toggle('scrolled', scrollY() > (nb.classList.contains('inline') ? 2 : 44)); }
screenEl.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- subscriptions ---------- */
async function loadUsers(ids, fresh) {
  const need = [...new Set(ids)].filter(i => i && (fresh || !S.members[i]));
  if (need.length) Object.assign(S.members, await be.users(need, fresh));
}
const allMemberIds = () => [...new Set(S.groups.flatMap(g => g.members))];
function watchAll() {
  unsub.groups = be.watchGroups(async list => {
    S.groups = list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    syncSafety();
    list.forEach(g => activity('g:' + g.id, `${g.emoji} ${g.name}`, g.lastMessage || '', g.lastAt, g.lastBy, S.gid === g.id));
    const g = group();
    if ((S.screen === 'group' || S.screen === 'groupInfo') && !g && S.gid) { hud('כבר אין לך גישה לקבוצה הזו', true); go('root'); return; }
    if (g) markGroupSeen();
    await loadUsers(allMemberIds());
    softRender();
  }, fail);
  unsub.chats = be.watchChats(async list => {
    S.chats = list.filter(c => c.lastBy || c.id === S.cid).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    await loadUsers(list.map(otherOf));
    list.forEach(c => activity('c:' + c.id, nameOf(S.members[otherOf(c)]), c.lastMessage || '', c.lastAt, c.lastBy, S.cid === c.id && S.screen === 'chat'));
    if (S.screen === 'chat') maybeRead();
    softRender();
  }, fail);
  if (be.rtc) { calls = CallManager(be.rtc, callUI); unsub.incoming = calls.watchIncoming(); }
  be.sosContacts().then(l => { S.sos = l; loadUsers(l.filter(c => c.uid).map(c => c.uid)); softRender(); }).catch(() => {});
  refreshMediaPerm();
}
function stopAll() {
  closeGroup(); closeDM();
  ['groups', 'chats', 'incoming'].forEach(k => { if (unsub[k]) { try { unsub[k](); } catch (e) {} unsub[k] = null; } });
  S.groups = []; S.chats = []; prevAct = {};
  Object.values(unsub.safety || {}).forEach(u => { try { u(); } catch (e) {} }); unsub.safety = {}; S.safety = {}; stopTracking();
}
function openGroup(gid) {
  closeGroup(); S.gid = gid; S.gtab = 'feed'; S.data = { posts: [], messages: [], events: [], images: [], lists: [] };
  const watchKind = k => be.watch(gid, k, async list => { S.data[k] = list; if (k === 'posts') await loadUsers(list.map(p => p.authorId)); softRender(); }, fail);
  ['posts', 'events', 'images', 'lists', 'capsules', 'quotes'].forEach(k => unsub.group.push(watchKind(k)));
  S.data.homework = []; S.data.exams = []; S.data.timetable = {};
  if (gtype(group()) === 'school') { ['homework', 'exams'].forEach(k => unsub.group.push(watchKind(k))); unsub.group.push(be.watchTimetable(gid, d => { S.data.timetable = d; softRender(); }, fail)); }
  S.day = { answers: {} };
  unsub.group.push(be.watchDay(gid, iso(new Date()), async d => { S.day = d; await loadUsers(Object.keys(d.answers || {})); softRender(); }, fail));
  unsub.group.push(be.watchMessages({ t: 'g', id: gid }, async list => {
    S.data.messages = list; await loadUsers(list.map(m => m.authorId));
    if (S.gtab === 'chat' && !document.hidden) markGroupChatSeen();
    softRender(true);
  }, fail));
  markGroupSeen();
  const g = group(); if (g) loadUsers(g.members.concat(g.ownerId), true).then(() => softRender());
}
function closeGroup() { unsub.group.forEach(u => { try { u(); } catch (e) {} }); unsub.group = []; S.gid = null; S.data = { posts: [], messages: [], events: [], images: [], lists: [] }; }
function openDM(cid) {
  closeDM(); S.cid = cid; S.dm = [];
  unsub.dm = be.watchMessages({ t: 'c', id: cid }, async list => { S.dm = list; await loadUsers(list.map(m => m.authorId)); maybeRead(); softRender(true); }, fail);
}
function closeDM() { if (unsub.dm) { try { unsub.dm(); } catch (e) {} } unsub.dm = null; S.cid = null; S.dm = []; }
function markGroupSeen() { const g = group(); if (g) { seen[g.id] = Math.max(g.lastAt || 0, Date.now()); LS.set('nest.seen', seen); } }
function markGroupChatSeen() { const m = S.data.messages[0]; if (m && S.gid) { seenChat[S.gid] = m.createdAt; LS.set('nest.seenChat', seenChat); } }
let readT = 0;
function maybeRead() {
  const c = chat(); if (!c || document.hidden || S.screen !== 'chat') return;
  const mine = (c.reads || {})[me()] || 0;
  if (c.lastAt > mine && Date.now() - readT > 1500) { readT = Date.now(); be.markRead(c.id); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { maybeRead(); if (S.gtab === 'chat' && S.screen === 'group') markGroupChatSeen(); softRender(); } });
const groupUnread = g => g.lastAt > (seen[g.id] || 0) && g.lastBy && g.lastBy !== me();
const chatUnread = c => c.lastAt > ((c.reads || {})[me()] || 0) && c.lastBy && c.lastBy !== me();
const groupChatUnread = () => { const last = seenChat[S.gid] || 0; return S.data.messages.filter(m => m.createdAt > last && m.authorId !== me()).length; };

/* ---------- render ---------- */
function softRender(chatChanged) { if (S.booting) return; render(false, chatChanged); }
function render(navigated, chatChanged) {
  if (S.viewer) renderViewer();
  const a = document.activeElement, fid = a && a.id, sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  const y = scrollY(), nearBottom = scrollMax() - y < 140;
  const g = group();
  root.style.setProperty('--accent', `var(--g-${((S.screen === 'group' || S.screen === 'groupInfo') && g && g.color) || 'orange'})`);
  let html, bare = false, tabs = '';
  if (S.booting) { bare = true; html = `<div class="loading"><div class="spinner" aria-label="טוען"></div></div>`; }
  else if (!S.user) { bare = true; html = viewLogin(); }
  else if (S.screen === 'group' && g) { html = viewGroup(g); tabs = groupTabs(); }
  else if (S.screen === 'groupInfo' && g) { html = viewGroupInfo(g); }
  else if (S.screen === 'chat' && S.cid) { html = viewDM(); }
  else { S.screen = 'root'; html = S.tab === 'chats' ? viewChats() : S.tab === 'profile' ? viewProfile() : viewGroups(); tabs = rootTabs(); }
  const solo = S.screen === 'chat' || S.screen === 'groupInfo';
  app.className = (bare ? 'bare ' : '') + (chatVisible() ? (S.screen === 'chat' ? 'chat-pad solo ' : 'chat-pad ') : solo ? 'solo ' : '') + (navigated && S.anim ? 'anim-' + S.anim : '');
  S.anim = '';
  app.innerHTML = (S.booting ? '' : openInBrowserBanner()) + html;
  // my live SOS / escort rides in the sticky top bar, so it stays in view while scrolling
  const sbar = S.booting ? '' : safetyBar();
  if (sbar) { const nb = app.querySelector('.navbar'); if (nb) nb.insertAdjacentHTML('beforeend', sbar); else app.insertAdjacentHTML('afterbegin', sbar); } navEl.innerHTML = tabs;
  $$('[data-draft]').forEach(el => { el.value = S.drafts[el.dataset.draft] || ''; grow(el); });
  updateSend(); updateTyping(); syncAudioUI();
  if (fid && !navigated) { const n = document.getElementById(fid); if (n) { n.focus({ preventScroll: true }); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  if (navigated) { scrollTo(0); if (chatVisible()) requestAnimationFrame(() => scrollTo(scrollMax())); }
  else if (chatVisible() && (nearBottom || (chatChanged && isMineLatest()))) requestAnimationFrame(() => scrollTo(scrollMax()));
  else scrollTo(y);
  onScroll(); loadFullImages();
}
const isMineLatest = () => { const m = curMsgs()[0]; return m && m.authorId === me(); };
function grow(el) { if (el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, parseInt(getComputedStyle(el).maxHeight) || 200) + 'px'; }
function draftKey() { return S.screen === 'chat' ? 'dm:' + S.cid : 'chat:' + S.gid; }
function updateSend() {
  const b = $('#chat-send');
  if (b) {
    const has = !!(S.drafts[draftKey()] || '').trim();
    b.type = has ? 'submit' : 'button';
    if (has) { b.removeAttribute('data-a'); b.setAttribute('aria-label', 'שליחה'); b.innerHTML = icon('send', 18); b.disabled = false; }
    else { b.dataset.a = 'rec-start'; b.setAttribute('aria-label', 'הקלטת הודעה קולית'); b.innerHTML = icon('mic', 19, 2); b.disabled = recorderMime() === null; }
  }
  const p = $('#post-btn'); if (p) p.disabled = S.busy || !((S.drafts.post || '').trim() || S.img || S.vid);
}

// Inside the Google app (or WhatsApp/Instagram) the page runs in a built-in browser that can't install,
// sign in with Google or use the microphone. These links hand the same address to the real browser.
function chromeLink() {
  const host = location.host, path = location.pathname + location.search;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'googlechromes://' + host + path
    : 'intent://' + host + path + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
}
function openInBrowserBanner() {
  if (!inAppBrowser()) return '';
  const host = location.host, path = location.pathname + location.search;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const chrome = chromeLink();
  return '<div class="openin" role="alert"><div class="openin-t"><b>פתחו את Nest ב-Chrome</b><span>כאן, בתוך ' + (/GSA\//.test(navigator.userAgent) ? 'אפליקציית Google' : 'האפליקציה הזו') + ', אי אפשר להתקין, להיכנס עם Google או להתקשר.</span></div>' +
    '<div class="openin-b"><a class="btn filled sm" href="' + esc(chrome) + '">פתיחה ב-Chrome</a>' +
    (ios ? '<a class="btn tinted sm" href="' + esc('x-safari-https://' + host + path) + '">פתיחה ב-Safari</a>' : '') +
    '<button class="btn tinted sm" data-a="copy-link">העתקת הקישור</button></div></div>';
}
function bar(o) {
  return `<header class="navbar${o.inline ? ' inline' : ''}"><div class="nb-in">
    <div class="nb-lead">${o.back ? `<button class="nb-btn" data-a="back" aria-label="חזרה ל${esc(o.back)}">${icon('back', 20)}<span class="nb-back-t">${esc(o.back)}</span></button>` : ''}</div>
    <div class="nb-title">${o.titleHtml || esc(o.title)}</div>
    <div class="nb-trail">${o.trail || ''}</div></div></header>
  ${o.inline ? '' : `<div class="large"><div>${o.eyebrow ? `<div class="eyebrow">${o.eyebrow}</div>` : ''}<h1>${esc(o.title)}</h1></div>${o.side || ''}</div>`}`;
}
function tabbar(items, cur, act) {
  return `<nav class="tabbar" aria-label="ניווט"><div class="tb-in glass" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([k, l, ic, badge]) => `<button class="tab${cur === k ? ' on' : ''}" data-a="${act}" data-v="${k}"${cur === k ? ' aria-current="page"' : ''}>${icon(cur === k ? ic + 'F' : ic, 24)}<span>${l}</span>${badge ? `<span class="dot">${badge > 9 ? '9+' : badge}</span>` : ''}</button>`).join('')}</div></nav>`;
}
function rootTabs() {
  const gu = S.groups.filter(groupUnread).length, cu = S.chats.filter(chatUnread).length;
  return tabbar([['groups', 'קבוצות', 'house', gu], ['chats', 'שיחות', 'chats', cu], ['profile', 'פרופיל', 'user', 0]], S.tab, 'root-tab');
}
function groupTabs() {
  const n = S.gtab === 'chat' ? 0 : groupChatUnread();
  const last = gtype(group()) === 'school' ? ['school', 'לימודים', 'book', 0] : ['together', 'ביחד', 'together', 0];
  return tabbar([['feed', 'פיד', 'feed', 0], ['chat', 'צ׳אט', 'chat', n], ['events', 'אירועים', 'cal', 0], ['album', 'אלבום', 'photo', 0], last], S.gtab, 'gtab');
}

/* ---------- login ---------- */
function viewLogin() {
  const live = be.mode === 'live';
  return `<div class="onb">
    <div class="app-icon">${icon('house', 56, 1.7)}</div>
    <h1 dir="ltr">Nest</h1>
    <p class="lead">הרשת הפרטית של המשפחה שלך. רק מי שהזמנתם רואה.</p>
  </div>
  <div class="features">
    <div class="feature"><span class="fi">${icon('chats', 30)}</span><div><b>צ׳אט ושיחות</b><span>קבוצות, הודעות פרטיות, הודעות קוליות ושיחות וידאו.</span></div></div>
    <div class="feature"><span class="fi">${icon('feed', 30)}</span><div><b>פיד משפחתי</b><span>תמונות, עדכונים וסקרים, עם לייקים ותגובות.</span></div></div>
    <div class="feature"><span class="fi">${icon('cal', 30)}</span><div><b>אירועים, אלבום ורשימות</b><span>ארוחות שישי, ימי הולדת, תמונות ורשימת קניות משותפת.</span></div></div>
    <div class="feature"><span class="fi">${icon('lock', 30)}</span><div><b>פרטי</b><span>פותחים קבוצה ומצרפים את המשפחה עם קוד.</span></div></div>
  </div>
  ${live ? `<div class="btn-row"><button class="btn filled block" data-a="google">המשך עם Google</button></div>
    <p class="section-f" style="text-align:center">נכנסים עם חשבון Google. אנחנו שומרים רק שם ותמונת פרופיל.</p>`
  : `<form id="local-login"><div class="section-h">איך קוראים לך?</div><div class="list"><div class="field"><input id="local-name" autocomplete="given-name" placeholder="השם שלך" aria-label="השם שלך" autofocus></div></div>
    <div class="btn-row"><button class="btn filled block">כניסה</button></div>
    <p class="section-f" style="text-align:center">זו תצוגה מקדימה: הנתונים נשמרים רק בדף הזה. באתר נכנסים עם Google והכול נשמר לכל המשפחה.</p></form>`}`;
}

/* ---------- root: groups ---------- */
function birthdaysToday() {
  return allMemberIds().map(id => S.members[id]).filter(u => u && u.birthday && (nextBirthday(u.birthday) || {}).days === 0);
}
function viewGroups() {
  const u = S.user, list = S.groups, bdays = birthdaysToday();
  return bar({ title: 'קבוצות', eyebrow: local() ? '<span class="pill">תצוגה מקדימה</span>' : '', trail: `<button class="nb-btn" data-a="escort" aria-label="ליווי הביתה">${icon('route', 23)}</button><button class="sos-hold" data-hold="sos" aria-label="SOS: לחיצה ארוכה"><span class="sos-ring"></span>SOS</button><button class="nb-btn" data-a="new-group" aria-label="קבוצה חדשה">${icon('plus', 24, 2.2)}</button>` }) +
  permCard() + notifCard() + escortTips() +
  (canOfferInstall() && !LS.get('nest.noInstall') ? `<div class="tip">${icon('sparkles', 24)}<span class="body"><b>התקינו את Nest</b><br><span style="color:var(--label2);font-size:13px">${inAppBrowser() ? 'פתחו בדפדפן Chrome כדי להתקין' : 'אייקון במסך הבית, מסך מלא, עובד גם בלי אינטרנט'}</span></span><button class="btn filled sm" data-a="install">התקנה</button><button class="icon-btn muted sm" data-a="install-hide" aria-label="סגירה">${icon('xmark', 16)}</button></div>` : '') +
  bdays.map(b => `<div class="tip bday">${icon('cake', 26)}<span class="body">${b.id === u.id ? '<b>יום הולדת שמח!</b> כל המשפחה חוגגת איתך 🎉' : `<b>היום יום ההולדת של ${esc(nameOf(b))}</b> 🎂`}</span>${b.id !== u.id && !local() ? `<button class="btn filled sm" data-a="dm" data-v="${esc(b.id)}">ברכה</button>` : ''}</div>`).join('') +
  (list.length ? `<div class="list av" style="--inset:80px">${list.map(g => { const un = groupUnread(g); return `<button class="row" data-a="open" data-v="${esc(g.id)}" style="padding:10px 16px">${gtile(g)}<span class="body"><span class="t" style="font-weight:600">${esc(g.name)}${g.ownerId === u.id ? '<span class="badge">בעלים</span>' : ''}${muted[g.id] ? `<span class="mute-ic" aria-label="מושתקת">${icon('bellOff', 14)}</span>` : ''}</span><span class="sub" dir="auto">${esc(g.lastMessage || `${g.members.length} חברים`)}</span></span><span class="when${un ? ' un' : ''}">${g.lastAt ? listTime(g.lastAt) : ''}${un ? '<span class="udot"></span>' : ''}</span></button>`; }).join('')}</div>`
  : `<div class="empty">${icon('house', 56, 1.4)}<b>עוד אין קבוצות</b><span>פתחו קבוצה למשפחה, או הצטרפו לקבוצה קיימת עם קוד הזמנה.</span></div>`) +
  `<div class="btn-row"><button class="btn filled" data-a="new-group">${icon('plus', 18, 2.4)} קבוצה חדשה</button><button class="btn tinted" data-a="join">${icon('key', 18)} הצטרפות עם קוד</button></div>`;
}

/* ---------- root: private chats ---------- */
function viewChats() {
  const list = S.chats;
  return bar({ title: 'שיחות', trail: `<button class="nb-btn" data-a="new-chat" aria-label="שיחה חדשה">${icon('compose', 24)}</button>` }) +
  (local() ? `<div class="tip">${icon('info', 22)}<span class="body">הודעות פרטיות ושיחות קול ווידאו עובדות באתר, אחרי כניסה עם Google.</span></div>` : '') +
  (list.length ? `<div class="list av" style="--inset:80px">${list.map(c => { const o = S.members[otherOf(c)] || { id: otherOf(c) }, un = chatUnread(c), typ = typingNames(c.typing, [otherOf(c)]); return `<button class="row" data-a="open-chat" data-v="${esc(c.id)}" style="padding:10px 16px">${avatar(o, 52)}<span class="body"><span class="t" style="font-weight:600">${esc(nameOf(o))}</span><span class="sub${typ ? ' acc' : ''}" dir="auto">${typ ? 'מקליד/ה…' : (c.lastBy === me() ? 'את/ה: ' : '') + esc(c.lastMessage || 'שיחה חדשה')}</span></span><span class="when${un ? ' un' : ''}">${c.lastAt ? listTime(c.lastAt) : ''}${un ? '<span class="udot"></span>' : ''}</span></button>`; }).join('')}</div>`
  : `<div class="empty">${icon('chats', 56, 1.4)}<b>עוד אין שיחות</b><span>הודעה פרטית, הודעה קולית או שיחת וידאו עם מישהו מהמשפחה.</span>${local() ? '' : '<button class="btn filled sm" data-a="new-chat">שיחה חדשה</button>'}</div>`);
}
function newChatSheet() {
  if (local()) { hud('הודעות פרטיות זמינות באתר, אחרי כניסה עם Google', true); return; }
  const ids = allMemberIds().filter(i => i !== me()).sort((a, b) => nameOf(S.members[a]).localeCompare(nameOf(S.members[b]), 'he'));
  const fs = formSheet({ title: 'שיחה חדשה', tall: true,
    body: ids.length ? `<div class="section-h">בני המשפחה בקבוצות שלך</div><div class="list av">${ids.map(id => { const u = S.members[id] || { id }; return `<div class="row">${avatar(u, 40)}<span class="body t">${esc(nameOf(u))}</span><button class="icon-btn" data-call="audio" data-u="${esc(id)}" aria-label="שיחה קולית עם ${esc(nameOf(u))}">${icon('phone', 21)}</button><button class="icon-btn" data-call="video" data-u="${esc(id)}" aria-label="שיחת וידאו עם ${esc(nameOf(u))}">${icon('video', 22)}</button><button class="icon-btn" data-dm="${esc(id)}" aria-label="הודעה ל${esc(nameOf(u))}">${icon('chat', 22)}</button></div>`; }).join('')}</div>`
      : `<div class="empty"><b>עוד אין עם מי לדבר</b><span>הזמינו בני משפחה לקבוצה, והם יופיעו כאן.</span></div>` });
  fs.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { closeForm && closeForm(); startDM(b.dataset.dm); });
  fs.querySelectorAll('[data-call]').forEach(b => b.onclick = () => { closeForm && closeForm(); startCall(b.dataset.u, b.dataset.call); });
}
async function startDM(uid) {
  try { const cid = await be.openChat(uid); go('chat', { cid }); }
  catch (e) { if (e && e.code === 'local') hud('הודעות פרטיות זמינות באתר, אחרי כניסה עם Google', true); else fail(e); }
}

/* ---------- root: profile ---------- */
let installEvt = null;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// In-app browsers (the Google app, WhatsApp, Instagram…) cannot install web apps (inAppBrowser, from util)
const canOfferInstall = () => onSite && !standalone();
function installHelp() {
  const link = location.origin + location.pathname;
  if (inAppBrowser()) return { title: 'צריך לפתוח בדפדפן', msg: 'האפליקציה פתוחה עכשיו בתוך אפליקציה אחרת (גוגל, וואטסאפ או אינסטגרם), ומשם אי אפשר להתקין. פתחו את התפריט (⋮ או ···) ובחרו "פתיחה ב-Chrome"' + (isIOS() ? ' או "פתיחה ב-Safari"' : '') + '. אפשר גם להעתיק את הקישור ולהדביק אותו בדפדפן.', link };
  if (isIOS()) return { title: 'הוספה למסך הבית', msg: 'הקישו על כפתור השיתוף (ריבוע עם חץ למעלה; ב-Chrome הוא בשורת הכתובת), גללו ובחרו "הוספה למסך הבית", ואז "הוסף".', link };
  return { title: 'התקנת Nest', msg: 'ב-Chrome: הקישו על ⋮ בפינה העליונה ובחרו "התקנת אפליקציה" או "הוספה למסך הבית". אם האפשרות לא מופיעה, רעננו את הדף ונסו שוב בעוד רגע.', link };
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!S.booting && !typing()) softRender(); });
window.addEventListener('appinstalled', () => { installEvt = null; hud('Nest נוספה למסך הבית'); softRender(); });
// Camera/microphone permission as the browser reports it (not every browser can tell)
async function refreshMediaPerm() {
  if (!navigator.permissions || !navigator.permissions.query) { S.mediaPerm = { mic: 'prompt', cam: 'prompt', unknown: true }; return; }
  const q = async n => { try { const p = await navigator.permissions.query({ name: n }); p.onchange = () => refreshMediaPerm(); return p.state; } catch (e) { return 'prompt'; } };
  const [mic, cam] = await Promise.all([q('microphone'), q('camera')]);
  const changed = !S.mediaPerm || S.mediaPerm.mic !== mic || S.mediaPerm.cam !== cam;
  S.mediaPerm = { mic, cam };
  if (changed && S.screen === 'root' && S.tab === 'profile' && !typing()) softRender();
}
function mediaPermRow() {
  const p = S.mediaPerm || {};
  if (p.mic === 'granted' && p.cam === 'granted') return '<span class="val" style="color:var(--ok)">מאושר</span>';
  if (p.mic === 'granted') return '<span class="val" style="color:var(--ok)">מיקרופון ✓</span><button class="btn tinted sm" data-a="media-check">מצלמה</button>';
  // the browser's stored answer can be stale, so always offer a real retry
  if (p.mic === 'denied') return '<button class="btn tinted sm" data-a="media-check">ניסיון שוב</button><button class="btn tinted sm" data-a="media-fix">איך מתקנים</button>';
  return '<button class="btn tinted sm" data-a="media-check">אישור</button>';
}
function viewProfile() {
  const u = S.user, live = be.mode === 'live', perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const b = nextBirthday(u.birthday);
  return bar({ title: 'פרופיל' }) +
  `<div class="list"><div class="row" style="padding:16px">${avatar(u, 64)}<span class="body"><span class="t" style="font-size:22px;font-weight:600">${esc(nameOf(u))}</span><span class="sub">${live ? 'מחובר/ת עם Google' : 'תצוגה מקדימה'}</span></span></div></div>
  <div class="section-h">השם שמוצג למשפחה</div>
  <form id="name-form" class="list"><div class="field"><input id="pf-name" value="${esc(u.name)}" aria-label="השם שלך" maxlength="40"><button class="btn tinted sm">שמירה</button></div></form>
  <div class="section-h">יום הולדת</div>
  <form id="bday-form" class="list"><div class="field"><label for="pf-bday">${icon('cake', 22)}</label><input id="pf-bday" type="date" value="${esc(u.birthday || '')}"><button class="btn tinted sm">שמירה</button></div></form>
  <p class="section-f">${b ? (b.days === 0 ? 'היום! מזל טוב 🎉' : `עוד ${b.days} ימים. `) + 'המשפחה תראה את התאריך בלוח האירועים.' : 'כך המשפחה תדע מתי לחגוג איתך. הוא יופיע בלוח האירועים של הקבוצות.'}</p>
  <div class="section-h">SOS · אנשי קשר לחירום</div>
  <div class="list">${(S.sos || []).map((c, i) => `<div class="row">${c.uid ? avatar(S.members[c.uid] || { id: c.uid, name: c.name }, 34) : `<span class="sos-ic">${icon('phoneF', 18)}</span>`}<span class="body"><span class="t">${esc(c.name)}</span><span class="sub" dir="ltr" style="text-align:right">${esc(c.phone || 'שיחה ב-Nest')}</span></span><button class="icon-btn muted sm" data-a="sos-del" data-v="${i}" aria-label="הסרה">${icon('xmark', 16)}</button></div>`).join('')}
  ${(S.sos || []).length < 5 ? `${'contacts' in navigator && 'select' in (navigator.contacts || {}) ? `<button class="row" data-a="sos-contacts">${icon('people', 22)}<span class="body t acc">בחירה מאנשי הקשר בטלפון</span></button>` : ''}<button class="row" data-a="sos-add">${icon('phone', 22)}<span class="body t acc">הוספת מספר טלפון</span></button>${local() ? '' : `<button class="row" data-a="sos-add-member">${icon('people', 22)}<span class="body t acc">בן משפחה בלי מספר (שיחה ב-Nest)</span></button>`}` : ''}</div>
  <p class="section-f">לחיצה ארוכה על SOS במסך הקבוצות פותחת את אפליקציית הטלפון שלך עם המספר הראשון ומחייגת, ושולחת התראת חירום עם המיקום לקבוצות שבהן SOS פעיל. רק את/ה רואה את הרשימה הזו.</p>
  <div class="section-h">מיקרופון ומצלמה</div>
  <div class="list"><div class="row">${icon('video', 22)}<span class="body t">לשיחות ולהודעות קוליות</span>${mediaPermRow()}</div></div>
  <p class="section-f">${S.mediaPerm && S.mediaPerm.mic === 'denied' ? 'הדפדפן זוכר סירוב קודם. "ניסיון שוב" שואל מחדש, ואם לא יוצא חלון, "איך מתקנים" מראה איפה משחררים.' : 'לשיחה קולית מספיק מיקרופון. כשהדפדפן שואל, לחצו "אפשר" ולא לסגור את החלון, אחרת Chrome חוסם אוטומטית.'}</p>
  <div class="section-h">התראות</div>
  <div class="list"><div class="row">${icon('bell', 22)}<span class="body t">התראות על הודעות ושיחות</span>${perm === 'granted' ? (S.pushOn ? '<span class="val" style="color:var(--ok)">גם כשסגור</span><button class="btn tinted sm" data-a="push-test">בדיקה</button>' : '<span class="val">פעילות</span>') : perm === 'denied' ? '<span class="val">חסומות</span>' : perm === 'unsupported' ? '<span class="val">לא נתמך</span>' : '<button class="btn tinted sm" data-a="notif">הפעלה</button>'}</div></div>
  <p class="section-f">${perm === 'denied' ? 'ההתראות חסומות בהגדרות הדפדפן לאתר הזה.' : (S.pushOn ? 'ההתראות, SOS, שיחות ו"הגעתי בשלום" מגיעים גם כש-Nest סגור לגמרי.' : 'התראות, SOS ו"הגעתי בשלום" מגיעים כש-Nest פתוח או ברקע.')}</p>
  ${canOfferInstall() ? `<div class="section-h"></div><div class="list"><button class="row" data-a="install">${icon('sparkles', 22)}<span class="body t">הוספה למסך הבית</span><span class="chev">${icon('chev', 16)}</span></button></div>` : ''}
  ${onSite && !standalone() ? `<div class="section-h">דפדפן</div><div class="list"><a class="row" href="${esc(chromeLink())}" style="text-decoration:none;color:inherit">${icon('link', 22)}<span class="body t">פתיחה ב-Chrome</span><span class="chev">${icon('chev', 16)}</span></a><button class="row" data-a="copy-link">${icon('copy', 22)}<span class="body t">העתקת הקישור</span></button></div><p class="section-f">${inAppBrowser() ? 'את/ה עכשיו בתוך אפליקציה אחרת. ב-Chrome אפשר להתקין, להיכנס עם Google ולהתקשר.' : 'את/ה כבר בדפדפן. אפשר להתקין: ⋮ ← "התקנת אפליקציה".'}</p>` : ''}
  <div class="section-h"></div><div class="list"><button class="row red" data-a="sign-out">התנתקות</button></div>
  <p class="section-f" style="text-align:center;padding-top:20px">Nest · הרשת של המשפחה</p>`;
}

/* ---------- group ---------- */
function viewGroup(g) {
  const add = S.gtab === 'together' ? { lists: ['new-list', 'רשימה חדשה'], capsules: ['new-capsule', 'קפסולה חדשה'], quotes: ['new-quote', 'ציטוט חדש'] }[S.hub] : { school: ['school-add', 'הוספה'], events: ['new-event', 'אירוע חדש'], album: ['pick', 'הוספת תמונות', 'album'] }[S.gtab];
  const trail = (add ? `<button class="nb-btn" data-a="${add[0]}"${add[2] ? ` data-v="${add[2]}"` : ''} aria-label="${add[1]}">${icon('plus', 24, 2.2)}</button>` : '') + `<button class="nb-btn" data-a="group-info" aria-label="פרטי הקבוצה">${icon('info', 23)}</button>`;
  const hubTitle = { lists: 'רשימות', capsules: 'קפסולות זמן', quotes: 'מה הילדים אמרו' }[S.hub];
  const head = bar({ inline: true, back: hubTitle ? 'ביחד' : 'קבוצות', titleHtml: hubTitle ? esc(hubTitle) : `<button class="nb-tbtn" data-a="group-info"><span>${esc(g.emoji)}</span><span class="ell">${esc(g.name)}</span></button>`, trail });
  return head + ({ feed: viewFeed, chat: viewGroupChat, events: viewEvents, album: viewAlbum, together: viewTogether, school: viewSchool }[S.gtab] || viewFeed)(g);
}

function imgFor(iid) { const im = S.data.images.find(i => i.id === iid); return full[iid] || (im && im.thumb) || ''; }
function viewFeed(g) {
  const u = S.user, posts = S.data.posts, P = S.poll;
  return `<form id="post-form" class="composer"><div class="top">${avatar(u, 38)}<textarea id="post-text" data-draft="post" rows="1" placeholder="${P ? 'מה השאלה?' : `מה חדש, ${esc(first(u.name))}?`}" aria-label="${P ? 'שאלת הסקר' : 'פוסט חדש'}" dir="auto"></textarea></div>
    ${S.img ? `<div class="prev"><img src="${S.img.thumb.data}" alt="התמונה שנבחרה"><button type="button" data-a="clear-img" aria-label="הסרת התמונה">${icon('xmark', 16)}</button></div>` : ''}
    ${S.vid ? `<div class="prev"><img src="${S.vid.thumb}" alt="הסרטון שנבחר"><span class="vplay">${icon('play', 24)}</span><span class="vdur">${fmtDur(S.vid.dur)}</span><button type="button" data-a="clear-vid" aria-label="הסרת הסרטון">${icon('xmark', 16)}</button></div>` : ''}
    ${P ? `<div class="poll-ed">${P.options.map((o, i) => `<input data-poll="${i}" value="${esc(o)}" placeholder="אפשרות ${i + 1}" maxlength="60" aria-label="אפשרות ${i + 1}">`).join('')}${P.options.length < 5 ? `<button type="button" class="link-btn" data-a="poll-add">${icon('plus', 16, 2.4)} אפשרות נוספת</button>` : ''}</div>` : ''}
    <div class="bar"><span class="btn-row" style="margin:0;gap:6px">${P ? '' : `<button type="button" class="btn tinted sm ic" data-a="pick" data-v="post" aria-label="תמונה">${icon('camera', 19)}</button><button type="button" class="btn tinted sm ic" data-a="pick-video" data-v="post" aria-label="סרטון">${icon('film', 19)}</button>`}<button type="button" class="btn tinted sm ic" data-a="emoji" data-v="post-text" aria-label="אימוג׳י">${icon('smile', 19)}</button><button type="button" class="btn ${P ? 'filled' : 'tinted'} sm" data-a="poll-toggle" aria-pressed="${!!P}">${icon('poll', 18)}${P ? ' סקר' : ''}</button></span><button id="post-btn" class="btn filled sm"${S.busy ? ' disabled' : ''}>${S.busy ? 'מפרסם…' : 'פרסום'}</button></div></form>
  <div class="posts">${posts.map(p => postCard(p, g, u)).join('') || `<div class="empty">${icon('feed', 48, 1.4)}<b>הפיד ריק</b><span>שתפו את הרגע הראשון של ${esc(g.name)}.</span></div>`}</div>`;
}
function postCard(p, g, u) {
  const a = S.members[p.authorId] || { id: p.authorId }, liked = p.likes.includes(u.id), src = p.imageId ? imgFor(p.imageId) : '', im = S.data.images.find(i => i.id === p.imageId);
  const likers = p.likes.slice(0, 3).map(id => first(nameOf(S.members[id] || {}))).filter(Boolean);
  let poll = '';
  if (p.poll) {
    const votes = Object.values(p.votes || {}), total = votes.length, mine = (p.votes || {})[u.id];
    poll = `<div class="poll">${p.poll.options.map((o, i) => { const n = votes.filter(v => v === i).length, pct = total ? Math.round(n / total * 100) : 0; return `<button class="popt${mine === i ? ' on' : ''}" data-a="vote" data-v="${esc(p.id)}" data-i="${i}" aria-pressed="${mine === i}"><span class="pfill" style="width:${pct}%"></span><span class="ptxt">${mine === i ? icon('check', 16, 2.6) : ''}${esc(o)}</span><span class="pct">${total ? pct + '%' : ''}</span></button>`; }).join('')}<div class="pfoot">${total} ${total === 1 ? 'הצבעה' : 'הצבעות'}${mine === undefined ? ' · בחרו תשובה' : ' · אפשר לשנות'}</div></div>`;
  }
  return `<article class="post"><header>${avatar(a, 40)}<div class="who"><b>${esc(nameOf(a))}</b><span>${ago(p.createdAt)}${p.poll ? ' · סקר' : ''}</span></div>${p.authorId === u.id || isOwner(g) ? `<button class="icon-btn muted" data-a="post-menu" data-v="${esc(p.id)}" aria-label="אפשרויות">${icon('more', 22)}</button>` : ''}</header>
    ${p.text ? `<p class="post-text${p.poll ? ' q' : ''}" dir="auto">${linkify(p.text)}</p>` : ''}${poll}
    ${p.video ? videoThumb(p.video, p.id, 'post', 'post-vid') : ''}
    ${p.imageId && (src || im) ? `<button class="post-img" data-a="view-img" data-v="${esc(p.imageId)}" style="aspect-ratio:${im ? im.w + '/' + im.h : '4/3'}"><img data-iid="${esc(p.imageId)}" src="${src}" alt="תמונה מ${esc(nameOf(a))}"></button>` : ''}
    <footer><button class="act${liked ? ' on' : ''}" data-a="like" data-v="${esc(p.id)}" aria-pressed="${liked}" aria-label="לייק">${icon('heart', 22)} ${p.likes.length || ''}</button><button class="act" data-a="comments" data-v="${esc(p.id)}" aria-label="תגובות">${icon('comment', 22)} ${p.commentCount || ''}</button></footer>
    ${likers.length ? `<div class="likers">${esc(likers.join(', '))}${p.likes.length > 3 ? ` ועוד ${p.likes.length - 3}` : ''} אהבו</div>` : ''}</article>`;
}

/* ---------- chat (group chat and private chats share this) ---------- */
function viewGroupChat(g) { return chatBody(S.data.messages, 'g', g) + chatBar(false); }
function viewDM() {
  const c = chat(), oid = otherOf(c) || (S.cid || '').split('_').find(x => x !== me()), o = S.members[oid] || { id: oid };
  const head = bar({ inline: true, back: 'שיחות', titleHtml: `<span class="nb-person">${avatar(o, 30)}<span class="ell">${esc(nameOf(o))}</span></span>`,
    trail: `<button class="nb-btn" data-a="call" data-v="audio" aria-label="שיחה קולית">${icon('phone', 22)}</button><button class="nb-btn" data-a="call" data-v="video" aria-label="שיחת וידאו">${icon('video', 24)}</button>` });
  return head + chatBody(S.dm, 'c', c) + chatBar(true);
}
function chatBody(desc, kind, ctx) {
  const msgs = desc.slice().reverse(), u = S.user;
  const otherRead = kind === 'c' && ctx ? ((ctx.reads || {})[otherOf(ctx)] || 0) : 0;
  let html = '', lastDay = '', lastA = '';
  const lastMine = msgs.filter(m => m.authorId === u.id && m.kind !== 'call').pop();
  msgs.forEach(m => {
    const d = dayKey(m.createdAt);
    if (d !== lastDay) { html += `<div class="day-sep"><span>${esc(dayLabel(m.createdAt))}</span></div>`; lastDay = d; lastA = ''; }
    if (m.kind === 'call') {
      const c = m.call || {}, missed = c.status !== 'done', who = m.authorId === u.id ? 'יוצאת' : 'נכנסת';
      html += `<div class="sys"><button class="sys-pill${missed ? ' miss' : ''}" data-a="call" data-v="${esc(c.kind || 'audio')}">${icon(c.kind === 'video' ? 'video' : 'phone', 16)} ${missed ? (c.status === 'declined' ? 'שיחה שנדחתה' : 'שיחה שלא נענתה') : `שיחה ${c.kind === 'video' ? 'בווידאו' : 'קולית'} ${who} · ${fmtDur(c.dur)}`} · ${hhmm(m.createdAt)}</button></div>`;
      lastA = ''; return;
    }
    if (m.kind === 'sos') {
      const nm = esc(first(nameOf(S.members[m.authorId])));
      html += m.loc ? `<div class="sys"><a class="sys-pill sos" href="https://maps.google.com/?q=${+m.loc.lat},${+m.loc.lng}" target="_blank" rel="noopener">📍 ${m.authorId === u.id ? 'המיקום שלך' : 'המיקום של ' + nm} · פתיחה במפות · ${hhmm(m.createdAt)}</a></div>`
        : `<div class="sys"><span class="sys-pill sos">🆘 ${m.authorId === u.id ? 'שלחת' : nm + ' שלח/ה'} קריאת SOS · ${hhmm(m.createdAt)}</span>${m.authorId !== u.id && !local() ? `<button class="btn filled sm sos-btn" data-a="sos-person" data-v="${esc(m.authorId)}">${icon('phoneF', 16)} התקשרות</button>` : ''}</div>`;
      lastA = ''; return;
    }
    if (m.kind === 'sosok' || m.kind === 'escort') {
      const nm = m.authorId === u.id ? 'את/ה' : esc(first(nameOf(S.members[m.authorId])));
      html += `<div class="sys"><span class="sys-pill ok">${m.kind === 'sosok' ? `${icon('shield', 16)} ${nm} בסדר · ה-SOS בוטל` : `${icon('route', 16)} ${nm} יצא/ה לדרך${m.text ? ' · ' + esc(m.text) : ''}${m.until ? ' · צפי ' + hhmm(m.until) : ''}`} · ${hhmm(m.createdAt)}</span></div>`;
      lastA = ''; return;
    }
    if (m.kind === 'checkin') {
      html += `<div class="sys"><span class="sys-pill ok">${icon('shield', 16)} ${m.authorId === u.id ? 'עדכנת שהגעת' : esc(first(nameOf(S.members[m.authorId]))) + ' הגיע/ה'} בשלום · ${hhmm(m.createdAt)}</span></div>`;
      lastA = ''; return;
    }
    const mine = m.authorId === u.id, a = S.members[m.authorId] || { id: m.authorId }, firstOf = m.authorId !== lastA;
    lastA = m.authorId;
    const jumbo = !m.image && !m.video && !m.audio && !m.replyTo && isJumbo(m.text);
    const reacts = Object.entries(m.reactions || {}), agg = {};
    reacts.forEach(([who, e]) => { agg[e] = agg[e] || { n: 0, mine: false }; agg[e].n++; if (who === u.id) agg[e].mine = true; });
    const r = m.replyTo, rName = r ? (r.authorId === u.id ? 'את/ה' : nameOf(S.members[r.authorId])) : '';
    const seenIt = kind === 'c' && mine && lastMine && m.id === lastMine.id;
    html += `<div class="msg${mine ? ' mine' : ''}${firstOf ? ' first' : ''}" id="m-${esc(m.id)}">${!mine && kind === 'g' ? `<span class="msg-av">${firstOf ? avatar(a, 28) : ''}</span>` : ''}<div class="mcol">
      <div class="bubble${(m.image || m.video) && !m.text ? ' pic' : ''}${jumbo ? ' jumbo' : ''}" data-mid="${esc(m.id)}">
        ${!mine && firstOf && kind === 'g' ? `<div class="msg-name" style="color:${userColor(m.authorId)}">${esc(nameOf(a))}</div>` : ''}
        ${r ? `<button class="quote" data-a="jump" data-v="${esc(r.id)}"><b>${esc(rName)}</b><span>${esc(r.text || '')}</span></button>` : ''}
        ${m.image ? `<button class="mimg" data-a="view-src" data-v="${esc(m.id)}"><img src="${m.image}" alt="תמונה" style="aspect-ratio:${m.w || 4}/${m.h || 3}"></button>` : ''}
        ${m.video ? videoThumb(m.video, m.id, 'msg', 'mvid') : ''}
        ${m.audio ? `<div class="aud" data-aid="${esc(m.id)}"><button class="aud-btn" data-a="play" data-v="${esc(m.id)}" aria-label="ניגון הודעה קולית">${icon('play', 18)}</button><span class="aud-bar"><span></span></span><span class="aud-t">${fmtDur(m.audio.dur)}</span></div>` : ''}
        ${m.text ? `<span class="mtext" dir="auto">${linkify(m.text)}</span>` : ''}
        <span class="msg-time">${hhmm(m.createdAt)}${mine && kind === 'c' ? `<span class="rcpt${m.createdAt <= otherRead ? ' read' : ''}">${icon(m.createdAt <= otherRead ? 'checks' : 'check', 14, 2.2)}</span>` : ''}</span>
      </div>
      ${Object.keys(agg).length ? `<div class="reacts">${Object.entries(agg).map(([e, v]) => `<button class="rchip${v.mine ? ' on' : ''}" data-a="react" data-v="${esc(m.id)}" data-e="${e}">${e}${v.n > 1 ? ` ${v.n}` : ''}</button>`).join('')}</div>` : ''}
      ${seenIt && m.createdAt <= otherRead ? '<div class="seen">נקרא</div>' : ''}
    </div></div>`;
  });
  const empty = kind === 'c' ? `<div class="empty">${icon('chats', 48, 1.4)}<b>שיחה חדשה</b><span>כתבו הודעה, שלחו הודעה קולית או התקשרו.</span></div>`
    : `<div class="empty">${icon('chat', 48, 1.4)}<b>עוד אין הודעות</b><span>כתבו משהו ל${esc(ctx ? ctx.name : 'קבוצה')}.</span></div>`;
  return `<div class="chat" id="chat">${html || empty}</div><div class="typing" id="typing" aria-live="polite"></div>`;
}
function chatBar(solo) {
  const r = S.reply;
  if (S.rec) return `<form id="chat-form" class="chat-bar glass rec${solo ? ' solo' : ''}"><div class="crow"><button type="button" class="link-btn red" data-a="rec-cancel">ביטול</button><span class="rec-dot"></span><span class="rec-t" id="rec-t">0:00</span><span class="body" style="color:var(--label2);font-size:15px">מקליט…</span><button type="button" class="send" data-a="rec-send" aria-label="שליחת ההקלטה">${icon('send', 18)}</button></div></form>`;
  return `<form id="chat-form" class="chat-bar glass${solo ? ' solo' : ''}">
    ${r ? `<div class="reply-bar">${icon('reply', 18)}<span class="body"><b>תשובה ל${esc(r.authorId === me() ? 'עצמך' : nameOf(S.members[r.authorId]))}</b><span>${esc(r.text)}</span></span><button type="button" class="icon-btn muted" data-a="reply-cancel" aria-label="ביטול התשובה">${icon('xmark', 16)}</button></div>` : ''}
    <div class="crow"><button type="button" class="icon-btn" data-a="attach" aria-label="צירוף תמונה, סרטון או עדכון">${icon('plus', 24, 2.2)}</button><button type="button" class="icon-btn" data-a="emoji" data-v="chat-in" aria-label="אימוג׳י">${icon('smile', 23)}</button><textarea id="chat-in" data-draft="${draftKey()}" rows="1" placeholder="הודעה" aria-label="הודעה" dir="auto" enterkeyhint="send"></textarea><button id="chat-send" class="send" type="button" aria-label="הקלטת הודעה קולית">${icon('mic', 19, 2)}</button></div></form>`;
}
function typingNames(map, ids) {
  const now = Date.now();
  return Object.entries(map || {}).filter(([id, t]) => id !== me() && now - t < 6000 && (!ids || ids.includes(id))).map(([id]) => first(nameOf(S.members[id])));
}
function updateTyping() {
  const el = $('#typing'); if (!el) return;
  const map = S.screen === 'chat' ? (chat() || {}).typing : (group() || {}).typing;
  const n = typingNames(map);
  el.textContent = !n.length ? '' : S.screen === 'chat' ? 'מקליד/ה…' : n.length === 1 ? `${n[0]} מקליד/ה…` : `${n.slice(0, 2).join(' ו')} מקלידים…`;
}
setInterval(() => { if (chatVisible()) updateTyping(); if (S.screen === 'root' && S.tab === 'chats' && !typing()) softRender(); }, 2500);
let typedAt = 0;
function sentTyping() { if (Date.now() - typedAt > 3000) { typedAt = Date.now(); be.setTyping(scope()); } }

async function send(m) {
  const sc = scope();
  if (S.reply) { m.replyTo = { id: S.reply.id, authorId: S.reply.authorId, text: S.reply.text }; S.reply = null; }
  try { await be.sendMessage(sc, m); haptic(6); if (sc.t === 'g') markGroupChatSeen(); }
  catch (e) { if (e && e.code === 'local') hud('זמין באתר, אחרי כניסה עם Google', true); else fail(e); throw e; }
  finally { render(); }
}
function msgById(id) { return curMsgs().find(m => m.id === id); }
function msgPreview(m) { return m.text || (m.image ? '📷 תמונה' : m.video ? '🎬 סרטון' : m.audio ? '🎤 הודעה קולית' : ''); }

// long press / right click on a bubble: reactions, reply, copy, delete
async function msgMenu(mid) {
  const m = msgById(mid); if (!m) return;
  haptic(12);
  const mineR = (m.reactions || {})[me()], g = group();
  const canDel = m.authorId === me() || (S.screen === 'group' && isOwner(g));
  const acts = [{ label: 'תשובה', k: 'reply' }].concat(m.text ? [{ label: 'העתקה', k: 'copy' }] : []).concat(canDel ? [{ label: 'מחיקה', k: 'delete', destructive: true }] : []);
  const top = `<div class="react-row">${REACTIONS.map(e => `<button type="button" class="${mineR === e ? 'on' : ''}" data-pick="r:${e}" aria-label="תגובה ${e}">${e}</button>`).join('')}</div>`;
  const r = await confirmSheet({ top, actions: acts });
  if (typeof r === 'string' && r.startsWith('r:')) { const e = r.slice(2); try { await be.react(scope(), mid, mineR === e ? null : e); } catch (x) { fail(x); } return; }
  const a = acts[r]; if (!a) return;
  if (a.k === 'reply') { S.reply = { id: m.id, authorId: m.authorId, text: msgPreview(m).slice(0, 80) }; render(); const t = $('#chat-in'); if (t) t.focus({ preventScroll: true }); }
  if (a.k === 'copy') copyText(m.text);
  if (a.k === 'delete') { try { await be.deleteMessage(scope(), m); hud('ההודעה נמחקה'); } catch (x) { fail(x); } }
}
let pressT = null, pressXY = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-mid]'); if (!b || e.target.closest('button,a')) return;
  pressXY = [e.clientX, e.clientY]; clearTimeout(pressT);
  pressT = setTimeout(() => { pressT = null; msgMenu(b.dataset.mid); }, 480);
});
document.addEventListener('pointermove', e => { if (pressT && pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) { clearTimeout(pressT); pressT = null; } });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { clearTimeout(pressT); pressT = null; }));
document.addEventListener('contextmenu', e => { const b = e.target.closest('[data-mid]'); if (b) { e.preventDefault(); msgMenu(b.dataset.mid); } });
document.addEventListener('dblclick', e => {
  const b = e.target.closest('[data-mid]'); if (!b) return;
  const m = msgById(b.dataset.mid); if (!m) return;
  be.react(scope(), m.id, (m.reactions || {})[me()] === '❤️' ? null : '❤️').catch(fail); haptic(10);
});

/* ---------- voice notes ---------- */
let recTick = null;
async function recStart() {
  const mime = recorderMime();
  if (mime === null) { hud('הדפדפן לא תומך בהקלטה', true); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { showMediaHelp(e, 'audio'); return; }
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  S.rec = { rec, stream, chunks, start: Date.now(), mime: rec.mimeType || mime || 'audio/webm', cancel: false };
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(recTick);
    const r = S.rec; S.rec = null; render();
    if (!r || r.cancel || !chunks.length) return;
    const dur = (Date.now() - r.start) / 1000;
    if (dur < 1) { hud('ההקלטה קצרה מדי', true); return; }
    const data = await blobToDataURL(new Blob(chunks, { type: r.mime }));
    if (data.length > 950000) { hud('ההקלטה ארוכה מדי', true); return; }
    send({ audio: { data, dur: Math.round(dur), mime: r.mime } }).catch(() => {});
  };
  rec.start(250); haptic(15); render();
  recTick = setInterval(() => {
    const el = $('#rec-t'); if (el && S.rec) el.textContent = fmtDur((Date.now() - S.rec.start) / 1000);
    if (S.rec && Date.now() - S.rec.start > 120000) recStop();
  }, 250);
}
function recStop() { if (S.rec && S.rec.rec.state !== 'inactive') S.rec.rec.stop(); }
function recCancel() { if (S.rec) { S.rec.cancel = true; recStop(); } }
const player = new Audio(); let playingId = null;
player.addEventListener('timeupdate', syncAudioUI);
player.addEventListener('ended', () => { playingId = null; syncAudioUI(); });
function syncAudioUI() {
  $$('.aud').forEach(el => {
    const on = el.dataset.aid === playingId, btn = el.querySelector('.aud-btn'), fill = el.querySelector('.aud-bar span'), t = el.querySelector('.aud-t');
    btn.innerHTML = icon(on && !player.paused ? 'pause' : 'play', 18);
    fill.style.width = on && player.duration ? (player.currentTime / player.duration * 100) + '%' : '0%';
    if (on && player.duration && isFinite(player.duration)) t.textContent = fmtDur(player.paused ? player.duration : player.currentTime);
  });
}
function playAudio(id) {
  const m = msgById(id); if (!m || !m.audio) return;
  if (playingId === id) { if (player.paused) player.play().catch(() => {}); else player.pause(); syncAudioUI(); return; }
  player.pause(); player.src = m.audio.data; playingId = id;
  player.play().catch(() => { hud('לא הצלחנו לנגן את ההקלטה במכשיר הזה', true); playingId = null; });
  syncAudioUI();
}

/* ---------- push notifications (free: Firebase Cloud Messaging sent by a Google Apps Script) ---------- */
async function setupPush() {
  if (local() || !onSite || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted' || !be.enablePush) return;
  be.setOnActivity(pushOut);
  try {
    const reg = await navigator.serviceWorker.ready;
    S.pushOn = !!(await be.enablePush(reg, VAPID_KEY, Object.keys(muted)));
    softRender();
  } catch (e) { console.warn('push', e); }
}
// Tell the other members' phones: the sender script checks membership with my own sign-in
async function pushOut(a) {
  if (!PUSH_URL || local()) return false;
  try {
    const idToken = await be.idToken(); if (!idToken) return false;
    const g = a.gid && S.groups.find(x => x.id === a.gid), sos = isSos(a.text);
    const title = a.title || (a.gid ? (sos ? '🆘 SOS · ' : '') + (g ? `${g.emoji} ${g.name}` : 'Nest') : nameOf(S.user));
    const tag = a.tag || (sos ? 'safety:' + me() : a.gid ? 'g:' + a.gid : 'c:' + a.cid);
    const body = JSON.stringify({ idToken, gid: a.gid, cid: a.cid, to: a.to, test: a.test, title, body: a.text, tag, urgent: !!(a.urgent || sos), safe: isCheckin(a.text) });
    await fetch(PUSH_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body });
    return true;
  } catch (e) { return false; }
}
// "Walk me home": the sender script pushes the family if the deadline passes without "הגעתי"
async function pushEscort() {
  if (!PUSH_URL || local()) return;
  try {
    const idToken = await be.idToken();
    fetch(PUSH_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'escort', idToken, gids: S.groups.filter(safetyOn).map(g => g.id) }) }).catch(() => {});
  } catch (e) {}
}

/* ---------- group types ---------- */
const GTYPES = { family: ['משפחה', '🏠'], friends: ['חברים', '🎉'], school: ['בית ספר', '🎒'] };
const gtype = g => (g && GTYPES[g.type]) ? g.type : 'family';
// "הגעתי בשלום" and SOS: on by default in a family group, off in friends/school until the owner turns them on
const safetyOn = g => !!g && (typeof g.safety === 'boolean' ? g.safety : gtype(g) === 'family');

/* ---------- SOS & check-in ---------- */
async function toAllGroups(m) {
  const gs = S.groups.filter(safetyOn); if (!gs.length) { hud(S.groups.length ? 'באף קבוצה לא הופעלו "הגעתי בשלום" ו-SOS' : 'עוד אין קבוצות לשלוח אליהן', true); return 0; }
  const r = await Promise.allSettled(gs.map(g => be.sendMessage({ t: 'g', id: g.id }, Object.assign({}, m))));
  const ok = r.filter(x => x.status === 'fulfilled').length;
  if (!ok) fail(r[0].reason);
  return ok;
}
function chime(urgent) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    (urgent ? [0, .18, .36, .54] : [0, .16]).forEach((d, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = urgent ? 'square' : 'sine'; o.frequency.value = urgent ? (i % 2 ? 660 : 990) : (i ? 1320 : 880); o.connect(g); g.connect(actx.destination); const t = actx.currentTime + d; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(urgent ? .25 : .15, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .16); o.start(t); o.stop(t + .18); });
  } catch (e) {}
  haptic(urgent ? [600, 200, 600, 200, 600] : [60, 80, 60]);
}
/* ---------- live safety: SOS and escort state shared through groups/{gid}/safety/{uid} ---------- */
const SOS_LIVE = 36e5, LATE_LIVE = 3 * 36e5;
S.safety = {}; unsub.safety = {};
const dismissed = LS.get('nest.safetyDismissed') || {};
Object.keys(dismissed).forEach(k => { if (Date.now() - dismissed[k] > 864e5) delete dismissed[k]; });
let sosAlarm = null, lastAcks = '', tracking = null, lastLocAt = 0;
const locOf = p => ({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy), t: Date.now() });
const mapsUrl = l => `https://maps.google.com/?q=${+l.lat},${+l.lng}`;
async function batteryPct() { try { const b = await navigator.getBattery(); return Math.round(b.level * 100); } catch (e) { return null; } }
const safetyDoc = (gid, uid) => (S.safety[gid] || []).find(d => d.uid === uid);
const ackText = acks => Object.entries(acks || {}).filter(([k]) => k !== me()).map(([k, v]) => `${esc(first(nameOf(S.members[k])))} ${v === 'coming' ? 'בדרך' : 'ראה/תה'}`).join(' · ');

function syncSafety() {
  const want = new Set(S.groups.filter(safetyOn).map(g => g.id));
  Object.keys(unsub.safety).forEach(gid => { if (!want.has(gid)) { try { unsub.safety[gid](); } catch (e) {} delete unsub.safety[gid]; delete S.safety[gid]; } });
  want.forEach(gid => {
    if (unsub.safety[gid]) return;
    unsub.safety[gid] = be.watchSafety(gid, async list => {
      S.safety[gid] = list;
      await loadUsers(list.flatMap(d => [d.uid].concat(Object.keys(d.acks || {}))));
      evalSafety(true);
    }, () => {});
  });
}
// My own active SOS / escort, merged across the groups it was sent to
function mySafety() {
  const now = Date.now(), act = [];
  Object.entries(S.safety).forEach(([gid, l]) => (l || []).forEach(d => {
    if (d.uid !== me()) return;
    if ((d.mode === 'sos' && now - d.at < 3 * SOS_LIVE) || (d.mode === 'escort' && now - d.until < LATE_LIVE)) act.push(Object.assign({ gid }, d));
  }));
  if (!act.length) return null;
  const top = act.sort((a, b) => b.at - a.at)[0], same = act.filter(d => d.mode === top.mode && d.at === top.at), acks = {};
  same.forEach(d => Object.assign(acks, d.acks || {}));
  return { mode: top.mode, at: top.at, until: top.until, dest: top.dest, acks, gids: same.map(d => d.gid) };
}
function evalSafety(fromSnap) {
  const now = Date.now();
  let next = null;
  Object.entries(S.safety).forEach(([gid, l]) => (l || []).forEach(d => {
    if (d.uid === me()) return;
    if (d.mode === 'sos' && now - d.at < SOS_LIVE) {
      const key = d.uid + ':sos:' + d.at;
      if (!dismissed[key] && (!next || next.kind !== 'sos')) next = { gid, by: d.uid, at: d.at, kind: 'sos', key };
    } else if (d.mode === 'escort' && now > d.until && now - d.until < LATE_LIVE) {
      const key = d.uid + ':late:' + d.until;
      if (!dismissed[key] && !next) next = { gid, by: d.uid, at: d.until, kind: 'late', key };
    }
  }));
  const cur = S.sosAlert;
  if (cur) {
    const d = safetyDoc(cur.gid, cur.by);
    const still = d && ((cur.kind === 'sos' && d.mode === 'sos' && d.at === cur.at) || (cur.kind === 'late' && d.mode === 'escort' && d.until === cur.at));
    if (!still) {
      const nm = first(nameOf(S.members[cur.by]));
      closeSosAlert();
      if (d && d.mode === 'escort' && cur.kind === 'late') hud(`${nm} הוסיף/ה זמן לדרך`);
      else { hud(`${nm} בסדר`); notify(`${nm} בסדר`, cur.kind === 'sos' ? 'ה-SOS בוטל' : 'הגיע/ה בשלום', 'safety:' + cur.by); }
    } else renderSosAlert();
  }
  if (!S.sosAlert && next) openSafetyAlert(next);
  // my own SOS / escort: who answered, the deadline, live location
  const m = mySafety(), ak = m ? JSON.stringify(m.acks) : '';
  if (m && lastAcks && ak !== lastAcks && Object.keys(m.acks).length) {
    const [uid, v] = Object.entries(m.acks).pop();
    hud(`${first(nameOf(S.members[uid]))} ${v === 'coming' ? 'בדרך אליך' : 'ראה/תה את ההתראה'}`); haptic([80, 60, 80]);
  }
  lastAcks = ak;
  if (m && m.mode === 'escort' && now > m.until && LS.get('nest.escWarned') !== m.until) {
    LS.set('nest.escWarned', m.until); chime(true);
    notify('הגעת?', 'הזמן שקבעת נגמר. לחצו "הגעתי" או הוסיפו זמן, אחרת המשפחה מקבלת התראה', 'escort', true);
    hud('הזמן נגמר. הגעת? לחצו "הגעתי"', true);
  }
  if (m) startTracking(); else stopTracking();
  if (fromSnap) softRender();
}
setInterval(() => { if (S.user) evalSafety(); }, 15000);
setInterval(() => { const el = $('#sb-time'), m = mySafety(); if (el && m && m.until) el.textContent = escLeft(m.until); }, 1000);

function openSafetyAlert(a) {
  S.sosAlert = a;
  const nm = nameOf(S.members[a.by]);
  notify(a.kind === 'sos' ? '🆘 SOS: ' + nm : '⚠️ ' + nm + ' עוד לא הגיע/ה', a.kind === 'sos' ? 'צריך/ה עזרה עכשיו. לחצו לפתיחה' : 'הזמן שנקבע לדרך נגמר, ואין אישור הגעה', 'safety:' + a.by, true);
  renderSosAlert();
  clearInterval(sosAlarm); let n = 0; chime(true);
  sosAlarm = setInterval(() => { if (++n > (a.kind === 'sos' ? 20 : 5) || !S.sosAlert) { clearInterval(sosAlarm); return; } chime(true); }, 1500);
}
function closeSosAlert() {
  if (S.sosAlert) { dismissed[S.sosAlert.key] = Date.now(); LS.set('nest.safetyDismissed', dismissed); }
  S.sosAlert = null; clearInterval(sosAlarm); renderSosAlert();
}
function renderSosAlert() {
  let el = $('#sos-alert'); const a = S.sosAlert;
  if (!a) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'sos-alert'; el.setAttribute('role', 'alertdialog'); phoneEl.appendChild(el); }
  const d = safetyDoc(a.gid, a.by) || {}, u = S.members[a.by] || { id: a.by }, late = a.kind === 'late', nm = esc(nameOf(u));
  const loc = d.loc, mins = loc ? Math.max(0, Math.round((Date.now() - loc.t) / 60000)) : 0, acks = ackText(d.acks), mine = (d.acks || {})[me()];
  el.className = 'call sos-alert' + (late ? ' late' : '');
  el.innerHTML = `<div class="call-top"><div class="sos-big">${late ? 'לא הגיע/ה' : 'SOS'}</div><div class="call-av">${avatar(u, 88)}</div>
      <div class="call-name">${late ? `${nm} עוד לא הגיע/ה` : `${nm} צריך/ה עזרה`}</div>
      <div class="call-st">${late ? `הצפי היה ${hhmm(d.until)}${d.dest ? ' · ' + esc(d.dest) : ''}` : `נשלח ב-${hhmm(a.at)}`}${d.battery != null ? ` · סוללה ${+d.battery}%` : ''}</div>
      ${acks ? `<div class="sos-acks">${acks}</div>` : ''}</div>
    <div class="sos-acts">
      <button class="btn filled sos-call" data-a="sos-alert-call">${icon('phoneF', 20)} התקשרות עכשיו</button>
      <div class="sos-two"><button class="btn sos-sec${mine === 'seen' ? ' on' : ''}" data-a="sos-ack" data-v="seen">ראיתי</button><button class="btn sos-sec${mine === 'coming' ? ' on' : ''}" data-a="sos-ack" data-v="coming">אני בדרך</button></div>
      ${loc ? `<a class="btn sos-sec" href="${mapsUrl(loc)}" target="_blank" rel="noopener">📍 מיקום ${mins < 1 ? 'עדכני' : `מלפני ${mins} דק׳`}</a>` : '<span class="sos-noloc">ממתינים למיקום…</span>'}
      <div class="sos-two"><button class="btn sos-sec" data-a="sos-alert-open">לצ׳אט</button><button class="btn sos-sec" data-a="sos-alert-close">סגירה</button></div>
    </div>`;
}

// Location keeps flowing to the family while my SOS / escort is on (and the app is open)
function startTracking() {
  if (tracking !== null || !navigator.geolocation) return;
  tracking = navigator.geolocation.watchPosition(p => {
    if (Date.now() - lastLocAt < 20000) return;
    const m = mySafety(); if (!m) { stopTracking(); return; }
    lastLocAt = Date.now();
    const loc = locOf(p);
    batteryPct().then(battery => m.gids.forEach(gid => be.updateSafety(gid, battery == null ? { loc } : { loc, battery }).catch(() => {})));
  }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}
function stopTracking() { if (tracking !== null && navigator.geolocation) navigator.geolocation.clearWatch(tracking); tracking = null; }

// The bar at the top while my SOS / escort is on
const escLeft = u => { const s = Math.round((u - Date.now()) / 1000); return s > 0 ? 'עוד ' + fmtDur(s) : 'באיחור של ' + fmtDur(-s); };
function safetyBar() {
  const m = mySafety(); if (!m) return '';
  const acks = ackText(m.acks);
  if (m.mode === 'sos') return `<div class="safety-bar sos" role="status"><div class="sb-t"><b>SOS פעיל</b><span>${acks || 'מחכים שמישהו יראה…'} · המיקום מתעדכן</span></div><button class="btn sm sb-ok" data-a="sos-ok">אני בסדר</button></div>`;
  const late = Date.now() > m.until;
  return `<div class="safety-bar esc${late ? ' late' : ''}" role="status"><div class="sb-t"><b>${late ? 'הזמן נגמר' : 'בליווי'}${m.dest ? ' · ' + esc(m.dest) : ''}</b><span><span id="sb-time">${escLeft(m.until)}</span>${acks ? ' · ' + acks : ''}</span></div><button class="btn sm sb-more" data-a="escort-more">+10</button><button class="btn sm sb-ok" data-a="escort-done">הגעתי</button></div>`;
}
async function safetyEnd(arrived) {
  const m = mySafety(); if (!m) return;
  if (m.mode === 'sos') {
    const r = await confirmSheet({ title: 'לבטל את ה-SOS?', msg: 'כולם יקבלו עדכון שאת/ה בסדר.', actions: [{ label: 'אני בסדר, לבטל' }] });
    if (r !== 0) return;
  }
  await Promise.all(m.gids.map(gid => be.updateSafety(gid, { mode: 'ok', endedAt: Date.now() }).catch(() => {})));
  stopTracking();
  await toAllGroups(m.mode === 'sos' && !arrived ? { kind: 'sosok', text: '' } : { kind: 'checkin', text: '' });
  haptic(20); hud(m.mode === 'sos' ? 'עדכנו את כולם שאת/ה בסדר' : 'עדכנו את כולם שהגעת בשלום'); render();
}

// Escort: "walk me home" with a deadline; if it passes without "הגעתי", the family is alerted
function escortForm() {
  if (!S.groups.some(safetyOn)) { hud('צריך קבוצה שבה "הגעתי בשלום" פעיל', true); return; }
  let min = 20;
  const fs = formSheet({ title: 'ליווי הביתה', action: 'יציאה לדרך', body: `<p class="muted" style="margin:0 4px 12px">המשפחה תראה שאת/ה בדרך ואת המיקום שלך. אם לא תלחצו "הגעתי" עד הזמן שנקבע, כולם יקבלו התראה.</p>
    <div class="list"><div class="field"><input id="es-dest" placeholder="לאן? (למשל: הביתה)" maxlength="40" autofocus></div></div>
    <div class="section-h">כמה זמן הדרך?</div><div class="seg" id="es-min">${[10, 20, 30, 45, 60].map(v => `<button type="button" data-m="${v}" class="${v === min ? 'on' : ''}">${v} דק׳</button>`).join('')}</div>`,
    onOk: async f => { await escortStart(f.querySelector('#es-dest').value.trim(), min); } });
  fs.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { min = +b.dataset.m; fs.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); });
}
async function escortStart(dest, min) {
  const at = Date.now(), until = at + min * 60000, battery = await batteryPct();
  await Promise.all(S.groups.filter(safetyOn).map(g => be.setSafety(g.id, { mode: 'escort', at, until, dest, loc: null, battery })));
  toAllGroups({ kind: 'escort', text: dest, until });
  pushEscort();
  startTracking(); haptic(15); hud(`בליווי. צפי הגעה ${hhmm(until)}`); render();
}
async function escortMore() {
  const m = mySafety(); if (!m || m.mode !== 'escort') return;
  const until = Math.max(m.until, Date.now()) + 10 * 60000;
  await Promise.all(m.gids.map(gid => be.updateSafety(gid, { until }).catch(() => {})));
  pushEscort();
  hud(`צפי חדש: ${hhmm(until)}`);
}
// On the groups screen: family members who are on their way
function escortTips() {
  const seen = new Set(), out = [];
  Object.values(S.safety).forEach(l => (l || []).forEach(d => {
    if (d.uid === me() || seen.has(d.uid) || d.mode !== 'escort' || Date.now() - d.until > LATE_LIVE) return;
    seen.add(d.uid);
    const late = Date.now() > d.until, nm = esc(first(nameOf(S.members[d.uid])));
    out.push(`<div class="tip${late ? ' late' : ''}">${icon('route', 24)}<span class="body"><b>${nm} ${late ? 'עוד לא הגיע/ה' : 'בדרך'}${d.dest ? ' · ' + esc(d.dest) : ''}</b><br><span style="color:var(--label2);font-size:13px">צפי ${hhmm(d.until)}${d.loc ? ` · <a href="${mapsUrl(d.loc)}" target="_blank" rel="noopener">מיקום</a>` : ''}</span></span><button class="btn tinted sm" data-a="sos-person" data-v="${esc(d.uid)}">התקשרות</button></div>`);
  }));
  return out.join('');
}
function notifCard() {
  if (local() || !('Notification' in window) || Notification.permission !== 'default' || LS.get('nest.notifAsked') || inAppBrowser()) return '';
  return `<div class="tip">${icon('bell', 24)}<span class="body"><b>הפעילו התראות</b><br><span style="color:var(--label2);font-size:13px">כדי לקבל SOS, "הגעתי בשלום" והודעות גם כש-Nest ברקע</span></span><button class="btn filled sm" data-a="notif">הפעלה</button><button class="icon-btn muted sm" data-a="notif-hide" aria-label="סגירה">${icon('xmark', 16)}</button></div>`;
}
// Hold SOS for 1.5s: every group is alerted at once; the phone call starts on release (dialing needs that tap)
let sosT = null, sosArmed = false;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-hold=sos]'); if (!b) return;
  e.preventDefault(); b.classList.add('holding'); sosArmed = false; haptic(10);
  clearTimeout(sosT); sosT = setTimeout(() => { sosArmed = true; b.classList.remove('holding'); b.classList.add('fired'); sosFire(); }, 1500);
});
document.addEventListener('pointerup', () => {
  const was = !!sosT && !sosArmed && $$('[data-hold=sos].holding').length;
  clearTimeout(sosT); sosT = null; $$('[data-hold=sos]').forEach(x => x.classList.remove('holding'));
  if (sosArmed) { sosArmed = false; sosDial(); setTimeout(() => $$('[data-hold=sos]').forEach(x => x.classList.remove('fired')), 1500); }
  else if (was) hud('החזיקו את SOS לחוץ שנייה וחצי', true);
}, true);
document.addEventListener('pointercancel', () => { if (!sosArmed) { clearTimeout(sosT); sosT = null; $$('[data-hold=sos]').forEach(x => x.classList.remove('holding')); } }, true);
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-hold=sos]')) e.preventDefault(); });
async function sosFire() {
  chime(true);
  const at = Date.now(), battery = await batteryPct(), gs = S.groups.filter(safetyOn);
  // the live doc carries location, battery and who answered; the chat message keeps the history
  gs.forEach(g => be.setSafety(g.id, { mode: 'sos', at, loc: null, battery }).catch(() => {}));
  const n = await toAllGroups({ kind: 'sos', text: '' });
  if (n) hud(`התראת חירום נשלחה ל-${n} ${n === 1 ? 'קבוצה' : 'קבוצות'}`, true);
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => {
    const loc = locOf(p);
    gs.forEach(g => be.updateSafety(g.id, { loc }).catch(() => {}));
    toAllGroups({ kind: 'sos', text: '', loc });
  }, () => hud('המיקום לא נשלח. אפשרו גישה למיקום', true), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  startTracking();
}
const telOf = p => 'tel:' + String(p).replace(/[^\d+*#]/g, '');
function sosDial() {
  const l = S.sos || [], ph = l.find(c => c.phone), nest = l.find(c => c.uid);
  sosSheet(true);
  if (ph) location.href = telOf(ph.phone);
  else if (nest) { if (closeForm) closeForm(); startCall(nest.uid, 'audio'); }
}
async function sosPhoneContact() {
  try {
    const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (!c) return;
    const phone = (c.tel || [])[0], name = ((c.name || [])[0] || '').trim() || phone;
    if (!phone) { hud('לאיש הקשר הזה אין מספר טלפון', true); return; }
    const l = (S.sos || []).concat([{ name: name.slice(0, 30), phone: phone.slice(0, 20) }]).slice(0, 5);
    await be.saveSos(l); S.sos = l; hud('איש הקשר נשמר'); render();
  } catch (e) { if (e && e.name !== 'AbortError') sosContactForm(); }
}
function sosSheet(fired) {
  const l = S.sos || [], ph = l.find(c => c.phone);
  const rows = l.map((c, i) => c.phone ? `<a class="row" href="${esc(telOf(c.phone))}" style="text-decoration:none;color:inherit"><span class="sos-ic">${icon('phoneF', 18)}</span><span class="body"><span class="t">${esc(c.name)}</span><span class="sub" dir="ltr" style="text-align:right">${esc(c.phone)}</span></span><span class="val acc">חיוג</span></a>`
    : `<button class="row" data-a="sos-call" data-v="${i}">${avatar(S.members[c.uid] || { id: c.uid, name: c.name }, 34)}<span class="body"><span class="t">${esc(c.name)}</span><span class="sub">שיחה ב-Nest</span></span><span class="val acc">התקשרות</span></button>`).join('');
  const em = [['100', 'משטרה'], ['101', 'מד"א'], ['102', 'כיבוי אש']].map(([n, t]) => `<a class="row" href="tel:${n}" style="text-decoration:none;color:inherit"><span class="sos-ic red">${icon('phoneF', 18)}</span><span class="body t">${t}</span><span class="val" dir="ltr">${n}</span></a>`).join('');
  formSheet({ title: fired ? 'SOS נשלח' : 'SOS', body: `${ph ? `<a class="btn filled sos-dial" href="${esc(telOf(ph.phone))}">${icon('phoneF', 22)} חיוג ל${esc(ph.name)}</a>` : ''}<p class="muted" style="margin:0 4px 12px">${fired ? 'ההתראה והמיקום נשלחו לקבוצות שבהן SOS פעיל. אם החייגן לא נפתח, לחצו על הכפתור האדום.' : 'לחיצה ארוכה על SOS מחייגת דרך אפליקציית הטלפון לאיש הקשר הראשון ושולחת התראה לקבוצות.'}</p>
    ${l.length ? `<div class="section-h">אנשי הקשר שלך</div><div class="list">${rows}</div>` : `<div class="list"><button class="row" data-a="sos-add">${icon('phone', 22)}<span class="body t acc">הגדרת איש קשר לחירום</span></button></div>`}
    ${`<div class="list" style="margin-top:12px"><button class="row" data-a="escort">${icon('route', 22)}<span class="body t acc">ליווי הביתה</span><span class="chev">${icon('chev', 16)}</span></button></div>`}
    <div class="section-h">מוקדי חירום</div><div class="list">${em}</div>` });
}
function sosContactForm() {
  formSheet({ title: 'איש קשר לחירום', action: 'הוספה', body: `<div class="list"><div class="field"><input id="sc-name" placeholder="שם" maxlength="30" autofocus></div><div class="field"><input id="sc-phone" type="tel" dir="ltr" placeholder="050-0000000" maxlength="20"></div></div><p class="section-f">הראשון ברשימה מחויג אוטומטית ב-SOS.</p>`,
    onOk: async fs => {
      const name = fs.querySelector('#sc-name').value.trim(), phone = fs.querySelector('#sc-phone').value.trim();
      if (!name || phone.replace(/\D/g, '').length < 3) { hud('צריך שם ומספר טלפון', true); return false; }
      const l = (S.sos || []).concat([{ name, phone }]).slice(0, 5); await be.saveSos(l); S.sos = l; hud('איש הקשר נשמר'); render();
    } });
}
async function sosMemberPick() {
  await loadUsers(allMemberIds());
  const ids = allMemberIds().filter(i => i !== me() && !(S.sos || []).some(c => c.uid === i));
  if (!ids.length) { hud('אין עוד בני משפחה להוספה', true); return; }
  const r = await confirmSheet({ title: 'מי יקבל שיחת SOS ב-Nest?', actions: ids.map(i => ({ label: nameOf(S.members[i]) })) });
  if (r < 0) return;
  const l = (S.sos || []).concat([{ name: nameOf(S.members[ids[r]]), uid: ids[r] }]).slice(0, 5);
  try { await be.saveSos(l); S.sos = l; hud('נוסף לאנשי הקשר לחירום'); render(); } catch (e) { fail(e); }
}
// Say what's coming before the browser's own prompt: a dismissed prompt makes Chrome block automatically
async function prePermission(kind) {
  await refreshMediaPerm();
  const p = S.mediaPerm || {};
  if (p.unknown || p.mic !== 'prompt') return true;
  const r = await confirmSheet({ title: 'הדפדפן ישאל על המיקרופון' + (kind === 'video' ? ' והמצלמה' : ''), msg: 'לחצו "אפשר". אם סוגרים את החלון בלי לבחור, Chrome חוסם את השיחות אוטומטית.', actions: [{ label: 'הבנתי, להמשיך' }] });
  return r === 0;
}
function permCard() {
  const p = S.mediaPerm || {};
  if (local() || LS.get('nest.permAsked') || inAppBrowser() || p.unknown || p.mic !== 'prompt') return '';
  return `<div class="tip">${icon('phone', 24)}<span class="body"><b>הכנה לשיחות</b><br><span style="color:var(--label2);font-size:13px">אשרו מיקרופון עכשיו, כדי שהשיחות יעבדו מיד</span></span><button class="btn filled sm" data-a="perm-go">אישור</button><button class="icon-btn muted sm" data-a="perm-hide" aria-label="סגירה">${icon('xmark', 16)}</button></div>`;
}

/* ---------- calls ---------- */
let ringTimer = null, callTick = null, actx = null;
function ring(on) {
  clearInterval(ringTimer);
  if (!on) return;
  const beep = () => {
    haptic([400, 200, 400]);
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, .25].forEach(d => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); const t = actx.currentTime + d; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .2); o.start(t); o.stop(t + .22); });
    } catch (e) {}
  };
  beep(); ringTimer = setInterval(beep, 2200);
}
const callUI = {
  async incoming(c) {
    if (S.incoming || (calls && calls.state)) return;
    await loadUsers([c.from]);
    S.incoming = c; renderIncoming(); ring(true);
    if (document.hidden) notify('שיחה נכנסת', `${nameOf(S.members[c.from])} · ${c.kind === 'video' ? 'שיחת וידאו' : 'שיחה קולית'}`, 'call');
  },
  incomingGone(id) { if (S.incoming && S.incoming.id === id) { const from = S.members[S.incoming.from]; S.incoming = null; ring(false); renderIncoming(); hud(`שיחה שלא נענתה מ${first(nameOf(from))}`, true); } },
  open: () => renderCall(), update: () => renderCall(), close: () => renderCall(),
  toast: m => hud(m, true),
  mediaError: (e, kind) => showMediaHelp(e, kind),
  ended(info) {
    if (info.role !== 'caller') return;
    const status = info.status === 'ended' && info.dur > 0 ? 'done' : info.status === 'declined' ? 'declined' : 'missed';
    be.sendMessage({ t: 'c', id: chatId(me(), info.other) }, { kind: 'call', call: { kind: info.kind, dur: info.dur, status } }).catch(() => {});
  }
};
// Why the camera/microphone can't be used, and how to fix it on this device
async function showMediaHelp(e, kind) {
  const h = mediaHelp(e, kind);
  const acts = h.link ? [{ label: 'העתקת הקישור' }, { label: 'הבנתי' }] : [{ label: 'הבנתי' }];
  const r = await confirmSheet({ title: h.title, msg: h.msg, actions: acts });
  if (h.link && r === 0) copyText(location.origin + location.pathname);
}
async function startCall(uid, kind) {
  if (!calls) { hud('שיחות קול ווידאו זמינות באתר, אחרי כניסה עם Google', true); return; }
  if (calls.state) return;
  if (inAppBrowser()) { showMediaHelp(null, kind); return; }
  if (!navigator.mediaDevices || !window.RTCPeerConnection) { hud('הדפדפן הזה לא תומך בשיחות', true); return; }
  if (!(await prePermission(kind))) return;
  try {
    await be.openChat(uid); await loadUsers([uid]);
    // wake the other phone even if Nest is closed there
    pushOut({ cid: chatId(me(), uid), to: uid, urgent: true, tag: 'call:' + me(), title: nameOf(S.user), text: kind === 'video' ? '📹 שיחת וידאו נכנסת' : '📞 שיחה נכנסת' });
    await calls.start(uid, kind);
  }
  catch (e) { fail(e); }
}
function renderIncoming() {
  let el = $('#incoming'); const c = S.incoming;
  if (!c) { if (el) el.remove(); return; }
  const u = S.members[c.from] || { id: c.from };
  if (!el) { el = document.createElement('div'); el.id = 'incoming'; el.className = 'call incoming'; el.setAttribute('role', 'alertdialog'); phoneEl.appendChild(el); }
  el.innerHTML = `<div class="call-top"><div class="call-av">${avatar(u, 110)}</div><div class="call-name">${esc(nameOf(u))}</div><div class="call-st">${c.kind === 'video' ? 'שיחת וידאו נכנסת…' : 'שיחה קולית נכנסת…'}</div></div>
    <div class="call-ctl two"><div class="cbtn-w"><button class="cbtn red" data-a="call-decline" aria-label="דחייה">${icon('phoneDown', 34)}</button><span>דחייה</span></div><div class="cbtn-w"><button class="cbtn green" data-a="call-accept" aria-label="מענה">${icon(c.kind === 'video' ? 'videoF' : 'phoneF', 30)}</button><span>מענה</span></div></div>`;
}
function renderCall() {
  const st = calls && calls.state; let el = $('#call');
  if (!st) { if (el) el.remove(); clearInterval(callTick); callTick = null; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'call'; el.className = 'call'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'שיחה');
    el.innerHTML = `<video class="rv" id="rv" autoplay playsinline></video><video class="lv" id="lv" autoplay playsinline muted></video><audio id="ra" autoplay></audio>
      <div class="call-top"><div class="call-av" id="call-av"></div><div class="call-name" id="call-name"></div><div class="call-st" id="call-st"></div></div><div class="call-ctl" id="call-ctl"></div>`;
    phoneEl.appendChild(el);
    callTick = setInterval(updCallStatus, 1000);
  }
  const u = S.members[st.other] || { id: st.other }, video = st.kind === 'video', hasRemoteVideo = st.remote.getVideoTracks().length > 0;
  el.classList.toggle('video', video); el.classList.toggle('live', video && hasRemoteVideo);
  $('#call-av').innerHTML = avatar(u, 110); $('#call-name').textContent = nameOf(u);
  const rv = $('#rv'), lv = $('#lv'), ra = $('#ra');
  if (video) { if (rv.srcObject !== st.remote) rv.srcObject = st.remote; ra.srcObject = null; }
  else { if (ra.srcObject !== st.remote) ra.srcObject = st.remote; rv.srcObject = null; }
  if (video && st.local) { if (lv.srcObject !== st.local) lv.srcObject = st.local; lv.hidden = st.camOff; } else lv.hidden = true;
  $('#call-ctl').innerHTML = `<div class="cbtn-w"><button class="cbtn${st.muted ? ' on' : ''}" data-a="call-mute" aria-pressed="${st.muted}" aria-label="השתקה">${icon(st.muted ? 'micOff' : 'mic', 28)}</button><span>${st.muted ? 'מושתק' : 'השתקה'}</span></div>
    ${video ? `<div class="cbtn-w"><button class="cbtn${st.camOff ? ' on' : ''}" data-a="call-cam" aria-pressed="${st.camOff}" aria-label="מצלמה">${icon(st.camOff ? 'videoOff' : 'video', 28)}</button><span>מצלמה</span></div><div class="cbtn-w"><button class="cbtn" data-a="call-flip" aria-label="החלפת מצלמה">${icon('flip', 28)}</button><span>החלפה</span></div>` : ''}
    <div class="cbtn-w"><button class="cbtn red" data-a="call-end" aria-label="ניתוק">${icon('phoneDown', 34)}</button><span>ניתוק</span></div>`;
  updCallStatus();
}
function updCallStatus() {
  const st = calls && calls.state, el = $('#call-st'); if (!st || !el) return;
  el.textContent = st.status === 'ringing' ? 'מצלצל…' : st.status === 'live' ? fmtDur((Date.now() - st.startedAt) / 1000) : 'מתחבר…';
}

/* ---------- events ---------- */
function viewEvents(g) {
  const u = S.user, evs = S.data.events;
  const bdays = g.members.map(id => S.members[id]).filter(m => m && m.birthday).map(m => { const b = nextBirthday(m.birthday); return b && b.days <= 60 ? { bday: true, id: 'b-' + m.id, uid: m.id, date: b.date, age: b.age, title: m.id === u.id ? 'יום ההולדת שלך' : `יום הולדת ל${nameOf(m)}` } : null; }).filter(Boolean);
  const up = evs.filter(e => daysTo(e.date) >= 0).concat(bdays).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const past = evs.filter(e => daysTo(e.date) < 0).reverse();
  const card = e => {
    const p = e.date.split('-').map(Number), dt = new Date(p[0], p[1] - 1, p[2]), n = daysTo(e.date);
    const when = n >= 0 ? `<span class="when">${n === 0 ? 'היום' : n === 1 ? 'מחר' : `בעוד ${n} ימים`}</span>` : '';
    if (e.bday) return `<div class="ev bd"><div class="ev-date"><span class="m">${MONTHS[dt.getMonth()]}</span><span class="d">${dt.getDate()}</span></div><div class="body">${when}<b>🎂 ${esc(e.title)}</b><span class="sub">יום ${DAYS[dt.getDay()]}${e.age ? ` · ${e.uid === u.id ? 'את/ה חוגג/ת' : 'חוגג/ת'} ${e.age}` : ''}</span>${e.uid !== u.id && !local() ? `<div><button class="btn tinted sm" data-a="dm" data-v="${esc(e.uid)}" style="margin-top:6px">${icon('chat', 16)} ברכה בפרטי</button></div>` : ''}</div></div>`;
    const r = e.rsvp || {}, mine = r[u.id] || '', cnt = v => Object.values(r).filter(x => x === v).length;
    return `<div class="ev${n < 0 ? ' past' : ''}"><div class="ev-date"><span class="m">${MONTHS[dt.getMonth()]}</span><span class="d">${dt.getDate()}</span></div><div class="body">
      ${when}<b dir="auto">${esc(e.title)}</b>
      <span class="sub">יום ${DAYS[dt.getDay()]}${e.time ? ` · ${esc(e.time)}` : ''}${e.place ? ` · ${esc(e.place)}` : ''}</span>
      ${n >= 0 ? `<div class="seg" role="group" aria-label="אישור הגעה">${[['yes', 'מגיע/ה'], ['maybe', 'אולי'], ['no', 'לא']].map(([v, l]) => `<button class="${mine === v ? 'on' : ''}" data-a="rsvp" data-v="${esc(e.id)}" data-r="${v}" aria-pressed="${mine === v}">${l}</button>`).join('')}</div>` : ''}
      <span class="sub">${cnt('yes')} מגיעים${cnt('maybe') ? ` · ${cnt('maybe')} אולי` : ''}${cnt('no') ? ` · ${cnt('no')} לא` : ''}</span></div>
      ${e.createdBy === u.id || isOwner(g) ? `<button class="icon-btn muted" data-a="event-menu" data-v="${esc(e.id)}" aria-label="אפשרויות">${icon('more', 22)}</button>` : ''}</div>`;
  };
  return (up.length ? `<div class="events">${up.map(card).join('')}</div>` : `<div class="empty">${icon('cal', 48, 1.4)}<b>אין אירועים קרובים</b><span>הוסיפו ארוחת שישי, יום הולדת או מפגש.</span><button class="btn filled sm" data-a="new-event">אירוע חדש</button></div>`) +
    (bdays.length || up.length ? '' : `<p class="section-f" style="text-align:center">ימי הולדת מופיעים כאן אוטומטית, כשכל אחד מוסיף את התאריך שלו בפרופיל.</p>`) +
    (past.length ? `<div class="section-h">עברו</div><div class="events">${past.slice(0, 10).map(card).join('')}</div>` : '');
}

/* ---------- album ---------- */
function viewAlbum() {
  const imgs = S.data.images;
  return imgs.length ? `<div class="section-h" style="padding-top:4px">${imgs.length} תמונות</div><div class="grid">${imgs.map((im, i) => `<button data-a="view-img" data-v="${esc(im.id)}" aria-label="תמונה ${i + 1}"><img src="${im.thumb}" alt="" loading="lazy"></button>`).join('')}</div>`
    : `<div class="empty">${icon('photo', 48, 1.4)}<b>האלבום ריק</b><span>כל תמונה שמשתפים בפיד מגיעה גם לכאן.</span><button class="btn filled sm" data-a="pick" data-v="album">הוספת תמונות</button></div>`;
}

/* ---------- shared lists ---------- */
function viewLists(g) {
  const lists = S.data.lists;
  if (!lists.length) return `<div class="empty">${icon('list', 48, 1.4)}<b>אין רשימות</b><span>רשימת קניות לשבת, מטלות בבית, מתנות לחג. כל המשפחה רואה ומסמנת.</span><button class="btn filled sm" data-a="new-list">רשימה חדשה</button></div>`;
  return lists.map(l => {
    const items = l.items || [], done = items.filter(x => x.d).length;
    return `<div class="section-h"><span style="font-size:20px;font-weight:700;color:var(--label)">${esc(l.title)}</span><span style="display:flex;align-items:center;gap:4px"><span>${done}/${items.length}</span><button class="icon-btn muted" data-a="list-menu" data-v="${esc(l.id)}" aria-label="אפשרויות לרשימה">${icon('more', 20)}</button></span></div>
    <div class="list lst">${items.map((x, i) => `<div class="row li${x.d ? ' done' : ''}"><button class="check" data-a="item-toggle" data-v="${esc(l.id)}" data-i="${i}" aria-pressed="${!!x.d}" aria-label="סימון">${icon('check', 15, 2.6)}</button><span class="body t" dir="auto">${esc(x.t)}</span>${x.by && x.by !== me() ? `<span class="by">${esc(first(nameOf(S.members[x.by])))}</span>` : ''}<button class="icon-btn muted sm" data-a="item-del" data-v="${esc(l.id)}" data-i="${i}" aria-label="מחיקת פריט">${icon('xmark', 15)}</button></div>`).join('')}
      <form class="add-row" data-list="${esc(l.id)}"><span class="plus">${icon('plus', 16, 2.6)}</span><input id="li-${esc(l.id)}" placeholder="פריט חדש" aria-label="פריט חדש ל${esc(l.title)}" enterkeyhint="done"></form></div>`;
  }).join('') + (lists.some(l => (l.items || []).some(x => x.d)) ? '' : '');
}

/* ---------- school ---------- */
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
function dueLabel(d) {
  const n = daysTo(d);
  return n < 0 ? 'עבר' : n === 0 ? 'היום' : n === 1 ? 'מחר' : n < 7 ? 'יום ' + DAYS[new Date(d + 'T12:00').getDay()] : `בעוד ${n} ימים`;
}
function viewSchool(g) {
  const today = new Date().getDay(), day = S.ttDay !== undefined ? S.ttDay : (today === 6 ? 0 : today);
  const tt = S.data.timetable || {}, lessons = tt[day] || [];
  const hw = (S.data.homework || []).filter(h => daysTo(h.due) >= -1 || !(h.done || []).includes(me()));
  const open = hw.filter(h => !(h.done || []).includes(me())).length;
  const exams = (S.data.exams || []).filter(x => daysTo(x.date) >= 0);
  const f = S.focus, left = f ? Math.max(0, Math.round((f.end - Date.now()) / 1000)) : 0;
  return `<div class="school-top">
    <div class="focus-card">${icon('timer', 26)}<div class="body"><b>זמן ריכוז</b><span id="focus-left">${f ? fmtDur(left) + ' נשארו' : 'בלי טלפון, רק לימוד'}</span></div>
      ${f ? '<button class="btn tinted sm" data-a="focus-stop">עצירה</button>' : '<button class="btn filled sm" data-a="focus" data-v="25">25 דק׳</button><button class="btn tinted sm" data-a="focus" data-v="45">45</button>'}</div>
  </div>
  <div class="section-h"><span>שיעורי בית${open ? ` · ${open} פתוחים` : ''}</span><button class="nb-btn" data-a="hw-add">הוספה</button></div>
  ${hw.length ? `<div class="list lst">${hw.map(h => { const done = (h.done || []).includes(me()), n = daysTo(h.due), cnt = (h.done || []).length; return `<div class="row li${done ? ' done' : ''}"><button class="check" data-a="hw-toggle" data-v="${esc(h.id)}" aria-pressed="${done}" aria-label="סיימתי">${icon('check', 15, 2.6)}</button><span class="body"><span class="t" dir="auto"><b class="subj">${esc(h.subject)}</b> ${esc(h.text)}</span><span class="sub">${dueLabel(h.due)}${cnt ? ` · ${cnt} סיימו` : ''}</span></span>${!done && n <= 1 && n >= 0 ? '<span class="due-hot">דחוף</span>' : ''}${h.by === me() || isOwner(g) ? `<button class="icon-btn muted sm" data-a="school-del" data-v="homework:${esc(h.id)}" aria-label="מחיקה">${icon('xmark', 14)}</button>` : ''}</div>`; }).join('')}</div>`
    : '<div class="list"><button class="row" data-a="hw-add"><span class="body t acc">אין שיעורי בית. הוספה</span></button></div>'}
  <div class="section-h"><span>מבחנים</span><button class="nb-btn" data-a="exam-add">הוספה</button></div>
  ${exams.length ? `<div class="exam-row">${exams.map(x => { const n = daysTo(x.date); return `<div class="exam${n <= 3 ? ' soon' : ''}"><span class="exam-n">${n === 0 ? 'היום' : n}</span><span class="exam-u">${n === 0 ? '' : n === 1 ? 'יום' : 'ימים'}</span><b dir="auto">${esc(x.subject)}</b>${x.topics ? `<span class="exam-t" dir="auto">${esc(x.topics)}</span>` : ''}${x.by === me() || isOwner(g) ? `<button class="exam-x" data-a="school-del" data-v="exams:${esc(x.id)}" aria-label="מחיקה">${icon('xmark', 12)}</button>` : ''}</div>`; }).join('')}</div>`
    : '<div class="list"><button class="row" data-a="exam-add"><span class="body t acc">אין מבחנים קרובים. הוספה</span></button></div>'}
  <div class="section-h"><span>מערכת שעות</span><button class="nb-btn" data-a="tt-edit">עריכה</button></div>
  <div class="seg tt-days">${HEB_DAYS.map((d, i) => `<button data-a="tt-day" data-v="${i}" class="${i === day ? 'on' : ''}" aria-label="${d}">${'אבגדהו'[i]}׳</button>`).join('')}</div>
  <div class="list" style="margin-top:8px">${lessons.length ? lessons.map((l, i) => `<div class="row"><span class="lesson-n">${i + 1}</span><span class="body t" dir="auto">${esc(l)}</span></div>`).join('') : `<button class="row" data-a="tt-edit"><span class="body t acc">${Object.keys(tt).length ? 'אין שיעורים ביום ' + HEB_DAYS[day] : 'הוספת מערכת שעות'}</span></button>`}</div>
  <p class="section-f">כל חברי הקבוצה רואים ועורכים. כל אחד מסמן לעצמו מה סיים.</p>`;
}
function homeworkForm() {
  const tomorrow = iso(new Date(Date.now() + 864e5));
  formSheet({ title: 'שיעורי בית', action: 'הוספה', body: `<div class="list"><div class="field"><input id="hw-subj" placeholder="מקצוע (למשל: מתמטיקה)" maxlength="30" autofocus></div><div class="field"><input id="hw-text" placeholder="מה צריך לעשות" maxlength="200"></div><div class="field"><label for="hw-due">להגשה</label><input id="hw-due" type="date" value="${tomorrow}"></div></div>`,
    onOk: async fs => {
      const subject = fs.querySelector('#hw-subj').value.trim(), text = fs.querySelector('#hw-text').value.trim(), due = fs.querySelector('#hw-due').value;
      if (!subject || !text || !due) { hud('צריך מקצוע, משימה ותאריך', true); return false; }
      await be.addHomework(S.gid, { subject, text, due }); haptic(10);
    } });
}
function examForm() {
  formSheet({ title: 'מבחן', action: 'הוספה', body: `<div class="list"><div class="field"><input id="ex-subj" placeholder="מקצוע" maxlength="30" autofocus></div><div class="field"><input id="ex-top" placeholder="חומר למבחן (לא חובה)" maxlength="120"></div><div class="field"><label for="ex-date">תאריך</label><input id="ex-date" type="date" value="${iso(new Date(Date.now() + 7 * 864e5))}"></div></div>`,
    onOk: async fs => {
      const subject = fs.querySelector('#ex-subj').value.trim(), topics = fs.querySelector('#ex-top').value.trim(), date = fs.querySelector('#ex-date').value;
      if (!subject || !date) { hud('צריך מקצוע ותאריך', true); return false; }
      await be.addExam(S.gid, { subject, topics, date }); haptic(10);
    } });
}
function timetableForm() {
  const tt = S.data.timetable || {};
  formSheet({ title: 'מערכת שעות', action: 'שמירה', tall: true, body: `<p class="section-f" style="padding-top:0">שיעור בכל שורה, לפי הסדר.</p>${HEB_DAYS.map((d, i) => `<div class="section-h">${d}</div><div class="list"><textarea class="tt-in" data-d="${i}" rows="4" dir="auto" placeholder="מתמטיקה&#10;אנגלית&#10;…">${esc((tt[i] || []).join('\n'))}</textarea></div>`).join('')}`,
    onOk: async fs => {
      const days = {};
      fs.querySelectorAll('.tt-in').forEach(t => { const l = t.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12).map(x => x.slice(0, 40)); if (l.length) days[t.dataset.d] = l; });
      await be.saveTimetable(S.gid, days); hud('המערכת נשמרה');
    } });
}
let focusT = null;
function focusStart(min) {
  S.focus = { end: Date.now() + min * 60000, min }; haptic(10);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  clearInterval(focusT); focusT = setInterval(focusTick, 1000); render();
}
function focusStop() { S.focus = null; clearInterval(focusT); render(); }
function focusTick() {
  if (!S.focus) return;
  const left = Math.round((S.focus.end - Date.now()) / 1000), el = $('#focus-left');
  if (left <= 0) { const m = S.focus.min; focusStop(); chime(); notify('זמן הריכוז נגמר', `${m} דקות של לימוד. הגיע זמן הפסקה!`, 'focus'); hud(`כל הכבוד! ${m} דקות של ריכוז`); return; }
  if (el) el.textContent = fmtDur(left) + ' נשארו';
}

/* ---------- group info ---------- */
function inviteLink(g) { return location.origin + location.pathname + '?join=' + g.inviteCode; }
function viewGroupInfo(g) {
  const u = S.user, owner = isOwner(g), ids = g.members.slice().sort((a, b) => (b === g.ownerId) - (a === g.ownerId));
  return bar({ inline: true, back: g.name, titleHtml: 'פרטי הקבוצה' }) +
  `<div class="invite">${gtile(g, 'lg')}<b style="font-size:22px">${esc(g.name)}</b><span class="eyebrow">קוד הזמנה</span><span class="code">${esc(g.inviteCode)}</span>
    <span style="color:var(--label2);font-size:14px;max-width:32ch">שלחו את הקישור לבני המשפחה. הם נכנסים עם Google ומצטרפים.</span>
    <div class="btn-row" style="width:100%"><button class="btn filled" data-a="share-invite">${icon('share', 18)} שליחת הזמנה</button><button class="btn tinted" data-a="copy-invite">${icon('link', 18)} העתקה</button></div></div>
  <div class="section-h">${g.members.length} חברים</div>
  <div class="list av">${ids.map(id => { const m = S.members[id] || { id }; const b = m.birthday ? nextBirthday(m.birthday) : null; return `<${id !== u.id ? 'button' : 'div'} class="row"${id !== u.id ? ` data-a="member" data-v="${esc(id)}"` : ''}>${avatar(m, 40)}<span class="body"><span class="t">${esc(nameOf(m))}${id === u.id ? ' <span style="color:var(--label2)">(את/ה)</span>' : ''}</span>${id === g.ownerId || b ? `<span class="sub">${id === g.ownerId ? 'בעלים' : ''}${id === g.ownerId && b ? ' · ' : ''}${b ? `🎂 ${b.days === 0 ? 'היום!' : `בעוד ${b.days} ימים`}` : ''}</span>` : ''}</span>${id !== u.id ? `<span class="chev">${icon('chev', 16)}</span>` : ''}</${id !== u.id ? 'button' : 'div'}>`; }).join('')}</div>
  <div class="section-h">התראות</div><div class="list"><div class="row">${icon(muted[g.id] ? 'bellOff' : 'bell', 22)}<span class="body t">${muted[g.id] ? 'הקבוצה מושתקת' : 'התראות פעילות'}</span><button class="btn tinted sm" data-a="mute-toggle">${muted[g.id] ? 'ביטול השתקה' : 'השתקה'}</button></div></div>
  <p class="section-f">השתקה עוצרת התראות על הודעות ופוסטים. SOS, ליווי ו"הגעתי בשלום" תמיד מגיעים.</p>
  <div class="section-h">הגעתי בשלום ו-SOS</div><div class="list"><div class="row">${icon('shield', 22)}<span class="body t">${GTYPES[gtype(g)][1]} ${GTYPES[gtype(g)][0]} · ${safetyOn(g) ? 'פעיל' : 'כבוי'}</span>${owner ? `<button class="btn tinted sm" data-a="safety-toggle">${safetyOn(g) ? 'כיבוי' : 'הפעלה'}</button>` : ''}</div></div>
  <p class="section-f">${safetyOn(g) ? 'התראות "הגעתי בשלום" ו-SOS של החברים מגיעות לקבוצה הזו.' : 'התראות "הגעתי בשלום" ו-SOS לא נשלחות לקבוצה הזו.'}${owner ? '' : ' רק המנהל/ת יכול/ה לשנות.'}</p>
  ${owner ? `<div class="section-h">ניהול הקבוצה</div><div class="list"><button class="row blue" data-a="edit-group">עריכת שם, סוג, אייקון וצבע</button><button class="row blue" data-a="new-code">החלפת קוד ההזמנה</button><button class="row red" data-a="delete-group">מחיקת הקבוצה</button></div>
    <p class="section-f">החלפת הקוד מבטלת את הקישור הישן. מי שכבר בקבוצה נשאר.</p>`
  : `<div class="section-h"></div><div class="list"><button class="row red" data-a="leave-group">יציאה מהקבוצה</button></div>`}`;
}

/* ---------- photos ---------- */
function loadFullImages() {
  $$('img[data-iid]').forEach(async el => {
    const iid = el.dataset.iid;
    if (full[iid]) { el.src = full[iid]; return; }
    if (loadedFull.has(iid) || !S.gid) return;
    loadedFull.add(iid);
    try { const d = await be.imageData(S.gid, iid); if (d) { full[iid] = d; $$(`img[data-iid="${CSS.escape(iid)}"]`).forEach(x => x.src = d); } }
    catch (e) { loadedFull.delete(iid); }
  });
}
function renderViewer() {
  const v = S.viewer;
  if (!v) { const o = $('.viewer'); if (o) o.remove(); return; }
  let src, info, idx = -1, list = [], canDel = false;
  if (v.src || v.video) { src = v.src; info = v.info || ''; }
  else {
    list = S.data.images; idx = list.findIndex(x => x.id === v.id);
    if (idx < 0) { S.viewer = null; renderViewer(); return; }
    const im = list[idx], by = S.members[im.by] || { id: im.by };
    src = full[im.id] || im.thumb; info = `${nameOf(by)} · ${dayLabel(im.createdAt)}`; canDel = S.user && (im.by === S.user.id || isOwner(group()));
  }
  let o = $('.viewer');
  if (!o) { o = document.createElement('div'); o.className = 'viewer'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'תמונה'); phoneEl.appendChild(o); }
  o.innerHTML = `<div class="vt"><button class="nb-btn" data-a="viewer-close" style="color:#fff">סגירה</button><span style="font-size:15px;font-weight:600">${idx >= 0 ? `${idx + 1} מתוך ${list.length}` : ''}</span>${canDel ? `<button class="icon-btn" data-a="viewer-del" aria-label="מחיקת התמונה" style="color:#fff">${icon('trash', 22)}</button>` : '<span style="width:44px"></span>'}</div>
    <div class="vimg">${v.video ? `<video src="${v.video}" controls autoplay playsinline></video>` : `<img ${idx >= 0 ? `data-iid="${esc(list[idx].id)}"` : ''} src="${src}" alt="">`}
      ${idx > 0 ? `<button class="vnav" style="right:10px" data-a="viewer-step" data-v="-1" aria-label="הקודמת">${icon('prev', 22)}</button>` : ''}
      ${idx >= 0 && idx < list.length - 1 ? `<button class="vnav" style="left:10px" data-a="viewer-step" data-v="1" aria-label="הבאה">${icon('next', 22)}</button>` : ''}</div>
    <div class="vinfo">${esc(info)}</div>`;
  loadFullImages();
}

/* ---------- comments sheet ---------- */
function openComments(pid) {
  S.comments = { pid, list: [] };
  const fs = formSheet({ title: 'תגובות', tall: true, body: '<div class="cmts" id="cmts"><div class="loading" style="min-height:120px"><div class="spinner"></div></div></div>',
    footer: `<form id="cmt-form" class="cmt-bar"><textarea id="cmt-in" rows="1" placeholder="הוספת תגובה" aria-label="תגובה" dir="auto"></textarea><button class="send" aria-label="שליחת תגובה">${icon('send', 18)}</button></form>`,
    onClose() { if (unsub.comments) unsub.comments(); unsub.comments = null; S.comments = null; } });
  unsub.comments = be.watchComments(S.gid, pid, async list => {
    if (!S.comments) return; S.comments.list = list;
    await loadUsers(list.map(c => c.authorId));
    const box = fs.querySelector('#cmts'), g = group(); if (!box) return;
    box.innerHTML = list.map(c => { const a = S.members[c.authorId] || { id: c.authorId }; return `<div class="cmt">${avatar(a, 32)}<div style="flex:1;min-width:0"><div class="cb"><b>${esc(nameOf(a))}</b><p dir="auto">${linkify(c.text)}</p></div><div class="ct">${ago(c.createdAt)}${c.authorId === S.user.id || isOwner(g) ? ` · <button style="color:var(--red);font-size:12px" data-a="del-comment" data-v="${esc(c.id)}">מחיקה</button>` : ''}</div></div></div>`; }).join('') || '<div class="empty" style="padding:30px 0"><b>עוד אין תגובות</b><span>תהיו הראשונים להגיב.</span></div>';
    const fb = fs.querySelector('.fb'); fb.scrollTop = fb.scrollHeight;
  }, fail);
  setTimeout(() => { const t = fs.querySelector('#cmt-in'); if (t) t.focus({ preventScroll: true }); }, 380);
}

/* ---------- forms in sheets ---------- */
function groupForm(g) {
  let color = g ? g.color : 'orange', emoji = g ? g.emoji : '🏠', type = gtype(g), safety = g ? safetyOn(g) : true, safetyTouched = !!g;
  const fs = formSheet({ title: g ? 'עריכת קבוצה' : 'קבוצה חדשה', action: g ? 'שמירה' : 'יצירה',
    body: `<div style="display:flex;justify-content:center;padding:10px 0 4px" id="gf-prev"></div>
      <div class="section-h">סוג הקבוצה</div><div class="seg gtype" role="group" aria-label="סוג הקבוצה">${Object.entries(GTYPES).map(([k, [l, e]]) => `<button type="button" data-t="${k}" class="${k === type ? 'on' : ''}">${e} ${l}</button>`).join('')}</div>
      <p class="section-f" id="gf-type-f"></p>
      <div class="section-h">הגעתי בשלום ו-SOS</div><div class="seg" role="group" aria-label="הגעתי בשלום ו-SOS"><button type="button" data-s="1">פעיל</button><button type="button" data-s="0">כבוי</button></div>
      <p class="section-f">כשפעיל, "הגעתי בשלום" וקריאות SOS של חברי הקבוצה נשלחים גם לכאן. רק המנהל/ת יכול/ה לשנות.</p>
      <div class="section-h">שם</div><div class="list"><div class="field"><input id="gf-name" maxlength="40" placeholder="למשל: משפחת לוי" value="${esc(g ? g.name : '')}" aria-label="שם הקבוצה" autofocus></div></div>
      <div class="section-h">אייקון</div><div class="emojis">${EMOJIS.map(e => `<button type="button" data-e="${e}" aria-pressed="${e === emoji}" aria-label="אייקון ${e}">${e}</button>`).join('')}</div>
      <div class="section-h">צבע</div><div class="colors">${COLORS.map(c => `<button type="button" data-c="${c}" style="--c:var(--g-${c})" aria-pressed="${c === color}" aria-label="צבע ${c}"></button>`).join('')}</div>`,
    async onOk(f) {
      const name = f.querySelector('#gf-name').value.trim();
      if (!name) { hud('תנו שם לקבוצה', true); f.querySelector('#gf-name').focus(); return false; }
      if (g) { await be.updateGroup(g, { name, emoji, color, type, safety }); hud('נשמר'); }
      else { const gid = await be.createGroup({ name, emoji, color, type, safety }); haptic(15); hud('הקבוצה נוצרה'); setTimeout(() => go('group', { gid }), 300); }
    } });
  const prev = () => { fs.querySelector('#gf-prev').innerHTML = gtile({ emoji, color }, 'lg'); }; prev();
  const syncType = () => {
    fs.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === type));
    fs.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', (x.dataset.s === '1') === safety));
    fs.querySelector('#gf-type-f').textContent = { family: 'פיד, צ׳אט, אירועים, אלבום וכלי "ביחד" למשפחה.', friends: 'כמו משפחה, בלי "הגעתי בשלום" ו-SOS (אלא אם מפעילים).', school: 'לשון "לימודים": שיעורי בית, מבחנים, מערכת שעות וטיימר ריכוז.' }[type];
  };
  fs.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { type = b.dataset.t; if (!safetyTouched) safety = type === 'family'; if (!g) { emoji = GTYPES[type][1]; prev(); fs.querySelectorAll('[data-e]').forEach(x => x.setAttribute('aria-pressed', x.dataset.e === emoji)); } syncType(); });
  fs.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { safety = b.dataset.s === '1'; safetyTouched = true; syncType(); });
  syncType();
  fs.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { emoji = b.dataset.e; fs.querySelectorAll('[data-e]').forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); });
  fs.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; fs.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); });
}
function joinForm(code) {
  let found = null;
  const fs = formSheet({ title: 'הצטרפות לקבוצה', action: 'הצטרפות',
    body: `<div class="section-h">קוד הזמנה</div><div class="list"><div class="field"><input id="jf-code" maxlength="6" placeholder="6 תווים" value="${esc(code || '')}" aria-label="קוד הזמנה" autocapitalize="characters" autocomplete="off" spellcheck="false" dir="ltr" style="text-align:left;letter-spacing:.15em;font-weight:600" autofocus></div></div>
      <p class="section-f">את הקוד מקבלים ממי שפתח את הקבוצה, בפרטי הקבוצה.</p><div id="jf-res" style="margin-top:16px"></div>`,
    async onOk() {
      if (!found) { await look(); if (!found) return false; }
      if (S.groups.some(g => g.id === found.groupId)) { hud('את/ה כבר בקבוצה הזו'); setTimeout(() => go('group', { gid: found.groupId }), 300); return; }
      await be.joinGroup(found.code, found.groupId); haptic(15); hud(`הצטרפת ל${found.groupName}`);
      if (params.has('join')) { params.delete('join'); history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params : '')); }
      setTimeout(() => go('group', { gid: found.groupId }), 500);
    } });
  const inp = fs.querySelector('#jf-code'), res = fs.querySelector('#jf-res');
  async function look() {
    const c = inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); found = null;
    if (c.length !== 6) { res.innerHTML = ''; if (c.length) hud('הקוד צריך להיות 6 תווים', true); return; }
    res.innerHTML = '<div class="loading" style="min-height:60px"><div class="spinner"></div></div>';
    try {
      const inv = await be.findInvite(c);
      if (!inv) { res.innerHTML = '<p class="err" style="text-align:center">לא מצאנו קבוצה עם הקוד הזה. בדקו אותו ונסו שוב.</p>'; return; }
      found = Object.assign({ code: c }, inv);
      res.innerHTML = `<div class="invite">${gtile({ emoji: inv.emoji, color: inv.color }, 'lg')}<b style="font-size:20px">${esc(inv.groupName)}</b><span style="color:var(--label2);font-size:14px">לחצו "הצטרפות" למעלה כדי להיכנס.</span></div>`;
    } catch (e) { res.innerHTML = ''; fail(e); }
  }
  inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); if (inp.value.replace(/[^A-Z0-9]/g, '').length === 6) look(); else { found = null; res.innerHTML = ''; } });
  if (code && code.length === 6) look();
}
function eventForm() {
  const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  formSheet({ title: 'אירוע חדש', action: 'הוספה',
    body: `<div class="section-h">פרטים</div><div class="list">
      <div class="field"><label for="ef-t">מה</label><input id="ef-t" maxlength="60" placeholder="ארוחת שישי" autofocus></div>
      <div class="field"><label for="ef-d">תאריך</label><input id="ef-d" type="date" value="${iso(d)}"></div>
      <div class="field"><label for="ef-h">שעה</label><input id="ef-h" type="time" value="19:30"></div>
      <div class="field"><label for="ef-p">איפה</label><input id="ef-p" maxlength="80" placeholder="אצל סבתא"></div></div>
      <p class="section-f">כל חברי הקבוצה יראו את האירוע ויוכלו לאשר הגעה.</p>`,
    async onOk(f) {
      const t = f.querySelector('#ef-t').value.trim(), date = f.querySelector('#ef-d').value;
      if (!t) { hud('כתבו מה האירוע', true); return false; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { hud('בחרו תאריך', true); return false; }
      await be.addEvent(S.gid, { title: t, date, time: f.querySelector('#ef-h').value || '', place: f.querySelector('#ef-p').value.trim() }); haptic(12); hud('האירוע נוסף');
    } });
}
function listForm() {
  const fs = formSheet({ title: 'רשימה חדשה', action: 'יצירה',
    body: `<div class="section-h">שם הרשימה</div><div class="list"><div class="field"><input id="lf-t" maxlength="40" placeholder="קניות לשבת" autofocus></div></div>
      <div class="section-h">רעיונות</div><div class="chips">${['🛒 קניות לשבת', '🏠 מטלות בבית', '🎁 רשימת מתנות', '🧳 ציוד לטיול', '📚 ציוד לבית הספר'].map(s => `<button type="button" class="chip" data-s="${s}">${s}</button>`).join('')}</div>`,
    async onOk(f) { const t = f.querySelector('#lf-t').value.trim(); if (!t) { hud('תנו שם לרשימה', true); return false; } await be.addList(S.gid, t); haptic(12); hud('הרשימה נוצרה'); } });
  fs.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { fs.querySelector('#lf-t').value = b.dataset.s; });
}

/* ---------- videos ---------- */
const vcache = {};
// A small floating pill while a video is being compressed, uploaded or downloaded
function vprog(text, p) {
  let el = $('#vprog');
  if (!text) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'vprog'; el.className = 'vprog glass'; el.setAttribute('role', 'status'); phoneEl.appendChild(el); }
  el.innerHTML = `${icon('film', 18)}<span>${esc(text)}</span>${p !== undefined ? `<b>${Math.round(p * 100)}%</b>` : '<span class="spinner sm"></span>'}`;
}
function videoThumb(v, ownerId, kind, cls) {
  return `<button class="vthumb ${cls || ''}" data-a="play-video" data-v="${esc(ownerId)}" data-k="${kind}" style="aspect-ratio:${v.w || 16}/${v.h || 9}" aria-label="ניגון סרטון, ${fmtDur(v.dur)}"><img src="${v.thumb}" alt=""><span class="vplay">${icon('play', 24)}</span><span class="vdur">${fmtDur(v.dur)}</span></button>`;
}

/* ---------- emoji picker ---------- */
function emojiSheet(targetId) {
  const recent = (LS.get('nest.recentEmoji') || []).slice(0, 16);
  const sets = (recent.length ? [{ icon: '🕘', name: 'אחרונים', list: recent }] : []).concat(EMOJI_SETS);
  const fs = formSheet({ title: 'אימוג׳י', action: 'סיום',
    body: `<div class="emo-tabs" role="tablist">${sets.map((x, i) => `<button type="button" role="tab" data-et="${i}" aria-selected="${i === 0}" aria-label="${esc(x.name)}">${x.icon}</button>`).join('')}</div>
      <div class="emo-grid" id="emo-grid"></div>`,
    onOk() {} });
  const grid = fs.querySelector('#emo-grid');
  const show = i => { grid.innerHTML = `<div class="emo-h">${esc(sets[i].name)}</div>` + sets[i].list.map(e => `<button type="button" data-em="${e}" aria-label="${e}">${e}</button>`).join(''); fs.querySelectorAll('[data-et]').forEach(t => t.setAttribute('aria-selected', t.dataset.et == i)); };
  show(0);
  fs.querySelectorAll('[data-et]').forEach(t => t.onclick = () => show(+t.dataset.et));
  grid.onclick = e => {
    const b = e.target.closest('[data-em]'); if (!b) return;
    const em = b.dataset.em, el = document.getElementById(targetId);
    haptic(4);
    LS.set('nest.recentEmoji', [em].concat((LS.get('nest.recentEmoji') || []).filter(x => x !== em)).slice(0, 24));
    if (!el) return;
    const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, a) + em + el.value.slice(z);
    el.selectionStart = el.selectionEnd = a + em.length;
    if (el.dataset.draft) S.drafts[el.dataset.draft] = el.value;
    grow(el); updateSend();
  };
}

/* ---------- Together: features made for families ---------- */
function viewTogether(g) {
  if (S.hub === 'capsules') return viewCapsules(g);
  if (S.hub === 'quotes') return viewQuotes(g);
  if (S.hub === 'lists') return viewLists(g);
  const u = S.user, key = iso(new Date()), q = questionFor(key), ans = S.day.answers || {}, mine = ans[u.id];
  const others = Object.entries(ans).filter(([id]) => id !== u.id);
  const now = Date.now(), caps = S.data.capsules, sealed = caps.filter(c => c.openAt > now).length, opened = caps.length - sealed;
  const nextCap = caps.filter(c => c.openAt > now)[0];
  return `<div class="qday">
      <div class="eyebrow">${icon('question', 15)} שאלת היום · ${esc(new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
      <h2 dir="auto">${esc(q)}</h2>
      ${mine ? `<div class="answers">${[[u.id, mine]].concat(others).map(([id, a]) => { const m = S.members[id] || { id }; return `<div class="ans">${avatar(m, 30)}<div><b>${id === u.id ? 'את/ה' : esc(first(nameOf(m)))}</b><p dir="auto">${linkify(a.t)}</p></div></div>`; }).join('')}</div>
        ${others.length ? '' : '<p class="muted">עוד אף אחד לא ענה. התשובות שלהם יופיעו כאן.</p>'}`
      : `<form id="day-form" class="day-form"><textarea id="day-in" data-draft="day" rows="2" placeholder="התשובה שלך…" aria-label="התשובה שלך" dir="auto" maxlength="400"></textarea><button class="btn filled sm">שליחה</button></form>
        <div class="locked-ans">${others.length ? `${icon('lock', 15)} ${others.length} ${others.length === 1 ? 'ענה' : 'ענו'}. התשובות ייחשפו אחרי שתענו.` : 'תהיו הראשונים לענות. כל יום שאלה חדשה לכל המשפחה.'}</div>`}
    </div>
    <div class="hub-grid">
      <button class="hub-tile" data-a="open-hub" data-v="capsules" style="--c:var(--g-purple)"><span class="hub-ic">${icon('capsule', 26)}</span><b>קפסולות זמן</b><span>${caps.length ? `${sealed} נעולות${opened ? ` · ${opened} נפתחו` : ''}` : 'מכתב למשפחה של העתיד'}</span>${nextCap ? `<span class="hub-next">הבאה בעוד ${Math.max(1, Math.ceil((nextCap.openAt - now) / 864e5))} ימים</span>` : ''}</button>
      <button class="hub-tile" data-a="open-hub" data-v="quotes" style="--c:var(--g-pink)"><span class="hub-ic">${icon('quote', 26)}</span><b>מה הילדים אמרו</b><span>${S.data.quotes.length ? `${S.data.quotes.length} ציטוטים` : 'המשפטים שלא רוצים לשכוח'}</span></button>
      <button class="hub-tile" data-a="open-hub" data-v="lists" style="--c:var(--g-teal)"><span class="hub-ic">${icon('list', 26)}</span><b>רשימות</b><span>${S.data.lists.length ? `${S.data.lists.length} רשימות` : 'קניות, מטלות, מתנות'}</span></button>
      ${safetyOn(g) ? '' : '<!--'}<button class="hub-tile" data-a="checkin" style="--c:var(--g-green)"><span class="hub-ic">${icon('shield', 26)}</span><b>הגעתי בשלום</b><span>כולם יידעו בלחיצה אחת</span></button>${safetyOn(g) ? '' : '-->'}
    </div>`;
}

function viewCapsules(g) {
  const u = S.user, now = Date.now(), caps = S.data.capsules;
  const intro = `<p class="hub-intro">כותבים מכתב או שומרים תמונה, ובוחרים מתי לפתוח: בעוד שנה, ליום הולדת 18, לחתונה. עד אז אף אחד לא יכול לקרוא, גם לא מנהל הקבוצה. הנעילה נאכפת בשרת.</p>`;
  if (!caps.length) return intro + `<div class="empty">${icon('capsule', 52, 1.4)}<b>עוד אין קפסולות</b><span>כתבו משהו שהמשפחה תפתח בעתיד.</span><button class="btn filled sm" data-a="new-capsule">קפסולה חדשה</button></div>`;
  return intro + `<div class="caps">${caps.map(c => {
    const open = c.openAt <= now, days = Math.ceil((c.openAt - now) / 864e5), by = S.members[c.by] || { id: c.by };
    const d = new Date(c.openAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    return `<div class="cap${open ? ' open' : ''}"><button class="cap-main" data-a="open-capsule" data-v="${esc(c.id)}">
        <span class="cap-ic">${icon(open ? 'capsule' : 'lock', 26)}</span>
        <span class="body"><b dir="auto">${esc(c.title)}</b><span class="sub">${open ? `נפתחה ב-${d}` : `נפתחת ב-${d} · בעוד ${days > 365 ? `${Math.floor(days / 365)} שנים` : `${days} ימים`}`}</span><span class="sub">מאת ${c.by === u.id ? 'את/ה' : esc(nameOf(by))}${c.to ? ` · ל${esc(c.to)}` : ''}${c.hasImage ? ' · 📷' : ''}</span></span>
        ${open ? `<span class="pill">פתיחה</span>` : ''}</button>
      ${c.by === u.id || isOwner(g) ? `<button class="icon-btn muted" data-a="capsule-menu" data-v="${esc(c.id)}" aria-label="אפשרויות">${icon('more', 20)}</button>` : ''}</div>`;
  }).join('')}</div>`;
}
async function openCapsule(id) {
  const c = S.data.capsules.find(x => x.id === id); if (!c) return;
  const open = c.openAt <= Date.now();
  if (!open && c.by !== me()) { const days = Math.ceil((c.openAt - Date.now()) / 864e5); hud(`🔒 נעולה עוד ${days} ימים`, true); return; }
  let body = null;
  try { body = await be.capsuleBody(S.gid, id); } catch (e) { hud('הקפסולה עדיין נעולה', true); return; }
  if (!body) { hud('לא מצאנו את התוכן', true); return; }
  haptic([20, 40, 20]);
  const by = S.members[c.by] || { id: c.by };
  formSheet({ title: c.title, tall: true,
    body: `<div class="cap-letter">${!open ? `<div class="locked-ans">${icon('lock', 15)} רק את/ה רואה את זה עד ${esc(new Date(c.openAt).toLocaleDateString('he-IL'))}</div>` : `<div class="cap-burst">✨</div>`}
      ${c.to ? `<div class="eyebrow">ל${esc(c.to)}</div>` : ''}
      ${body.text ? `<p dir="auto">${linkify(body.text)}</p>` : ''}
      ${body.image ? `<img src="${body.image}" alt="תמונה מהקפסולה">` : ''}
      <div class="sig">${esc(nameOf(by))} · נכתב ב-${esc(new Date(c.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>` });
}
function capsuleForm() {
  let image = '';
  const plus = (y, m) => { const d = new Date(); d.setFullYear(d.getFullYear() + (y || 0)); d.setMonth(d.getMonth() + (m || 0)); return iso(d); };
  const tomorrow = iso(new Date(Date.now() + 864e5));
  const fs = formSheet({ title: 'קפסולת זמן', action: 'נעילה', tall: true,
    body: `<p class="hub-intro" style="margin-top:4px">מה שתכתבו כאן יינעל עד התאריך שתבחרו. אף אחד לא יוכל לקרוא לפני כן.</p>
      <div class="section-h">כותרת</div><div class="list"><div class="field"><input id="cf-t" maxlength="60" placeholder="לנועה, ליום הולדת 18" autofocus></div></div>
      <div class="section-h">למי (לא חובה)</div><div class="list"><div class="field"><input id="cf-to" maxlength="40" placeholder="נועה / כל המשפחה"></div></div>
      <div class="section-h">המכתב</div><div class="list"><div class="field"><textarea id="cf-x" rows="6" maxlength="5000" placeholder="מה הייתם רוצים להגיד להם בעתיד?" dir="auto" style="padding:10px 0"></textarea></div></div>
      <div class="btn-row" style="margin-top:10px"><button type="button" class="btn tinted sm" id="cf-img">${icon('camera', 18)} הוספת תמונה</button></div><div id="cf-prev"></div>
      <div class="section-h">מתי לפתוח</div>
      <div class="chips">${[['בעוד חודש', 0, 1], ['בעוד שנה', 1, 0], ['בעוד 5 שנים', 5, 0], ['בעוד 10 שנים', 10, 0], ['בעוד 18 שנה', 18, 0]].map(([l, y, m]) => `<button type="button" class="chip" data-d="${plus(y, m)}">${l}</button>`).join('')}</div>
      <div class="list" style="margin-top:10px"><div class="field"><label for="cf-d">תאריך</label><input id="cf-d" type="date" min="${tomorrow}" value="${plus(1, 0)}"></div></div>`,
    async onOk(f) {
      const title = f.querySelector('#cf-t').value.trim(), text = f.querySelector('#cf-x').value.trim(), date = f.querySelector('#cf-d').value;
      if (!title) { hud('תנו כותרת לקפסולה', true); return false; }
      if (!text && !image) { hud('כתבו משהו או הוסיפו תמונה', true); return false; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < tomorrow) { hud('בחרו תאריך עתידי', true); return false; }
      await be.addCapsule(S.gid, { title, to: f.querySelector('#cf-to').value.trim(), text, image, openAt: date });
      haptic([30, 60, 30]); hud('הקפסולה ננעלה 🔒');
    } });
  fs.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { fs.querySelector('#cf-d').value = b.dataset.d; });
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => { const file = inp.files[0]; if (!file) return; try { image = (await chatImage(file)).data; fs.querySelector('#cf-prev').innerHTML = `<div class="prev" style="margin-top:10px"><img src="${image}" alt="התמונה שנבחרה"></div>`; } catch (e) { hud('לא הצלחנו לפתוח את התמונה', true); } };
  fs.querySelector('#cf-img').onclick = () => inp.click();
}

function viewQuotes(g) {
  const u = S.user, qs = S.data.quotes;
  if (!qs.length) return `<p class="hub-intro">הילדים אומרים דברים שאסור לשכוח. שומרים כאן את המשפט, מי אמר ובאיזה גיל, וזה נשאר לתמיד.</p><div class="empty">${icon('quote', 52, 1.4)}<b>עוד אין ציטוטים</b><span>מה הילדים אמרו היום?</span><button class="btn filled sm" data-a="new-quote">ציטוט חדש</button></div>`;
  return `<div class="quotes">${qs.map(q => {
    const laughed = q.laughs.includes(u.id);
    return `<figure class="qcard"><blockquote dir="auto">${esc(q.text)}</blockquote>
      <figcaption>— ${esc(q.who)}${q.age ? `, ${esc(q.age)}` : ''} <span>· ${esc(new Date(q.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></figcaption>
      <div class="qact"><button class="rchip${laughed ? ' on' : ''}" data-a="laugh" data-v="${esc(q.id)}" aria-pressed="${laughed}">😂${q.laughs.length ? ` ${q.laughs.length}` : ''}</button>${q.by === u.id || isOwner(g) ? `<button class="icon-btn muted sm" data-a="quote-menu" data-v="${esc(q.id)}" aria-label="אפשרויות">${icon('more', 18)}</button>` : ''}</div></figure>`;
  }).join('')}</div>`;
}
function quoteForm() {
  const g = group(), names = [...new Set(g.members.map(id => first(nameOf(S.members[id]))).filter(Boolean))];
  formSheet({ title: 'ציטוט חדש', action: 'שמירה',
    body: `<div class="section-h">מה נאמר</div><div class="list"><div class="field"><textarea id="qf-x" rows="3" maxlength="400" placeholder="״אמא, למה הירח הולך אחרינו?״" dir="auto" autofocus style="padding:10px 0"></textarea></div></div>
      <div class="section-h">מי אמר</div><div class="list"><div class="field"><input id="qf-w" maxlength="30" placeholder="השם" list="qf-names"><datalist id="qf-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="field"><label for="qf-a">גיל</label><input id="qf-a" maxlength="20" placeholder="למשל: בן 4"></div></div>`,
    async onOk(f) {
      const text = f.querySelector('#qf-x').value.trim(), who = f.querySelector('#qf-w').value.trim();
      if (!text) { hud('כתבו את הציטוט', true); return false; }
      if (!who) { hud('מי אמר את זה?', true); return false; }
      await be.addQuote(S.gid, { text, who, age: f.querySelector('#qf-a').value.trim() }); haptic(12); hud('נשמר לתמיד ✨');
    } });
}

/* ---------- actions ---------- */
const listOf = id => S.data.lists.find(l => l.id === id);
const A = {
  google: async b => { b.disabled = true; try { await be.signIn(); } catch (e) { if (!(e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request'))) fail(e); } finally { b.disabled = false; } },
  back,
  'root-tab': b => { if (S.tab === b.dataset.v) { scrollTo(0); return; } S.tab = b.dataset.v; if (S.tab === 'profile') refreshMediaPerm(); S.anim = 'fade'; try { history.replaceState({ screen: 'root', tab: S.tab }, ''); } catch (e) {} render(true); },
  gtab: b => {
    if (S.gtab === b.dataset.v && !S.hub) { scrollTo(S.gtab === 'chat' ? scrollMax() : 0); return; }
    S.gtab = b.dataset.v; S.reply = null; S.hub = null; if (S.gtab === 'chat') markGroupChatSeen(); S.anim = 'fade';
    try { history.replaceState(Object.assign({}, history.state, { gtab: S.gtab }), ''); } catch (e) {}
    render(true);
  },
  open: b => go('group', { gid: b.dataset.v }),
  'open-chat': b => go('chat', { cid: b.dataset.v }),
  'group-info': () => go('groupInfo'),
  'new-group': () => groupForm(null),
  'new-chat': () => newChatSheet(),
  join: () => joinForm(''),
  'edit-group': () => groupForm(group()),
  dm: b => startDM(b.dataset.v),
  call: b => { const c = chat(); if (c) startCall(otherOf(c), b.dataset.v); },
  member: async b => {
    const id = b.dataset.v, g = group(), m = S.members[id] || {};
    const acts = [{ label: 'הודעה פרטית', k: 'dm' }, { label: 'שיחה קולית', k: 'audio' }, { label: 'שיחת וידאו', k: 'video' }].concat(isOwner(g) ? [{ label: 'הוצאה מהקבוצה', k: 'remove', destructive: true }] : []);
    const r = await confirmSheet({ title: nameOf(m), actions: acts }); const a = acts[r]; if (!a) return;
    if (a.k === 'dm') startDM(id);
    else if (a.k === 'remove') {
      if (await confirmSheet({ title: `להוציא את ${nameOf(m)}?`, msg: 'הגישה לפיד, לצ׳אט, לאלבום ולרשימות של הקבוצה תיחסם.', actions: [{ label: 'הוצאה מהקבוצה', destructive: true }] }) === 0) {
        try { await be.removeMember(g.id, id); hud(`${first(nameOf(m))} הוצא/ה מהקבוצה`); } catch (e) { fail(e); }
      }
    } else startCall(id, a.k);
  },
  pick: b => { S.pickFor = b.dataset.v; fileEl.accept = 'image/*'; fileEl.multiple = b.dataset.v === 'album'; fileEl.value = ''; fileEl.click(); },
  'pick-video': b => { S.pickFor = b.dataset.v + '-video'; fileEl.accept = 'video/*'; fileEl.multiple = false; fileEl.value = ''; fileEl.click(); },
  'clear-vid': () => { S.vid = null; render(); },
  attach: async () => {
    const acts = [{ label: '📷 תמונה', k: 'pick' }, { label: '🎬 סרטון (עד דקה)', k: 'pick-video' }].concat(S.screen === 'group' && safetyOn(group()) ? [{ label: '✅ הגעתי בשלום', k: 'checkin' }] : []);
    const r = await confirmSheet({ actions: acts }); const a = acts[r]; if (!a) return;
    A[a.k]({ dataset: { v: 'chat' } });
  },
  checkin: async () => {
    if (local()) { try { await send({ kind: 'checkin', text: '' }); } catch (e) {} return; }
    const n = await toAllGroups({ kind: 'checkin', text: '' });
    const ms = mySafety(); if (n && ms && ms.mode === 'escort') { ms.gids.forEach(gid => be.updateSafety(gid, { mode: 'ok', endedAt: Date.now() }).catch(() => {})); stopTracking(); }
    if (n) { haptic(20); hud(n === 1 ? 'כולם בקבוצה יודעים שהגעת בשלום' : `עדכנת ${n} קבוצות שהגעת בשלום`); render(); }
  },
  'sos-help': () => sosSheet(),
  'sos-ack': async b => { const a = S.sosAlert; if (!a) return; try { await be.ackSafety(a.gid, a.by, b.dataset.v); haptic(10); hud(b.dataset.v === 'coming' ? 'עדכנו שאת/ה בדרך' : 'עדכנו שראית'); } catch (e) { fail(e); } },
  'sos-ok': () => safetyEnd(false),
  'escort': () => { if (closeForm) closeForm(); escortForm(); },
  'escort-done': () => safetyEnd(true),
  'escort-more': () => escortMore(),
  'mute-toggle': () => { const g = group(); if (!g) return; if (muted[g.id]) delete muted[g.id]; else muted[g.id] = 1; LS.set('nest.muted', muted); if (S.pushOn) be.savePushPrefs({ muted: Object.keys(muted) }).catch(() => {}); hud(muted[g.id] ? 'הקבוצה הושתקה. SOS עדיין יגיע' : 'ההתראות חזרו'); render(); },
  'notif-hide': () => { LS.set('nest.notifAsked', 1); render(); },
  'sos-contacts': () => sosPhoneContact(),
  'safety-toggle': async () => { const g = group(); if (!g) return; try { await be.updateGroup(g, { safety: !safetyOn(g) }); hud(!safetyOn(g) ? 'הגעתי בשלום ו-SOS הופעלו בקבוצה' : 'הגעתי בשלום ו-SOS כובו בקבוצה'); } catch (e) { fail(e); } },
  'school-add': async () => { const r = await confirmSheet({ actions: [{ label: '📚 שיעורי בית' }, { label: '📝 מבחן' }, { label: '🗓️ עריכת מערכת שעות' }] }); if (r === 0) homeworkForm(); if (r === 1) examForm(); if (r === 2) timetableForm(); },
  'hw-add': () => homeworkForm(),
  'exam-add': () => examForm(),
  'tt-edit': () => timetableForm(),
  'hw-toggle': async b => { const h = S.data.homework.find(x => x.id === b.dataset.v); if (!h) return; haptic(8); try { await be.toggleHomework(S.gid, h); } catch (e) { fail(e); } },
  'school-del': async b => { const [kind, iid] = b.dataset.v.split(':'); const r = await confirmSheet({ actions: [{ label: 'מחיקה', destructive: true }] }); if (r !== 0) return; try { await be.deleteSchoolItem(S.gid, kind, iid); } catch (e) { fail(e); } },
  'tt-day': b => { S.ttDay = +b.dataset.v; render(); },
  'focus': b => focusStart(+b.dataset.v),
  'focus-stop': () => focusStop(),
  'sos-add': () => sosContactForm(),
  'sos-add-member': () => sosMemberPick(),
  'sos-del': async b => { const l = (S.sos || []).filter((_, i) => i !== +b.dataset.v); try { await be.saveSos(l); S.sos = l; render(); } catch (e) { fail(e); } },
  'sos-call': b => { const c = (S.sos || [])[+b.dataset.v]; if (c && c.uid) { if (closeForm) closeForm(); startCall(c.uid, 'audio'); } },
  'sos-alert-call': () => { const a = S.sosAlert; if (!a) return; be.ackSafety(a.gid, a.by, ((safetyDoc(a.gid, a.by) || {}).acks || {})[me()] || 'seen').catch(() => {}); closeSosAlert(); startCall(a.by, 'audio'); },
  'sos-alert-open': () => { const a = S.sosAlert; closeSosAlert(); if (a && a.gid) go('group', { gid: a.gid, gtab: 'chat' }); },
  'sos-alert-close': () => closeSosAlert(),
  'perm-go': async () => { LS.set('nest.permAsked', 1); await A['media-check'](); },
  'perm-hide': () => { LS.set('nest.permAsked', 1); render(); },
  emoji: b => emojiSheet(b.dataset.v),
  'play-video': async b => {
    const kind = b.dataset.k, id = b.dataset.v;
    const owner = kind === 'msg' ? msgById(id) : S.data.posts.find(p => p.id === id);
    const v = owner && owner.video; if (!v) return;
    const sc = kind === 'msg' ? scope() : { t: 'g', id: S.gid };
    try {
      if (!vcache[v.id]) { vprog('טוען סרטון…'); vcache[v.id] = await dataURLToObjectURL(await be.loadVideo(sc, v)); }
      S.viewer = { video: vcache[v.id], info: `${nameOf(S.members[owner.authorId])} · ${dayLabel(owner.createdAt)}` }; renderViewer();
    } catch (e) { hud(e && e.code === 'missing' ? 'הסרטון כבר לא זמין' : 'לא הצלחנו לטעון את הסרטון', true); }
    finally { vprog(null); }
  },
  // Together tab
  'open-hub': b => go('group', { gid: S.gid, gtab: 'together', hub: b.dataset.v }),
  'new-capsule': () => capsuleForm(),
  'open-capsule': b => openCapsule(b.dataset.v),
  'capsule-menu': async b => {
    const c = S.data.capsules.find(x => x.id === b.dataset.v); if (!c) return;
    if (await confirmSheet({ title: c.title, msg: 'הקפסולה והתוכן שבה יימחקו.', actions: [{ label: 'מחיקת הקפסולה', destructive: true }] }) === 0) { try { await be.deleteCapsule(S.gid, c.id); hud('הקפסולה נמחקה'); } catch (e) { fail(e); } }
  },
  'new-quote': () => quoteForm(),
  laugh: async b => { const q = S.data.quotes.find(x => x.id === b.dataset.v); if (!q) return; haptic(); try { await be.laugh(S.gid, q); } catch (e) { fail(e); } },
  'quote-menu': async b => {
    const q = S.data.quotes.find(x => x.id === b.dataset.v); if (!q) return;
    if (await confirmSheet({ title: 'למחוק את הציטוט?', actions: [{ label: 'מחיקה', destructive: true }] }) === 0) { try { await be.deleteQuote(S.gid, q.id); hud('נמחק'); } catch (e) { fail(e); } }
  },
  'clear-img': () => { S.img = null; render(); },
  'poll-toggle': () => { S.poll = S.poll ? null : { options: ['', ''] }; if (S.poll) S.img = null; render(); const t = $('#post-text'); if (t) t.focus({ preventScroll: true }); },
  'poll-add': () => { if (S.poll && S.poll.options.length < 5) { S.poll.options.push(''); render(); const ins = $$('[data-poll]'); ins[ins.length - 1].focus(); } },
  vote: async b => { haptic(); try { await be.vote(S.gid, b.dataset.v, +b.dataset.i); } catch (e) { fail(e); } },
  like: async b => { const p = S.data.posts.find(x => x.id === b.dataset.v); if (!p) return; haptic(); try { await be.toggleLike(S.gid, p); } catch (e) { fail(e); } },
  comments: b => openComments(b.dataset.v),
  'del-comment': async b => { const pid = S.comments && S.comments.pid; if (!pid) return; try { await be.deleteComment(S.gid, pid, b.dataset.v); } catch (e) { fail(e); } },
  'post-menu': async b => {
    const p = S.data.posts.find(x => x.id === b.dataset.v); if (!p) return;
    if (await confirmSheet({ title: 'למחוק את הפוסט?', msg: p.imageId ? 'גם התמונה תימחק מהאלבום.' : '', actions: [{ label: 'מחיקת הפוסט', destructive: true }] }) === 0) { try { await be.deletePost(S.gid, p); hud('הפוסט נמחק'); } catch (e) { fail(e); } }
  },
  'view-img': b => { S.viewer = { id: b.dataset.v }; renderViewer(); },
  'view-src': b => { const m = msgById(b.dataset.v); if (m && m.image) { S.viewer = { src: m.image, info: `${nameOf(S.members[m.authorId])} · ${dayLabel(m.createdAt)}` }; renderViewer(); } },
  'viewer-close': () => { const vv = $('.viewer video'); if (vv) vv.pause(); S.viewer = null; renderViewer(); },
  'viewer-step': b => { const l = S.data.images, i = l.findIndex(x => x.id === S.viewer.id) + +b.dataset.v; if (l[i]) { S.viewer.id = l[i].id; renderViewer(); } },
  'viewer-del': async () => {
    const im = S.data.images.find(x => x.id === S.viewer.id); if (!im) return;
    if (await confirmSheet({ title: 'למחוק את התמונה?', msg: 'היא תימחק מהאלבום של כל הקבוצה.', actions: [{ label: 'מחיקת התמונה', destructive: true }] }) === 0) { try { await be.deleteImage(S.gid, im); hud('התמונה נמחקה'); A['viewer-close'](); } catch (e) { fail(e); } }
  },
  rsvp: async b => { haptic(); try { await be.rsvp(S.gid, b.dataset.v, b.dataset.r); } catch (e) { fail(e); } },
  'new-event': () => eventForm(),
  'event-menu': async b => {
    const e = S.data.events.find(x => x.id === b.dataset.v); if (!e) return;
    if (await confirmSheet({ title: e.title, actions: [{ label: 'מחיקת האירוע', destructive: true }] }) === 0) { try { await be.deleteEvent(S.gid, e.id); hud('האירוע נמחק'); } catch (x) { fail(x); } }
  },
  'new-list': () => listForm(),
  'item-toggle': async b => { const l = listOf(b.dataset.v); if (!l) return; const items = l.items.map(x => Object.assign({}, x)); items[+b.dataset.i].d = !items[+b.dataset.i].d; haptic(); try { await be.saveList(S.gid, l.id, items); } catch (e) { fail(e); } },
  'item-del': async b => { const l = listOf(b.dataset.v); if (!l) return; const items = l.items.filter((x, i) => i !== +b.dataset.i); try { await be.saveList(S.gid, l.id, items); } catch (e) { fail(e); } },
  'list-menu': async b => {
    const l = listOf(b.dataset.v); if (!l) return;
    const acts = [{ label: 'ניקוי פריטים שסומנו', k: 'clear' }, { label: 'מחיקת הרשימה', k: 'del', destructive: true }];
    const r = await confirmSheet({ title: l.title, actions: acts }); const a = acts[r]; if (!a) return;
    try { if (a.k === 'clear') { await be.saveList(S.gid, l.id, l.items.filter(x => !x.d)); hud('נוקה'); } else { await be.deleteList(S.gid, l.id); hud('הרשימה נמחקה'); } } catch (e) { fail(e); }
  },
  'share-invite': async () => {
    const g = group(), url = inviteLink(g), text = `הצטרפו לקבוצה "${g.name}" ב-Nest. קוד ההזמנה: ${g.inviteCode}`;
    if (navigator.share) { try { await navigator.share({ title: 'הזמנה ל-Nest', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + '\n' + url);
  },
  'copy-invite': () => copyText(inviteLink(group())),
  'new-code': async () => { const g = group(); if (await confirmSheet({ title: 'להחליף את קוד ההזמנה?', msg: 'הקישור הישן יפסיק לעבוד.', actions: [{ label: 'החלפת הקוד' }] }) === 0) { try { await be.newInviteCode(g); hud('קוד חדש נוצר'); } catch (e) { fail(e); } } },
  'delete-group': async () => { const g = group(); if (await confirmSheet({ title: `למחוק את "${g.name}"?`, msg: 'הקבוצה תיעלם לכל החברים, עם הפיד, הצ׳אט, האירועים, האלבום והרשימות. אי אפשר לבטל.', actions: [{ label: 'מחיקת הקבוצה', destructive: true }] }) === 0) { try { await be.deleteGroup(g); go('root'); hud('הקבוצה נמחקה'); } catch (e) { fail(e); } } },
  'leave-group': async () => { const g = group(); if (await confirmSheet({ title: `לצאת מ"${g.name}"?`, msg: 'כדי לחזור תצטרכו קוד הזמנה חדש.', actions: [{ label: 'יציאה מהקבוצה', destructive: true }] }) === 0) { try { await be.leaveGroup(g.id); go('root'); hud('יצאת מהקבוצה'); } catch (e) { fail(e); } } },
  'sign-out': async () => { if (await confirmSheet({ title: 'להתנתק?', msg: be.mode === 'live' ? 'הקבוצות והשיחות שלך נשארות. אפשר להיכנס שוב עם Google.' : 'בתצוגה המקדימה הכול יתחיל מחדש.', actions: [{ label: 'התנתקות' }] }) === 0) { stopAll(); await be.signOut(); } },
  'media-check': async () => {
    if (inAppBrowser()) { showMediaHelp(null, 'video'); return; }
    let mic = false;
    try { const a = await navigator.mediaDevices.getUserMedia({ audio: true }); a.getTracks().forEach(t => t.stop()); mic = true; }
    catch (e) { showMediaHelp(e, 'audio'); }
    if (mic) {
      try { const v = await navigator.mediaDevices.getUserMedia({ video: true }); v.getTracks().forEach(t => t.stop()); hud('המיקרופון והמצלמה מאושרים'); }
      catch (e) { hud('המיקרופון מאושר, אפשר להתקשר. המצלמה לא אושרה', true); }
    }
    await refreshMediaPerm(); render();
  },
  'copy-link': () => copyText(location.origin + location.pathname),
  'media-fix': () => showMediaHelp({ name: 'NotAllowedError' }, 'video'),
  'push-test': async () => { if (await pushOut({ test: true, title: 'Nest', text: 'בדיקה: ההתראות עובדות גם כש-Nest סגור 🎉' })) hud('התראת בדיקה נשלחה. היא תגיע תוך כמה שניות'); else hud('השליחה לא הצליחה. נסו שוב', true); },
  notif: async () => { LS.set('nest.notifAsked', 1); setTimeout(setupPush, 500); try { const p = await Notification.requestPermission(); hud(p === 'granted' ? 'ההתראות הופעלו' : 'ההתראות לא הופעלו', p !== 'granted'); } catch (e) {} render(); },
  install: async () => {
    if (installEvt) { const e = installEvt; e.prompt(); try { const c = await e.userChoice; if (c && c.outcome === 'accepted') LS.set('nest.noInstall', 1); } catch (x) {} installEvt = null; render(); return; }
    const h = installHelp();
    const r = await confirmSheet({ title: h.title, msg: h.msg, actions: [{ label: 'העתקת הקישור' }, { label: 'הבנתי' }] });
    if (r === 0) copyText(h.link);
  },
  'install-hide': () => { LS.set('nest.noInstall', 1); render(); },
  // chat
  react: async b => { const m = msgById(b.dataset.v); if (!m) return; const mine = (m.reactions || {})[me()]; haptic(); try { await be.react(scope(), m.id, mine === b.dataset.e ? null : b.dataset.e); } catch (e) { fail(e); } },
  jump: b => { const el = document.getElementById('m-' + b.dataset.v); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } },
  'reply-cancel': () => { S.reply = null; render(); },
  play: b => playAudio(b.dataset.v),
  'rec-start': () => recStart(),
  'rec-send': () => recStop(),
  'rec-cancel': () => recCancel(),
  // calls
  'sos-person': b => startCall(b.dataset.v, 'audio'),
  'call-accept': async () => { const c = S.incoming; if (!c) return; S.incoming = null; ring(false); renderIncoming(); if (S.mediaPerm && S.mediaPerm.mic === 'prompt') hud('לחצו "אפשר" כשהדפדפן שואל על המיקרופון'); try { await calls.accept(c); } catch (e) { fail(e); } },
  'call-decline': () => { const c = S.incoming; if (!c) return; S.incoming = null; ring(false); renderIncoming(); calls.decline(c); },
  'call-end': () => calls && calls.hangup(),
  'call-mute': () => calls && calls.toggleMute(),
  'call-cam': () => calls && calls.toggleCam(),
  'call-flip': () => calls && calls.flip()
};
const F = {
  'day-form': async () => {
    const el = $('#day-in'), t = el.value.trim(); if (!t) { el.focus(); return; }
    try { await be.answerDay(S.gid, iso(new Date()), t); S.drafts.day = ''; haptic(12); hud('התשובות של כולם נחשפו'); } catch (e) { fail(e); }
  },
  'local-login': async () => { const n = $('#local-name').value.trim(); if (!n) { $('#local-name').focus(); hud('כתבו את השם שלכם', true); return; } await be.signIn(n); },
  'post-form': async () => {
    const text = (S.drafts.post || '').trim();
    let poll = null;
    if (S.poll) {
      poll = S.poll.options.map(o => o.trim()).filter(Boolean);
      if (!text) { hud('כתבו את השאלה של הסקר', true); $('#post-text').focus(); return; }
      if (poll.length < 2) { hud('צריך לפחות שתי אפשרויות', true); return; }
    } else if (!text && !S.img && !S.vid) return;
    S.busy = true; render();
    if (S.vid) vprog('מעלה את הסרטון…');
    try { await be.addPost(S.gid, { text, image: S.img, video: S.vid, poll }); S.drafts.post = ''; S.img = null; S.vid = null; S.poll = null; haptic(12); hud(poll ? 'הסקר פורסם' : 'פורסם'); }
    catch (e) { fail(e); }
    finally { S.busy = false; vprog(null); render(); }
  },
  'chat-form': async () => {
    const k = draftKey(), t = (S.drafts[k] || '').trim(); if (!t) return;
    S.drafts[k] = ''; const el = $('#chat-in'); if (el) { el.value = ''; grow(el); }
    updateSend();
    try { await send({ text: t }); } catch (e) { S.drafts[k] = t; render(); }
  },
  'cmt-form': async f => { const el = f.querySelector('#cmt-in'), t = el.value.trim(); if (!t || !S.comments) return; el.value = ''; grow(el); try { await be.addComment(S.gid, S.comments.pid, t); } catch (e) { el.value = t; fail(e); } },
  'name-form': async () => {
    const n = $('#pf-name').value.trim(); if (!n) { hud('השם לא יכול להיות ריק', true); return; }
    try { await be.saveProfile({ name: n }); S.user.name = n; S.members[S.user.id] = Object.assign({}, S.members[S.user.id], { name: n }); hud('השם נשמר'); render(); } catch (e) { fail(e); }
  },
  'bday-form': async () => {
    const v = $('#pf-bday').value;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { hud('בחרו תאריך', true); return; }
    try { await be.saveProfile({ birthday: v }); S.user.birthday = v; S.members[S.user.id] = Object.assign({}, S.members[S.user.id], { birthday: v }); hud(v ? 'יום ההולדת נשמר 🎂' : 'יום ההולדת הוסר'); render(); } catch (e) { fail(e); }
  }
};

document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) { e.preventDefault(); A[b.dataset.a](b); } });
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.list) { // add an item to a shared list
    const inp = f.querySelector('input'), t = inp.value.trim(), l = listOf(f.dataset.list); if (!t || !l) return;
    inp.value = '';
    try { await be.saveList(S.gid, l.id, (l.items || []).concat({ id: Math.random().toString(36).slice(2, 9), t, d: false, by: me() })); const n = document.getElementById(inp.id); if (n) n.focus({ preventScroll: true }); } catch (x) { inp.value = t; fail(x); }
    return;
  }
  const fn = F[f.id]; if (fn) fn(f);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.draft) { S.drafts[el.dataset.draft] = el.value; updateSend(); if (el.id === 'chat-in' && el.value) sentTyping(); }
  if (el.dataset && el.dataset.poll !== undefined && S.poll) S.poll.options[+el.dataset.poll] = el.value;
  if (el.tagName === 'TEXTAREA') grow(el);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Enter' && !e.shiftKey && t && (t.id === 'chat-in' || t.id === 'cmt-in') && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); t.form.requestSubmit(); }
  if (e.key === 'Escape') { if (S.viewer) A['viewer-close'](); else if (closeForm) closeForm(); else { const c = sheetEl.querySelector('.cancel'); if (c) c.click(); } }
  if (S.viewer && !S.viewer.src && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) A['viewer-step']({ dataset: { v: e.key === 'ArrowLeft' ? '1' : '-1' } });
});
fileEl.addEventListener('change', async () => {
  if (S.pickFor && S.pickFor.endsWith('-video')) {
    const file = fileEl.files[0], target = S.pickFor.replace('-video', ''); if (!file) return;
    try {
      vprog('מעבד סרטון…', 0);
      const vid = await prepVideo(file, p => vprog('מעבד סרטון…', p));
      if (target === 'post') { S.vid = vid; S.img = null; S.poll = null; vprog(null); render(); return; }
      vprog('שולח סרטון…');
      const k = draftKey(), cap = (S.drafts[k] || '').trim(); S.drafts[k] = '';
      await send(Object.assign({ video: vid }, cap ? { text: cap } : {}));
    } catch (e) {
      const c = e && e.code;
      if (c === 'long') hud(`אפשר לשלוח סרטון של עד ${VIDEO_MAX_SEC} שניות`, true);
      else if (c === 'unsupported' || c === 'decode' || c === 'type') hud('הדפדפן הזה לא מצליח לעבד את הסרטון', true);
      else if (c !== 'local') fail(e);
    } finally { vprog(null); }
    return;
  }
  const files = [...fileEl.files].filter(f => f.type.startsWith('image/')); if (!files.length) return;
  if (S.pickFor === 'post') { try { S.img = await prepImage(files[0]); render(); const t = $('#post-text'); if (t) t.focus({ preventScroll: true }); } catch (e) { hud('לא הצלחנו לפתוח את התמונה', true); } return; }
  if (S.pickFor === 'chat') {
    try {
      const im = await chatImage(files[0]), k = draftKey(), cap = (S.drafts[k] || '').trim();
      S.drafts[k] = '';
      await send(Object.assign({ image: im.data, w: im.w, h: im.h }, cap ? { text: cap } : {}));
    } catch (e) { if (!(e && e.code)) hud('לא הצלחנו לשלוח את התמונה', true); }
    return;
  }
  hud(files.length === 1 ? 'מעלה תמונה…' : `מעלה ${files.length} תמונות…`);
  try { const imgs = []; for (const f of files) imgs.push(await prepImage(f)); await be.addPhotos(S.gid, imgs); haptic(12); hud(imgs.length === 1 ? 'התמונה נוספה' : `${imgs.length} תמונות נוספו`); } catch (e) { fail(e); }
});

function clock() { const el = $('#sb-time'); if (el) { const d = new Date(); el.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); } }
clock(); setInterval(clock, 30000);
setInterval(() => { if (!typing() && !closeForm && !S.viewer && !S.rec && S.screen !== 'chat') softRender(); }, 60000);

/* ---------- boot ---------- */
async function boot() {
  render(true);
  const live = FIREBASE_CONFIG && onSite;
  try { be = live ? await LiveBackend(FIREBASE_CONFIG) : LocalBackend(); }
  catch (e) { console.error(e); be = LocalBackend(); hud('לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.', true); }
  be.onAuth(u => {
    S.booting = false; S.user = u;
    if (!u) { stopAll(); S.screen = 'root'; S.tab = 'groups'; S.anim = 'fade'; render(true); return; }
    S.members[u.id] = u; watchAll(); setupPush(); S.anim = 'fade'; render(true);
    if (S.joinCode) { const c = S.joinCode; S.joinCode = ''; setTimeout(() => joinForm(c), 400); }
  });
}
try { history.replaceState({ screen: 'root', tab: 'groups' }, ''); } catch (e) {}
boot();
