// Firebase web config (Firebase console > Project settings > Your apps). These values are public;
// firestore.rules is what protects the data. Off the website (e.g. the Claude preview) the app runs locally.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDkGS4U9-2hugToYYNvAEzUdMC6gXhjkAI',
  authDomain: 'nest-family-d163e.firebaseapp.com',
  projectId: 'nest-family-d163e',
  storageBucket: 'nest-family-d163e.firebasestorage.app',
  messagingSenderId: '706079879278',
  appId: '1:706079879278:web:571f2795a863deeecd767f'
};

// Push notifications (free): the public Web Push key from Firebase console > Cloud Messaging,
// and the Google Apps Script web app (push/Code.gs) that sends them.
export const VAPID_KEY = 'BDD48oEVcvQqXvhpRyggAHapbo9Q_pP1Cl_m_y2owKziQ5ewmSaIdBPPtbJqlVNz87uNsV7VXD87t_r1L0Qql7w';
export const PUSH_URL = '';
