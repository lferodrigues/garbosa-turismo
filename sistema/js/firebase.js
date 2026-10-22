// Configuração do Firebase — Garbosa System
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD90kC2uzqP2I-90nFmiTdOV8JL-s247i4",
  authDomain: "bus-virtual-dd0f7.firebaseapp.com",
  databaseURL: "https://bus-virtual-dd0f7-default-rtdb.firebaseio.com",
  projectId: "bus-virtual-dd0f7",
  storageBucket: "bus-virtual-dd0f7.firebasestorage.app",
  messagingSenderId: "178272229926",
  appId: "1:178272229926:web:7abf2458525ae4c1a1a4e7",
  measurementId: "G-L48MFWBQXM"
};

// E-mail com acesso total (administrador). A senha NÃO fica no código:
// ela é definida no cadastro da conta. As regras do banco também checam este e-mail.
export const ADMIN_EMAIL = "contato@feliperodrigues.net";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// App secundário: usado pelo administrador para criar usuários sem perder a própria sessão
let appSec = null;
export function authSecundario() {
  if (!appSec) appSec = initializeApp(firebaseConfig, "secundario");
  return getAuth(appSec);
}
