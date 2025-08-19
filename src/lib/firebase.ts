import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "parts-hub-1dmff",
  appId: "1:272158720664:web:a6ecddd02aa441cce646ed",
  storageBucket: "parts-hub-1dmff.firebasestorage.app",
  apiKey: "AIzaSyDegnx4dOWpeF0OiyIEzqhLCY6FsD64BbQ",
  authDomain: "parts-hub-1dmff.firebaseapp.com",
  messagingSenderId: "272158720664",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);

export { app, auth, db };
