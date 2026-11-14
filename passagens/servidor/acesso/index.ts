// Rasante · conta do cliente e entrada no painel (Supabase Edge Function).
// { acao: "login", email, senha }        → chave de acesso (60 dias)
// { acao: "esqueci", email }             → e-mail com link para criar ou trocar a senha
// { acao: "link", token }                → para quem é o link (mostra o e-mail na tela de criar senha)
// { acao: "criar_senha", token, senha }  → grava a senha e já entra
// Com Authorization: Bearer <chave>:
// { acao: "conta" }                      → nome, e-mail, plano e validade
// { acao: "trocar_senha", atual, nova }  → troca a senha
// { acao: "dados" }                      → os preços do painel, só para assinatura ativa
// { acao: "sair" }                       → apaga a chave
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { enviar, emailCriarSenha, emailRedefinir, criarLink, hash, aleatorio } from "../_shared/email.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200;
const SENHA_MIN = 8;

/* senha: PBKDF2-SHA256 com sal próprio; no banco fica só "pbkdf2$voltas$sal$resumo" */
const VOLTAS = 100_000;
async function pbkdf2(senha: string, sal: string, voltas: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(sal), iterations: voltas }, k, 256);
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const guardarSenha = async (senha: string) => { const sal = aleatorio(16); return `pbkdf2$${VOLTAS}$${sal}$${await pbkdf2(senha, sal, VOLTAS)}`; };
async function confere(senha: string, guardada: string | null) {
  const [tipo, voltas, sal, resumo] = String(guardada || "").split("$");
  if (tipo !== "pbkdf2" || !resumo) { await pbkdf2(senha, "x", VOLTAS); return false; }
  const conta = await pbkdf2(senha, sal, Number(voltas));
  let dif = conta.length ^ resumo.length;
  for (let i = 0; i < Math.min(conta.length, resumo.length); i++) dif |= conta.charCodeAt(i) ^ resumo.charCodeAt(i);
  return dif === 0;
}

const cliente = async (email: string) =>
  (await db.from("clientes").select("email, nome, plano, status, valido_ate, senha_hash, login_falhas, login_bloqueado_ate").eq("email", email).maybeSingle()).data;
const ativo = (c: any) => c && c.status === "ativo" && (!c.valido_ate || new Date(c.valido_ate) > new Date());

async function abrirSessao(email: string) {
  const chave = aleatorio(32);
  await db.from("sessoes").insert({ token_hash: await hash(chave), email, expira: new Date(Date.now() + 60 * 86_400_000).toISOString() });
  return chave;
}
async function sessao(req: Request) {
  const chave = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[0-9a-f]{64}$/.test(chave)) return null;
  const { data } = await db.from("sessoes").select("email, expira").eq("token_hash", await hash(chave)).maybeSingle();
  if (!data || new Date(data.expira) < new Date()) return null;
  return { email: data.email as string, chave };
}
async function lerLink(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await db.from("links_senha").select("token_hash, email, tipo, expira, usado_em").eq("token_hash", await hash(token)).maybeSingle();
  if (!data || data.usado_em || new Date(data.expira) < new Date()) return null;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  let p: any = {};
  try { p = await req.json(); } catch { /* sem corpo */ }
  const acao = String(p.acao || "");
  const email = String(p.email || "").trim().toLowerCase();

  if (acao === "login") {
    const senha = String(p.senha || "");
    if (!emailValido(email) || !senha) return resp(400, { erro: "Preencha o e-mail e a senha." });
    const c = await cliente(email);
    if (c?.login_bloqueado_ate && new Date(c.login_bloqueado_ate) > new Date()) return resp(429, { erro: "Muitas tentativas. Espere 15 minutos ou use “Esqueci minha senha”." });
    if (c && !c.senha_hash) return resp(409, { erro: "sem_senha" });
    if (!c || !(await confere(senha, c.senha_hash))) {
      if (c) {
        const falhas = (c.login_falhas || 0) + 1;
        await db.from("clientes").update({ login_falhas: falhas >= 8 ? 0 : falhas, login_bloqueado_ate: falhas >= 8 ? new Date(Date.now() + 15 * 60_000).toISOString() : null }).eq("email", email);
      } else await pbkdf2(senha, "x", VOLTAS);
      return resp(401, { erro: "E-mail ou senha errados." });
    }
    await db.from("clientes").update({ login_falhas: 0, login_bloqueado_ate: null }).eq("email", email);
    if (!ativo(c)) return resp(403, { erro: "sem_assinatura" });
    return resp(200, { chave: await abrirSessao(email), email });
  }

  if (acao === "esqueci") {
    if (!emailValido(email)) return resp(400, { erro: "Confira o e-mail." });
    const c = await cliente(email);
    /* a resposta é sempre a mesma: não conta para ninguém quem é ou não é cliente */
    if (c && ativo(c)) {
      const { data: ultimo } = await db.from("links_senha").select("criado").eq("email", email).order("criado", { ascending: false }).limit(1).maybeSingle();
      if (!ultimo || Date.now() - new Date(ultimo.criado).getTime() > 60_000) {
        const tipo = c.senha_hash ? "redefinir" : "criar";
        const link = await criarLink(db, email, tipo);
        const [assunto, modelo] = tipo === "criar" ? emailCriarSenha(c.nome, c.plano, c.valido_ate, link, false) : emailRedefinir(c.nome, link);
        try { await enviar(email, assunto, modelo); } catch (e) { console.error("e-mail:", (e as Error).message); return resp(503, { erro: "Não conseguimos mandar o e-mail agora. Tente de novo em alguns minutos." }); }
      }
    }
    return resp(200, { ok: true });
  }

  if (acao === "link") {
    const l = await lerLink(String(p.token || ""));
    if (!l) return resp(410, { erro: "Este link já foi usado ou venceu. Peça outro em “Esqueci minha senha”." });
    const c = await cliente(l.email);
    return resp(200, { email: l.email, nome: c?.nome ?? null, tipo: l.tipo });
  }

  if (acao === "criar_senha") {
    const senha = String(p.senha || "");
    if (senha.length < SENHA_MIN) return resp(400, { erro: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` });
    if (senha.length > 200) return resp(400, { erro: "Senha longa demais." });
    const l = await lerLink(String(p.token || ""));
    if (!l) return resp(410, { erro: "Este link já foi usado ou venceu. Peça outro em “Esqueci minha senha”." });
    await db.from("links_senha").update({ usado_em: new Date().toISOString() }).eq("token_hash", l.token_hash);
    await db.from("clientes").update({ senha_hash: await guardarSenha(senha), login_falhas: 0, login_bloqueado_ate: null, atualizado_em: new Date().toISOString() }).eq("email", l.email);
    /* senha nova derruba as entradas antigas em outros aparelhos */
    await db.from("sessoes").delete().eq("email", l.email);
    const c = await cliente(l.email);
    if (!ativo(c)) return resp(403, { erro: "sem_assinatura" });
    return resp(200, { chave: await abrirSessao(l.email), email: l.email });
  }

  /* daqui para baixo, só com a chave de acesso */
  const s = await sessao(req);
  if (acao === "sair") {
    if (s) await db.from("sessoes").delete().eq("token_hash", await hash(s.chave));
    return resp(200, { ok: true });
  }
  if (!s) return resp(401, { erro: "entrar" });
  const c = await cliente(s.email);

  if (acao === "conta") {
    return resp(200, { email: s.email, nome: c?.nome ?? null, plano: c?.plano, valido_ate: c?.valido_ate ?? null, ativo: ativo(c) });
  }

  if (acao === "trocar_senha") {
    const nova = String(p.nova || "");
    if (!(await confere(String(p.atual || ""), c?.senha_hash ?? null))) return resp(401, { erro: "A senha atual não confere." });
    if (nova.length < SENHA_MIN) return resp(400, { erro: `A senha nova precisa ter pelo menos ${SENHA_MIN} caracteres.` });
    if (nova.length > 200) return resp(400, { erro: "Senha longa demais." });
    await db.from("clientes").update({ senha_hash: await guardarSenha(nova), atualizado_em: new Date().toISOString() }).eq("email", s.email);
    /* sai dos outros aparelhos, fica neste */
    await db.from("sessoes").delete().eq("email", s.email).neq("token_hash", await hash(s.chave));
    return resp(200, { ok: true });
  }

  if (acao === "dados") {
    if (!ativo(c)) return resp(403, { erro: "sem_assinatura" });
    const { data } = await db.from("estado").select("valor").eq("nome", "painel").maybeSingle();
    if (!data) return resp(503, { erro: "Os preços estão sendo atualizados. Volte em alguns minutos." });
    return resp(200, { email: s.email, dados: data.valor });
  }

  return resp(400, { erro: "ação desconhecida" });
});
