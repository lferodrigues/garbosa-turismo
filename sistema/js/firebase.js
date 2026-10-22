// Configuração do Firebase — Garbosa System
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD90kC2uzqP2I-90nFmiTdOV8JL-s247i4",
  authDomain: "bus-virtual-dd0f7.firebaseapp.com",
  databaseURL: "https://bus-virtual-dd0f7-default-rtdb.firebaseio.com",
  projectId: "bus-virtual-dd0f7",
  storageBucket: "bus-virtual-dd0f7.firebasestorage.app",
  messagingSenderId: "178272229926",
  appId: "1:178272229926:web:7abf2458525ae4c1a1a4e7",
  measurementId: "G-L48MFWBQXM"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
