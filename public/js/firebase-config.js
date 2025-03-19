// Firebase yapılandırması
const firebaseConfig = {
  apiKey: "AIzaSyDqCcJ_1u0e58fqGTavGclKKrdlP6i17JI",
  authDomain: "taskagitmak-f62e4.firebaseapp.com",
  projectId: "taskagitmak-f62e4",
  storageBucket: "taskagitmak-f62e4.firebasestorage.app",
  messagingSenderId: "818997319949",
  appId: "1:818997319949:web:2b85b278948bbf10993844",
  measurementId: "G-1V5H78G7T1"
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);

// Firestore referansı
const db = firebase.firestore();
const auth = firebase.auth();

// Firebase Analytics (isteğe bağlı)
const analytics = firebase.analytics();