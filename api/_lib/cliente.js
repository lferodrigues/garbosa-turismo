// Conta do viajante (Firebase Auth, app "viajante" no navegador) — verificação no servidor
import { auth, db } from "./firebase.js";
import { ErroUsuario } from "./http.js";

/** Lê o token do cabeçalho Authorization e devolve { uid, email, perfil } */
export async function clienteDoToken(req, { exigirPerfil = true } = {}) {
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErroUsuario("Entre na sua conta para continuar.", 401, { login: true });
  const u = await (await auth()).verifyIdToken(token).catch(() => null);
  if (!u) throw new ErroUsuario("Sua sessão expirou. Entre de novo na sua conta.", 401, { login: true });
  const perfil = (await (await db()).ref(`clientes/${u.uid}`).get()).val();
  if (exigirPerfil && !perfil?.cpf) throw new ErroUsuario("Complete o seu pré-cadastro antes de comprar.", 403, { preCadastro: true });
  return { uid: u.uid, email: u.email || "", perfil };
}
