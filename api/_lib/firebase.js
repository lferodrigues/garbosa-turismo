// Firebase Admin (acesso de servidor ao Realtime Database — ignora as regras do banco).
// Credencial: variável de ambiente FIREBASE_SERVICE_ACCOUNT na Vercel
// (o JSON da conta de serviço, colado inteiro ou em base64).

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://bus-virtual-dd0f7-default-rtdb.firebaseio.com";
export const ADMIN_EMAIL = "contato@feliperodrigues.net";

let _db = null, _auth = null, _ts = null;

/** Para os testes: injeta um banco/auth falsos */
export function usarFalsos({ db, auth }) { _db = db; _auth = auth || null; _ts = { ".sv": "timestamp" }; }

function lerCredencial() {
  const bruto = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!bruto) throw new ErroConfig("FIREBASE_SERVICE_ACCOUNT não configurada na Vercel.");
  const json = bruto.startsWith("{") ? bruto : Buffer.from(bruto, "base64").toString("utf8");
  const cred = JSON.parse(json);
  if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, "\n");
  return cred;
}

async function iniciar() {
  if (_db) return;
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getDatabase, ServerValue } = await import("firebase-admin/database");
  const { getAuth } = await import("firebase-admin/auth");
  const app = getApps()[0] || initializeApp({ credential: cert(lerCredencial()), databaseURL: DATABASE_URL });
  _db = getDatabase(app);
  _auth = getAuth(app);
  _ts = ServerValue.TIMESTAMP;
}

export async function db() { await iniciar(); return _db; }
export async function auth() { await iniciar(); return _auth; }
export async function TIMESTAMP() { await iniciar(); return _ts; }

export class ErroConfig extends Error {}
