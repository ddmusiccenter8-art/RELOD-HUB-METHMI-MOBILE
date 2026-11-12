// ============================================
// Shop Payment Tracker - Firebase Setup
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDdSMDIj4Tlt5sRB0Qjnmm1rQRTGKpN7zs",
  authDomain: "methmi-work-hub.firebaseapp.com",
  projectId: "methmi-work-hub",
  storageBucket: "methmi-work-hub.firebasestorage.app",
  messagingSenderId: "786539502768",
  appId: "1:786539502768:web:171f0b674108a8555bef75"
};

// Initialize Firebase safely
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Firestore
const fsDB = firebase.firestore();

// Enable offline persistence with multi-tab synchronization support
fsDB.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, or persistence precondition failed.');
    } else if (err.code === 'unimplemented') {
      console.warn('The current browser does not support offline persistence features.');
    } else {
      console.warn('Firebase persistence warning:', err);
    }
  });

window.FS = fsDB; // Export to global scope for data.js
