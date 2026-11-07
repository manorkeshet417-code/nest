// One-to-one voice/video calls over WebRTC. Firestore carries the signaling:
// calls/{id} holds offer/answer/status, fromCandidates/toCandidates hold ICE candidates.
// Media flows directly between the two phones (STUN only, so some strict networks can block it).

// STUN finds a direct path; the TURN relay carries the call when a mobile network blocks direct paths.
const ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
] };
const RING_MS = 40000;

export function CallManager(rtc, ui) {
  const { db, F } = rtc;
  const { doc, collection, setDoc, updateDoc, addDoc, onSnapshot, query, where, serverTimestamp } = F;
  let cur = null;

  function watchIncoming() {
    return onSnapshot(query(collection(db, 'calls'), where('to', '==', rtc.me()), where('status', '==', 'ringing')), s => {
      s.docChanges().forEach(ch => {
        const d = Object.assign({ id: ch.doc.id }, ch.doc.data());
        const t = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : Date.now();
        if (ch.type === 'added' && Date.now() - t < RING_MS && d.offer) ui.incoming(d);
        if (ch.type === 'removed') ui.incomingGone(d.id);
      });
    }, () => {});
  }

  const media = kind => navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: kind === 'video' ? { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } } : false
  });

  // A video call whose camera is busy or missing carries on as a voice call
  async function getMedia(kind) {
    try { return await media(kind); }
    catch (e) {
      if (kind !== 'video' || !/NotReadable|NotFound|Overconstrained|TrackStart|Abort|NotAllowed|Permission/.test(e.name || '')) throw e;
      const s = await media('audio'); ui.toast(/NotAllowed|Permission/.test(e.name || '') ? 'המצלמה חסומה, ממשיכים בשיחה קולית' : 'המצלמה לא זמינה, ממשיכים בשיחה קולית'); if (cur) cur.camOff = true; return s;
    }
  }

  function setup(role, kind, other) {
    const pc = new RTCPeerConnection(ICE), remote = new MediaStream();
    cur = { role, kind, other, pc, remote, local: null, unsubs: [], startedAt: 0, status: 'connecting', muted: false, camOff: false, facing: 'user' };
    pc.ontrack = e => { e.streams[0].getTracks().forEach(t => { if (!remote.getTracks().includes(t)) remote.addTrack(t); }); ui.update(); };
    pc.onconnectionstatechange = () => {
      if (!cur) return;
      if (pc.connectionState === 'connected') { if (!cur.startedAt) cur.startedAt = Date.now(); cur.status = 'live'; ui.update(); }
      if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (e) {} clearTimeout(cur.failT); cur.failT = setTimeout(() => { if (cur && cur.pc === pc && pc.connectionState !== 'connected') { ui.toast('החיבור נכשל. נסו שוב, או עברו ל-Wi-Fi'); finish('ended'); } }, 8000); }
    };
    return pc;
  }

  async function start(other, kind) {
    if (cur) return;
    const pc = setup('caller', kind, other);
    ui.open();
    try { cur.local = await getMedia(kind); }
    catch (e) { cleanup(); ui.mediaError(e, kind); return; }
    cur.local.getTracks().forEach(t => pc.addTrack(t, cur.local));
    ui.update();
    const ref = doc(collection(db, 'calls'));
    cur.id = ref.id; cur.ref = ref;
    // the call doc exists before any candidate is written (the rules read it)
    await setDoc(ref, { from: rtc.me(), to: other, kind, status: 'init', createdAt: serverTimestamp() });
    pc.onicecandidate = e => { if (e.candidate) addDoc(collection(ref, 'fromCandidates'), e.candidate.toJSON()).catch(() => {}); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await updateDoc(ref, { offer: { type: offer.type, sdp: offer.sdp }, status: 'ringing' });
    if (!cur) return;
    cur.status = 'ringing'; ui.update();
    cur.unsubs.push(onSnapshot(ref, s => {
      const d = s.data(); if (!d || !cur) return;
      if (d.answer && !pc.currentRemoteDescription && !cur.answering) { cur.answering = true; pc.setRemoteDescription(new RTCSessionDescription(d.answer)).then(() => { const q = (cur && cur.pending) || []; if (cur) cur.pending = null; q.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})); }).catch(() => {}); }
      if (d.status === 'accepted' && cur.status === 'ringing') { cur.status = 'connecting'; clearTimeout(cur.ringTimer); ui.update(); }
      if (d.status === 'declined') { ui.toast('השיחה נדחתה'); finish('declined', true); }
      if (d.status === 'ended') finish('ended', true);
    }));
    cur.pending = [];
    cur.unsubs.push(onSnapshot(collection(ref, 'toCandidates'), s => s.docChanges().forEach(ch => {
      if (ch.type !== 'added' || !cur) return;
      if (!pc.currentRemoteDescription) { (cur.pending = cur.pending || []).push(ch.doc.data()); return; }
      pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
    })));
    cur.ringTimer = setTimeout(() => { if (cur && cur.status === 'ringing') { ui.toast('אין מענה'); finish('missed'); } }, RING_MS);
  }

  async function accept(call) {
    if (cur) return;
    const pc = setup('callee', call.kind, call.from);
    cur.id = call.id; cur.ref = doc(db, 'calls', call.id);
    ui.open();
    try { cur.local = await getMedia(call.kind); }
    catch (e) { await updateDoc(cur.ref, { status: 'declined' }).catch(() => {}); cleanup(); ui.mediaError(e, call.kind); return; }
    cur.local.getTracks().forEach(t => pc.addTrack(t, cur.local));
    ui.update();
    pc.onicecandidate = e => { if (e.candidate) addDoc(collection(cur.ref, 'toCandidates'), e.candidate.toJSON()).catch(() => {}); };
    await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(cur.ref, { answer: { type: answer.type, sdp: answer.sdp }, status: 'accepted' });
    if (!cur) return;
    cur.unsubs.push(onSnapshot(collection(cur.ref, 'fromCandidates'), s => s.docChanges().forEach(ch => {
      if (ch.type === 'added') pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(() => {});
    })));
    cur.unsubs.push(onSnapshot(cur.ref, s => { const d = s.data(); if (d && d.status === 'ended' && cur) finish('ended', true); }));
  }

  function decline(call) { return updateDoc(doc(db, 'calls', call.id), { status: 'declined' }).catch(() => {}); }

  async function finish(status, fromOther) {
    if (!cur || cur.status === 'ending') return;
    const c = cur; c.status = 'ending'; clearTimeout(c.ringTimer);
    if (!fromOther && c.ref) await updateDoc(c.ref, { status: status === 'missed' ? 'missed' : 'ended', endedAt: serverTimestamp() }).catch(() => {});
    const dur = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
    cleanup();
    ui.ended({ role: c.role, kind: c.kind, other: c.other, dur, status });
  }

  function cleanup() {
    if (!cur) return;
    cur.unsubs.forEach(u => { try { u(); } catch (e) {} });
    try { cur.pc.close(); } catch (e) {}
    if (cur.local) cur.local.getTracks().forEach(t => t.stop());
    clearTimeout(cur.ringTimer);
    cur = null;
    ui.close();
  }

  function toggleMute() { if (!cur || !cur.local) return; cur.muted = !cur.muted; cur.local.getAudioTracks().forEach(t => t.enabled = !cur.muted); ui.update(); }
  function toggleCam() { if (!cur || !cur.local) return; cur.camOff = !cur.camOff; cur.local.getVideoTracks().forEach(t => t.enabled = !cur.camOff); ui.update(); }
  async function flip() {
    if (!cur || !cur.local || cur.kind !== 'video') return;
    const facing = cur.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      const track = s.getVideoTracks()[0], old = cur.local.getVideoTracks()[0];
      const sender = cur.pc.getSenders().find(x => x.track && x.track.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      if (old) { cur.local.removeTrack(old); old.stop(); }
      cur.local.addTrack(track); cur.facing = facing; track.enabled = !cur.camOff; ui.update();
    } catch (e) { ui.toast('לא הצלחנו להחליף מצלמה'); }
  }

  return { watchIncoming, start, accept, decline, hangup: () => finish('ended'), toggleMute, toggleCam, flip, get state() { return cur; } };
}
