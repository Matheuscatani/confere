// Rasante · manda o e-mail de alerta de passagem pelo Resend, um e-mail para cada pessoa (Supabase Edge Function).
// POST { assunto, html, para: [e-mails] } → { enviados }
// Só responde com o cabeçalho x-robo-token igual ao segredo "robo_token" (no GitHub: RASANTE_ROBO_TOKEN).
// Sem a chave RESEND_API_KEY responde 503, e o robô manda pelo Gmail como antes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resend, textoPuro } from "../_shared/email.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const { data: segredo } = await db.from("segredos").select("valor").eq("nome", "robo_token").maybeSingle();
  const token = req.headers.get("x-robo-token");
  if (!segredo || !token || token !== segredo.valor) return resp(401, { erro: "token inválido" });
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  if (!Deno.env.get("RESEND_API_KEY")) return resp(503, { erro: "sem RESEND_API_KEY" });
  let p: any;
  try { p = await req.json(); } catch { return resp(400, { erro: "JSON inválido" }); }
  const para = [...new Set((p.para || []).map((e: string) => String(e).trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))] as string[];
  if (!para.length || !p.assunto || !p.html) return resp(400, { erro: "faltam assunto, html ou para" });
  const texto = textoPuro(String(p.html));
  let enviados = 0;
  const falhas: string[] = [];
  /* o Resend aceita até 100 e-mails por chamada */
  for (let i = 0; i < para.length; i += 100) {
    const lote = para.slice(i, i + 100);
    try { await resend(lote.map((e) => ({ para: e, assunto: String(p.assunto), html: String(p.html), texto }))); enviados += lote.length; }
    catch (e) { falhas.push((e as Error).message); }
  }
  if (!enviados) return resp(502, { erro: falhas[0] || "nada enviado" });
  return resp(200, { enviados, falhas });
});
