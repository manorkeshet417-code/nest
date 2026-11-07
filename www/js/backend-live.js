// Firebase backend: Google sign-in + Firestore. firestore.rules enforces who may read/write what.
import { newCode, chatId, splitChunks } from './util.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';

export async function LiveBackend(cfg) {
  const [A, Au, F] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const fb = A.initializeApp(cfg), auth = Au.getAuth(fb);
  let db;
  try { db = F.initializeFirestore(fb, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.getFirestore(fb); }
  const { doc, collection, query, where, orderBy, limit, onSnapshot, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch, deleteField } = F;
  const ms = v => v && v.toMillis ? v.toMillis() : (typeof v === 'number' ? v : Date.now());
  const read = d => {
    const x = d.data({ serverTimestamps: 'estimate' }); x.id = d.id;
    for (const k of ['createdAt', 'lastAt', 'updatedAt', 'openAt']) if (k in x) x[k] = ms(x[k]);
    return x;
  };
  const ucache = {};
  let me = null;
  const preview = m => m.kind === 'checkin' ? '✅ הגיע/ה בשלום' : m.text || (m.image ? '📷 תמונה' : m.video ? '🎬 סרטון' : m.audio ? '🎤 הודעה קולית' : m.kind === 'call' ? '📞 שיחה' : '');
  const touch = (gid, text) => updateDoc(doc(db, 'groups', gid), { lastMessage: text.slice(0, 90), lastAt: serverTimestamp(), lastBy: me.id }).catch(() => {});
  const order = { posts: ['createdAt', 'desc', 60], events: ['date', 'asc', 100], images: ['createdAt', 'desc', 150], lists: ['createdAt', 'asc', 50], capsules: ['openAt', 'asc', 100], quotes: ['createdAt', 'desc', 200] };
  const blobCol = s => s.t === 'g' ? collection(db, 'groups', s.id, 'blobs') : collection(db, 'chats', s.id, 'blobs');
  // videos: base64 split across documents (each under Firestore's 1 MB limit)
  async function uploadVideo(s, v) {
    const id = doc(blobCol(s)).id, parts = splitChunks(v.data);
    for (let i = 0; i < parts.length; i++) await setDoc(doc(blobCol(s), id + '_' + i), { by: me.id, i, data: parts[i] });
    return { id, chunks: parts.length, thumb: v.thumb, dur: v.dur, w: v.w, h: v.h, mime: v.mime };
  }
  function dropVideo(s, v) { if (!v) return; const b = writeBatch(db); for (let i = 0; i < v.chunks; i++) b.delete(doc(blobCol(s), v.id + '_' + i)); b.commit().catch(() => {}); }
  const msgCol = s => s.t === 'g' ? collection(db, 'groups', s.id, 'messages') : collection(db, 'chats', s.id, 'messages');
  const scopeDoc = s => s.t === 'g' ? doc(db, 'groups', s.id) : doc(db, 'chats', s.id);

  return {
    mode: 'live',
    rtc: { db, F, me: () => me && me.id },

    onAuth(cb) {
      return Au.onAuthStateChanged(auth, async u => {
        if (!u) { me = null; cb(null); return; }
        const ref = doc(db, 'users', u.uid);
        let saved = null;
        try { const s = await getDoc(ref); if (s.exists()) saved = s.data(); } catch (e) {}
        const data = { name: (saved && saved.name) || u.displayName || '', photo: u.photoURL || '' };
        try { await setDoc(ref, data, { merge: true }); } catch (e) {}
        me = Object.assign({ id: u.uid, birthday: (saved && saved.birthday) || '' }, data);
        ucache[u.uid] = me;
        cb(Object.assign({}, me));
      });
    },
    async signIn() {
      const p = new Au.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await Au.signInWithPopup(auth, p); }
      catch (e) { if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await Au.signInWithRedirect(auth, p); else throw e; }
    },
    signOut() { return Au.signOut(auth); },
    async saveProfile(o) { await setDoc(doc(db, 'users', me.id), o, { merge: true }); Object.assign(me, o); ucache[me.id] = me; },
    async users(ids, fresh) {
      await Promise.all(ids.filter(i => fresh || !ucache[i]).map(async i => {
        try { const s = await getDoc(doc(db, 'users', i)); ucache[i] = s.exists() ? Object.assign({ id: i }, s.data()) : { id: i, name: '' }; }
        catch (e) { ucache[i] = ucache[i] || { id: i, name: '' }; }
      }));
      const o = {}; ids.forEach(i => o[i] = ucache[i]); return o;
    },

    /* groups */
    watchGroups(cb, err) { return onSnapshot(query(collection(db, 'groups'), where('members', 'array-contains', me.id)), s => cb(s.docs.map(read)), err); },
    async createGroup(o) {
      const ref = doc(collection(db, 'groups')), code = newCode(), b = writeBatch(db);
      b.set(ref, { name: o.name, emoji: o.emoji, color: o.color, ownerId: me.id, members: [me.id], inviteCode: code, createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastMessage: '', lastBy: me.id });
      b.set(doc(db, 'invites', code), { groupId: ref.id, groupName: o.name, emoji: o.emoji, color: o.color });
      await b.commit(); return ref.id;
    },
    async findInvite(code) { const s = await getDoc(doc(db, 'invites', code)); return s.exists() ? s.data() : null; },
    joinGroup(code, gid) { return updateDoc(doc(db, 'groups', gid), { members: arrayUnion(me.id), joinCode: code }); },
    async updateGroup(g, p) {
      const b = writeBatch(db); b.update(doc(db, 'groups', g.id), p);
      const ip = {}; if ('name' in p) ip.groupName = p.name; if ('emoji' in p) ip.emoji = p.emoji; if ('color' in p) ip.color = p.color;
      if (Object.keys(ip).length) b.update(doc(db, 'invites', g.inviteCode), ip);
      await b.commit();
    },
    async newInviteCode(g) {
      const code = newCode(), b = writeBatch(db);
      b.delete(doc(db, 'invites', g.inviteCode));
      b.set(doc(db, 'invites', code), { groupId: g.id, groupName: g.name, emoji: g.emoji, color: g.color });
      b.update(doc(db, 'groups', g.id), { inviteCode: code });
      await b.commit(); return code;
    },
    removeMember(gid, u) { return updateDoc(doc(db, 'groups', gid), { members: arrayRemove(u) }); },
    leaveGroup(gid) { return updateDoc(doc(db, 'groups', gid), { members: arrayRemove(me.id) }); },
    async deleteGroup(g) { const b = writeBatch(db); b.delete(doc(db, 'invites', g.inviteCode)); b.delete(doc(db, 'groups', g.id)); await b.commit(); },

    /* group content */
    watch(gid, kind, cb, err) { const o = order[kind]; return onSnapshot(query(collection(db, 'groups', gid, kind), orderBy(o[0], o[1]), limit(o[2])), s => cb(s.docs.map(read)), err); },
    watchComments(gid, pid, cb, err) { return onSnapshot(query(collection(db, 'groups', gid, 'posts', pid, 'comments'), orderBy('createdAt', 'asc'), limit(300)), s => cb(s.docs.map(read)), err); },
    async addPhoto(gid, img) {
      const ref = doc(collection(db, 'groups', gid, 'images')), b = writeBatch(db);
      b.set(doc(db, 'groups', gid, 'imageData', ref.id), { by: me.id, data: img.full.data });
      b.set(ref, { by: me.id, thumb: img.thumb.data, w: img.full.w, h: img.full.h, createdAt: serverTimestamp() });
      await b.commit(); return ref.id;
    },
    async addPhotos(gid, imgs) { for (const im of imgs) await this.addPhoto(gid, im); touch(gid, `${me.name} הוסיף/ה ${imgs.length === 1 ? 'תמונה' : imgs.length + ' תמונות'} לאלבום`); },
    async addPost(gid, o) {
      const imageId = o.image ? await this.addPhoto(gid, o.image) : '';
      const data = { authorId: me.id, text: o.text || '', imageId, createdAt: serverTimestamp(), likes: [], commentCount: 0 };
      if (o.video) data.video = await uploadVideo({ t: 'g', id: gid }, o.video);
      if (o.poll) { data.poll = { options: o.poll }; data.votes = {}; }
      await addDoc(collection(db, 'groups', gid, 'posts'), data);
      touch(gid, o.poll ? `${me.name} פתח/ה סקר: ${o.text}` : o.text ? `${me.name}: ${o.text}` : o.video ? `${me.name} שיתף/ה סרטון` : `${me.name} שיתף/ה תמונה`);
    },
    toggleLike(gid, p) { return updateDoc(doc(db, 'groups', gid, 'posts', p.id), { likes: p.likes.includes(me.id) ? arrayRemove(me.id) : arrayUnion(me.id) }); },
    vote(gid, pid, idx) { return updateDoc(doc(db, 'groups', gid, 'posts', pid), { ['votes.' + me.id]: idx }); },
    async deletePost(gid, p) {
      const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'posts', p.id));
      if (p.imageId) { b.delete(doc(db, 'groups', gid, 'images', p.imageId)); b.delete(doc(db, 'groups', gid, 'imageData', p.imageId)); }
      await b.commit();
      dropVideo({ t: 'g', id: gid }, p.video);
    },
    async addComment(gid, pid, text) {
      const b = writeBatch(db);
      b.set(doc(collection(db, 'groups', gid, 'posts', pid, 'comments')), { authorId: me.id, text, createdAt: serverTimestamp() });
      b.update(doc(db, 'groups', gid, 'posts', pid), { commentCount: increment(1) });
      await b.commit();
    },
    async deleteComment(gid, pid, cid) {
      const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'posts', pid, 'comments', cid));
      b.update(doc(db, 'groups', gid, 'posts', pid), { commentCount: increment(-1) }); await b.commit();
    },
    async addEvent(gid, o) { await addDoc(collection(db, 'groups', gid, 'events'), Object.assign({ createdBy: me.id, rsvp: { [me.id]: 'yes' }, createdAt: serverTimestamp() }, o)); touch(gid, `${me.name} הוסיף/ה אירוע: ${o.title}`); },
    rsvp(gid, eid, v) { return updateDoc(doc(db, 'groups', gid, 'events', eid), { ['rsvp.' + me.id]: v }); },
    deleteEvent(gid, eid) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'events', eid)); return b.commit(); },
    async imageData(gid, iid) { const s = await getDoc(doc(db, 'groups', gid, 'imageData', iid)); return s.exists() ? s.data().data : ''; },
    async deleteImage(gid, img) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'images', img.id)); b.delete(doc(db, 'groups', gid, 'imageData', img.id)); await b.commit(); },

    /* shared lists */
    async addList(gid, title) { await addDoc(collection(db, 'groups', gid, 'lists'), { title, items: [], createdBy: me.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); touch(gid, `${me.name} פתח/ה רשימה: ${title}`); },
    saveList(gid, lid, items) { return updateDoc(doc(db, 'groups', gid, 'lists', lid), { items, updatedAt: serverTimestamp() }); },
    deleteList(gid, lid) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'lists', lid)); return b.commit(); },

    /* messages: scope {t:'g'|'c', id} */
    watchMessages(s, cb, err) { return onSnapshot(query(msgCol(s), orderBy('createdAt', 'desc'), limit(250)), q => cb(q.docs.map(read)), err); },
    async sendMessage(s, m) {
      if (m.video && m.video.data) m = Object.assign({}, m, { video: await uploadVideo(s, m.video) });
      await addDoc(msgCol(s), Object.assign({ authorId: me.id, createdAt: serverTimestamp(), reactions: {} }, m));
      const p = preview(m);
      if (s.t === 'g') touch(s.id, `${me.name}: ${p}`);
      else updateDoc(scopeDoc(s), { lastMessage: p.slice(0, 90), lastAt: serverTimestamp(), lastBy: me.id, ['reads.' + me.id]: Date.now() }).catch(() => {});
    },
    react(s, mid, emoji) { return updateDoc(doc(msgCol(s), mid), { ['reactions.' + me.id]: emoji || deleteField() }); },
    async deleteMessage(s, m) { const b = writeBatch(db); b.delete(doc(msgCol(s), m.id)); await b.commit(); dropVideo(s, m.video); },
    async loadVideo(s, v) {
      const parts = await Promise.all(Array.from({ length: v.chunks }, (_, i) => getDoc(doc(blobCol(s), v.id + '_' + i))));
      if (parts.some(p => !p.exists())) throw Object.assign(new Error('missing'), { code: 'missing' });
      return parts.map(p => p.data().data).join('');
    },

    /* time capsules: the message itself is unreadable (enforced by the rules) until openAt */
    async addCapsule(gid, o) {
      const ref = doc(collection(db, 'groups', gid, 'capsules')), b = writeBatch(db);
      b.set(ref, { by: me.id, title: o.title, to: o.to || '', openAt: F.Timestamp.fromDate(new Date(o.openAt + 'T00:00:00')), hasImage: !!o.image, createdAt: serverTimestamp() });
      b.set(doc(db, 'groups', gid, 'capsuleBody', ref.id), { by: me.id, text: o.text || '', image: o.image || '' });
      await b.commit(); touch(gid, `${me.name} נעל/ה קפסולת זמן: ${o.title}`);
    },
    async capsuleBody(gid, id) { const s = await getDoc(doc(db, 'groups', gid, 'capsuleBody', id)); return s.exists() ? s.data() : null; },
    async deleteCapsule(gid, id) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'capsuleBody', id)); b.delete(doc(db, 'groups', gid, 'capsules', id)); await b.commit(); },

    /* question of the day */
    watchDay(gid, key, cb, err) { return onSnapshot(doc(db, 'groups', gid, 'days', key), s => cb(s.exists() ? s.data() : { answers: {} }), err); },
    async answerDay(gid, key, t) { await setDoc(doc(db, 'groups', gid, 'days', key), { answers: { [me.id]: { t, at: Date.now() } } }, { merge: true }); touch(gid, `${me.name} ענה/תה על שאלת היום`); },

    /* family quotes */
    async addQuote(gid, o) { await addDoc(collection(db, 'groups', gid, 'quotes'), { text: o.text, who: o.who, age: o.age || '', by: me.id, laughs: [], createdAt: serverTimestamp() }); touch(gid, `${me.name} הוסיף/ה ציטוט של ${o.who}`); },
    laugh(gid, q) { return updateDoc(doc(db, 'groups', gid, 'quotes', q.id), { laughs: q.laughs.includes(me.id) ? arrayRemove(me.id) : arrayUnion(me.id) }); },
    deleteQuote(gid, id) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'quotes', id)); return b.commit(); },
    setTyping(s) { return updateDoc(scopeDoc(s), { ['typing.' + me.id]: Date.now() }).catch(() => {}); },
    markRead(cid) { return updateDoc(doc(db, 'chats', cid), { ['reads.' + me.id]: Date.now() }).catch(() => {}); },

    /* private chats */
    watchChats(cb, err) { return onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', me.id)), s => cb(s.docs.map(read)), err); },
    async openChat(other) {
      const id = chatId(me.id, other), ref = doc(db, 'chats', id);
      const s = await getDoc(ref);
      if (!s.exists()) await setDoc(ref, { members: [me.id, other].sort(), lastMessage: '', lastAt: serverTimestamp(), lastBy: '', reads: {}, typing: {} });
      return id;
    }
  };
}
