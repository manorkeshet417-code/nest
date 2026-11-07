// Local backend for the preview (e.g. inside Claude): one person, kept only in this page.
// Same API as the live backend; private chats and calls need the real site.
import { LS, newCode } from './util.js';

export function LocalBackend() {
  const me = { id: 'me', name: LS.get('nest.localName') || '', photo: '', birthday: LS.get('nest.localBirthday') || '' };
  const groups = {}, sub = {}, L = new Map();
  let uid = 0;
  const id = () => 'l' + (++uid) + Math.random().toString(36).slice(2, 6);
  const emit = k => { const s = L.get(k); if (s) s.forEach(f => f()); };
  const on = (k, f) => { if (!L.has(k)) L.set(k, new Set()); L.get(k).add(f); f(); return () => L.get(k).delete(f); };
  const box = gid => sub[gid] || (sub[gid] = { posts: [], comments: {}, messages: [], events: [], images: [], imageData: {}, lists: [] });
  const touch = (gid, text) => { const g = groups[gid]; if (g) { g.lastMessage = text.slice(0, 90); g.lastAt = Date.now(); g.lastBy = 'me'; emit('groups'); } };
  const sort = {
    posts: (a, b) => b.createdAt - a.createdAt, messages: (a, b) => b.createdAt - a.createdAt, images: (a, b) => b.createdAt - a.createdAt,
    lists: (a, b) => a.createdAt - b.createdAt, events: (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  };
  const copy = x => JSON.parse(JSON.stringify(x));
  const noSite = () => { const e = new Error('local'); e.code = 'local'; throw e; };
  let authCb = null;
  return {
    mode: 'local',
    rtc: null,
    onAuth(cb) { authCb = cb; setTimeout(() => cb(me.name ? copy(me) : null), 150); return () => {}; },
    async signIn(name) { me.name = name; LS.set('nest.localName', name); authCb && authCb(copy(me)); },
    async signOut() { me.name = ''; LS.set('nest.localName', ''); authCb && authCb(null); },
    async saveProfile(o) { Object.assign(me, o); LS.set('nest.localName', me.name); LS.set('nest.localBirthday', me.birthday || ''); emit('groups'); },
    async users(ids) { const o = {}; ids.forEach(i => o[i] = i === 'me' ? copy(me) : { id: i, name: '' }); return o; },

    watchGroups(cb) { return on('groups', () => cb(Object.values(groups).filter(g => g.members.includes('me')).map(copy))); },
    async createGroup(o) { const gid = id(); groups[gid] = { id: gid, name: o.name, emoji: o.emoji, color: o.color, ownerId: 'me', members: ['me'], inviteCode: newCode(), lastMessage: '', lastAt: Date.now(), lastBy: 'me', typing: {} }; box(gid); emit('groups'); return gid; },
    async findInvite(code) { const g = Object.values(groups).find(x => x.inviteCode === code); return g ? { groupId: g.id, groupName: g.name, emoji: g.emoji, color: g.color } : null; },
    async joinGroup(code, gid) { const g = groups[gid]; if (g && !g.members.includes('me')) g.members.push('me'); emit('groups'); },
    async updateGroup(g, p) { Object.assign(groups[g.id], p); emit('groups'); },
    async newInviteCode(g) { groups[g.id].inviteCode = newCode(); emit('groups'); return groups[g.id].inviteCode; },
    async removeMember(gid, u) { const g = groups[gid]; g.members = g.members.filter(x => x !== u); emit('groups'); },
    async leaveGroup(gid) { const g = groups[gid]; g.members = g.members.filter(x => x !== 'me'); emit('groups'); },
    async deleteGroup(g) { delete groups[g.id]; delete sub[g.id]; emit('groups'); },

    watch(gid, kind, cb) { return on(gid + ':' + kind, () => cb(box(gid)[kind].slice().sort(sort[kind]).map(copy))); },
    watchComments(gid, pid, cb) { return on(gid + ':c:' + pid, () => cb((box(gid).comments[pid] || []).slice().sort((a, b) => a.createdAt - b.createdAt).map(copy))); },
    async addPhoto(gid, img) { const iid = id(); box(gid).images.unshift({ id: iid, by: 'me', thumb: img.thumb.data, w: img.full.w, h: img.full.h, createdAt: Date.now() }); box(gid).imageData[iid] = img.full.data; emit(gid + ':images'); return iid; },
    async addPhotos(gid, imgs) { for (const im of imgs) await this.addPhoto(gid, im); touch(gid, `${me.name} הוסיף/ה ${imgs.length === 1 ? 'תמונה' : imgs.length + ' תמונות'} לאלבום`); },
    async addPost(gid, o) {
      const imageId = o.image ? await this.addPhoto(gid, o.image) : '';
      const p = { id: id(), authorId: 'me', text: o.text || '', imageId, createdAt: Date.now(), likes: [], commentCount: 0 };
      if (o.poll) { p.poll = { options: o.poll }; p.votes = {}; }
      box(gid).posts.push(p); emit(gid + ':posts'); touch(gid, o.text ? `${me.name}: ${o.text}` : `${me.name} שיתף/ה תמונה`);
    },
    async toggleLike(gid, p) { const x = box(gid).posts.find(q => q.id === p.id); if (!x) return; x.likes = x.likes.includes('me') ? x.likes.filter(i => i !== 'me') : x.likes.concat('me'); emit(gid + ':posts'); },
    async vote(gid, pid, idx) { const x = box(gid).posts.find(q => q.id === pid); if (x) { x.votes.me = idx; emit(gid + ':posts'); } },
    async deletePost(gid, p) { const b = box(gid); b.posts = b.posts.filter(q => q.id !== p.id); if (p.imageId) { b.images = b.images.filter(i => i.id !== p.imageId); emit(gid + ':images'); } emit(gid + ':posts'); },
    async addComment(gid, pid, text) { const b = box(gid); (b.comments[pid] = b.comments[pid] || []).push({ id: id(), authorId: 'me', text, createdAt: Date.now() }); const p = b.posts.find(q => q.id === pid); if (p) p.commentCount++; emit(gid + ':c:' + pid); emit(gid + ':posts'); },
    async deleteComment(gid, pid, cid) { const b = box(gid); b.comments[pid] = (b.comments[pid] || []).filter(c => c.id !== cid); const p = b.posts.find(q => q.id === pid); if (p) p.commentCount = Math.max(0, p.commentCount - 1); emit(gid + ':c:' + pid); emit(gid + ':posts'); },
    async addEvent(gid, o) { box(gid).events.push(Object.assign({ id: id(), createdBy: 'me', rsvp: { me: 'yes' }, createdAt: Date.now() }, o)); emit(gid + ':events'); touch(gid, `${me.name} הוסיף/ה אירוע: ${o.title}`); },
    async rsvp(gid, eid, v) { const e = box(gid).events.find(x => x.id === eid); if (e) { e.rsvp.me = v; emit(gid + ':events'); } },
    async deleteEvent(gid, eid) { box(gid).events = box(gid).events.filter(x => x.id !== eid); emit(gid + ':events'); },
    async imageData(gid, iid) { return box(gid).imageData[iid] || ''; },
    async deleteImage(gid, img) { const b = box(gid); b.images = b.images.filter(i => i.id !== img.id); emit(gid + ':images'); },

    async addList(gid, title) { box(gid).lists.push({ id: id(), title, items: [], createdBy: 'me', createdAt: Date.now(), updatedAt: Date.now() }); emit(gid + ':lists'); },
    async saveList(gid, lid, items) { const l = box(gid).lists.find(x => x.id === lid); if (l) { l.items = copy(items); l.updatedAt = Date.now(); emit(gid + ':lists'); } },
    async deleteList(gid, lid) { box(gid).lists = box(gid).lists.filter(x => x.id !== lid); emit(gid + ':lists'); },

    watchMessages(s, cb) { if (s.t !== 'g') return () => {}; return on(s.id + ':messages', () => cb(box(s.id).messages.slice().sort(sort.messages).map(copy))); },
    async sendMessage(s, m) { if (s.t !== 'g') noSite(); box(s.id).messages.push(Object.assign({ id: id(), authorId: 'me', createdAt: Date.now(), reactions: {} }, copy(m))); emit(s.id + ':messages'); touch(s.id, `${me.name}: ${m.text || (m.image ? '📷 תמונה' : '🎤 הודעה קולית')}`); },
    async react(s, mid, emoji) { const m = box(s.id).messages.find(x => x.id === mid); if (m) { if (emoji) m.reactions.me = emoji; else delete m.reactions.me; emit(s.id + ':messages'); } },
    async deleteMessage(s, mid) { box(s.id).messages = box(s.id).messages.filter(x => x.id !== mid); emit(s.id + ':messages'); },
    async setTyping() {},
    async markRead() {},
    watchChats(cb) { cb([]); return () => {}; },
    async openChat() { noSite(); }
  };
}
