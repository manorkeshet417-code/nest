// Nest push sender. Runs free on Google Apps Script, as the Firebase project owner.
//
// The app POSTs { idToken, gid | cid, to?, title, body, tag, urgent, safe }.
// The group/chat is read WITH THE CALLER'S OWN Firebase ID token, so Firestore's security rules
// decide whether the caller is a member; only then do the other members' devices get a push
// through Firebase Cloud Messaging (free). Nothing here stores messages.
//
// It also watches "walk me home" escorts: if the deadline passes without "הגעתי",
// the family is pushed even when the walker's phone is off or the app is closed.

const PROJECT = 'nest-family-d163e';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/';
const LATE_WINDOW = 3 * 3600 * 1000;

function doGet() { return out({ ok: true, service: 'nest-push' }); }
function doPost(e) {
  try {
    const q = JSON.parse(e.postData.contents);
    if (q.action === 'escort') return out(registerEscort(q));
    return out(sendFromClient(q));
  } catch (err) { console.error(err); return out({ ok: false, error: String(err) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// The token's signature is checked by Firestore on the first read; its payload names the caller.
function uidOf(idToken) {
  let p = String(idToken).split('.')[1] || '';
  p += '==='.slice((p.length + 3) % 4);
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString()).user_id;
}
function get(path, idToken) {
  const headers = idToken ? { Authorization: 'Bearer ' + idToken }
    : { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT };
  const r = UrlFetchApp.fetch(FS + path, { headers: headers, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { if (r.getResponseCode() !== 404) console.warn(path, r.getResponseCode(), r.getContentText().slice(0, 300)); return null; }
  return JSON.parse(r.getContentText()).fields || {};
}
const strs = f => ((f && f.arrayValue && f.arrayValue.values) || []).map(v => v.stringValue).filter(Boolean);
const str = f => (f && f.stringValue) || '';
const num = f => f ? Number(f.integerValue || f.doubleValue || 0) : 0;
const clip = (s, n) => String(s || '').slice(0, n);

function sendFromClient(q) {
  const me = uidOf(q.idToken);
  const msg = { title: clip(q.title || 'Nest', 80), body: clip(q.body, 180), tag: clip(q.tag, 80), urgent: q.urgent ? '1' : '', url: clip(q.url, 200) };
  if (q.test) { // "send me a test" from the profile: the read proves the token is valid
    msg.tag = 'test';
    if (!get('users/' + me, q.idToken)) return { ok: false, error: 'denied' };
    return { ok: true, sent: pushTo([me], msg, q.idToken, true) };
  }
  const path = q.gid ? 'groups/' + q.gid : q.cid ? 'chats/' + q.cid : '';
  if (!path) return { ok: false, error: 'no target' };
  const d = get(path, q.idToken); // refused unless the caller is a member
  if (!d) return { ok: false, error: 'denied' };
  const members = strs(d.members);
  if (members.indexOf(me) < 0) return { ok: false, error: 'denied' };
  let targets = members.filter(u => u !== me);
  if (q.to) targets = targets.filter(u => u === q.to);
  return { ok: true, sent: pushTo(targets, msg, q.idToken, q.urgent || q.safe, q.gid) };
}

// Sends to every registered device of these people; a muted group is skipped unless it's a safety alert
function pushTo(uids, msg, idToken, ignoreMute, gid) {
  const reqs = [];
  const auth = 'Bearer ' + ScriptApp.getOAuthToken();
  uids.forEach(u => {
    const p = get('push/' + u, idToken); if (!p) return;
    if (!ignoreMute && gid && strs(p.muted).indexOf(gid) >= 0) return;
    strs(p.tokens).slice(-5).forEach(t => reqs.push({
      url: 'https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: auth, 'x-goog-user-project': PROJECT },
      payload: JSON.stringify({ message: { token: t, data: msg, webpush: { headers: { Urgency: 'high', TTL: msg.urgent ? '3600' : '86400' } } } })
    }));
  });
  if (!reqs.length) return 0;
  let n = 0;
  UrlFetchApp.fetchAll(reqs).forEach(r => { if (r.getResponseCode() === 200) n++; else console.warn('fcm', r.getResponseCode(), r.getContentText().slice(0, 300)); });
  return n;
}

/* ---------- escorts ---------- */
function registerEscort(q) {
  const me = uidOf(q.idToken), lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const pend = JSON.parse(PropertiesService.getScriptProperties().getProperty('escorts') || '{}');
    (q.gids || []).slice(0, 20).forEach(gid => {
      const s = get('groups/' + gid + '/safety/' + me, q.idToken);
      if (s && str(s.mode) === 'escort') pend[gid + '/' + me] = num(s.until);
    });
    PropertiesService.getScriptProperties().setProperty('escorts', JSON.stringify(pend));
  } finally { lock.releaseLock(); }
  ensureTrigger();
  return { ok: true };
}
// Every minute: anyone whose escort deadline passed without "הגעתי"?
function checkEscorts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties(), pend = JSON.parse(props.getProperty('escorts') || '{}'), now = Date.now();
    let changed = false;
    Object.keys(pend).forEach(k => {
      if (now < pend[k]) return;
      const gid = k.split('/')[0], uid = k.split('/')[1];
      const s = get('groups/' + gid + '/safety/' + uid);
      const mode = s ? str(s.mode) : '', until = s ? num(s.until) : 0;
      changed = true;
      if (mode === 'escort' && until > now) { pend[k] = until; return; } // they added time
      delete pend[k];
      if (mode !== 'escort' || now - until > LATE_WINDOW) return;   // arrived, or too old
      const g = get('groups/' + gid), u = get('users/' + uid);
      if (!g) return;
      const name = (u && str(u.name)) || 'מישהו', dest = str(s.dest);
      pushTo(strs(g.members).filter(x => x !== uid), {
        title: '⚠️ ' + name + ' עוד לא הגיע/ה', urgent: '1', tag: 'safety:' + uid, url: '',
        body: 'הזמן שנקבע לדרך' + (dest ? ' (' + dest + ')' : '') + ' נגמר ואין אישור הגעה. פתחו את Nest לראות את המיקום ולהתקשר.'
      }, null, true);
    });
    if (changed) props.setProperty('escorts', JSON.stringify(pend));
  } finally { lock.releaseLock(); }
}
function ensureTrigger() {
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'checkEscorts'))
    ScriptApp.newTrigger('checkEscorts').timeBased().everyMinutes(1).create();
}
// Run once from the editor after the first deployment (asks for the permissions above)
function setup() { ensureTrigger(); console.log('ok: owner token ready, escort checker scheduled'); }
