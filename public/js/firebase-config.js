// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);