// Firebase yapılandırması
const firebaseConfig = {
  apiKey: "AIzaSyCDtp80ZWe2VUBz1F7AzIxCU-_Wlz8kpZ8",
  authDomain: "realmofkings-a0311.firebaseapp.com",
  databaseURL: "https://realmofkings-a0311-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "realmofkings-a0311",
  storageBucket: "realmofkings-a0311.firebasestorage.app",
  messagingSenderId: "38879787733",
  appId: "1:38879787733:web:df37792327fc323a8b405c",
  measurementId: "G-5KMZRJ4FFP"
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);

// Firestore referansı
const db = firebase.firestore();
const auth = firebase.auth();

// Firebase Analytics (isteğe bağlı)
const analytics = firebase.analytics();