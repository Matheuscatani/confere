// Rasante · entrada no painel de preços (Supabase Edge Function).
// { acao: "entrar", email }            → manda um código de 6 números ao e-mail, se ele tiver assinatura ativa
// { acao: "conferir", email, codigo }  → troca o código por uma chave de acesso (vale 60 dias)
// { acao: "dados" } + Authorization: Bearer <chave> → os preços do painel, só para assinatura ativa
// { acao: "sair" }  + Authorization: Bearer <chave> → apaga a chave
// O e-mail sai do Gmail rasante.gyn@gmail.com com a senha de app no segredo GMAIL_SENHA das Edge Functions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const REMETENTE = "rasante.gyn@gmail.com";
const PAINEL = "https://matheuscatani.github.io/confere/passagens/painel.html";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const aleatorio = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, "0")).join("");
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200;

async function ativo(email: string) {
  const { data } = await db.from("clientes_ativos").select("email").eq("email", email).maybeSingle();
  return !!data;
}

async function mandarCodigo(email: string, codigo: string) {
  const senha = (Deno.env.get("GMAIL_SENHA") || "").replace(/\s+/g, "");
  if (!senha) throw new Error("sem GMAIL_SENHA");
  const envio = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: REMETENTE, pass: senha } });
  await envio.sendMail({
    from: { name: "Rasante", address: REMETENTE }, to: email,
    subject: `${codigo} é o seu código do Rasante`,
    text: `Seu código para entrar no painel do Rasante: ${codigo}\n\nEle vale por 15 minutos. Se não foi você, ignore este e-mail.\n\n${PAINEL}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;color:#10213a"><p style="margin:0 0 12px">Seu código para entrar no painel do Rasante:</p>
      <p style="font-size:34px;font-weight:bold;letter-spacing:8px;margin:0 0 12px">${codigo}</p>
      <p style="color:#5b6b82;margin:0">Ele vale por 15 minutos. Se não foi você, ignore este e-mail.</p></div>`,
  });
}

async function sessao(req: Request) {
  const chave = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[0-9a-f]{64}$/.test(chave)) return null;
  const { data } = await db.from("sessoes").select("email, expira").eq("token_hash", await hash(chave)).maybeSingle();
  if (!data || new Date(data.expira) < new Date()) return null;
  return { email: data.email as string, chave };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  let p: any = {};
  try { p = await req.json(); } catch { /* sem corpo */ }
  const acao = String(p.acao || "");

  if (acao === "entrar") {
    const email = String(p.email || "").trim().toLowerCase();
    if (!emailValido(email)) return resp(400, { erro: "Confira o e-mail." });
    if (!(await ativo(email))) return resp(403, { erro: "sem_assinatura" });
    const { data: ultimo } = await db.from("codigos").select("enviado_em").eq("email", email).maybeSingle();
    if (ultimo && Date.now() - new Date(ultimo.enviado_em).getTime() < 45_000) return resp(429, { erro: "Espere um minuto antes de pedir outro código." });
    const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    await db.from("codigos").upsert({ email, codigo_hash: await hash(email + ":" + codigo), expira: new Date(Date.now() + 15 * 60_000).toISOString(), tentativas: 0, enviado_em: new Date().toISOString() });
    try { await mandarCodigo(email, codigo); } catch (e) { console.error("e-mail:", (e as Error).message); return resp(503, { erro: "Não conseguimos mandar o código agora. Tente de novo em alguns minutos." }); }
    return resp(200, { ok: true });
  }

  if (acao === "conferir") {
    const email = String(p.email || "").trim().toLowerCase();
    const codigo = String(p.codigo || "").replace(/\D/g, "");
    const { data: c } = await db.from("codigos").select("codigo_hash, expira, tentativas").eq("email", email).maybeSingle();
    if (!c || new Date(c.expira) < new Date() || c.tentativas >= 5) return resp(401, { erro: "Código vencido. Peça outro." });
    if (c.codigo_hash !== (await hash(email + ":" + codigo))) {
      await db.from("codigos").update({ tentativas: c.tentativas + 1 }).eq("email", email);
      return resp(401, { erro: "Código errado. Confira o e-mail e tente de novo." });
    }
    await db.from("codigos").delete().eq("email", email);
    if (!(await ativo(email))) return resp(403, { erro: "sem_assinatura" });
    const chave = aleatorio(32);
    await db.from("sessoes").insert({ token_hash: await hash(chave), email, expira: new Date(Date.now() + 60 * 86_400_000).toISOString() });
    return resp(200, { chave, email });
  }

  if (acao === "dados") {
    const s = await sessao(req);
    if (!s) return resp(401, { erro: "entrar" });
    if (!(await ativo(s.email))) return resp(403, { erro: "sem_assinatura" });
    const { data } = await db.from("estado").select("valor").eq("nome", "painel").maybeSingle();
    if (!data) return resp(503, { erro: "Os preços estão sendo atualizados. Volte em alguns minutos." });
    return resp(200, { email: s.email, dados: data.valor });
  }

  if (acao === "sair") {
    const s = await sessao(req);
    if (s) await db.from("sessoes").delete().eq("token_hash", await hash(s.chave));
    return resp(200, { ok: true });
  }

  return resp(400, { erro: "ação desconhecida" });
});
