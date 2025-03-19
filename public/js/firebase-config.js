// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDqCcJ_1u0e58fqGTavGclKKrdlP6i17JI",
  authDomain: "taskagitmak-f62e4.firebaseapp.com",
  projectId: "taskagitmak-f62e4",
  storageBucket: "taskagitmak-f62e4.firebasestorage.app",
  messagingSenderId: "818997319949",
  appId: "1:818997319949:web:2b85b278948bbf10993844",
  measurementId: "G-1V5H78G7T1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);