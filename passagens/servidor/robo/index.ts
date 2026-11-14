// Rasante · memória do robô do GitHub (Supabase Edge Function).
// Os preços não ficam mais no repositório público: o robô lê e grava aqui.
// GET  → { ultima, historico, avisados }
// POST { painel?, amostra?, ultima?, historico?, avisados? } → grava o que vier
// Só responde com o cabeçalho x-robo-token igual ao segredo "robo_token" (no GitHub: RASANTE_ROBO_TOKEN).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const NOMES = ["painel", "amostra", "ultima", "historico", "avisados"];
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const { data: segredo } = await db.from("segredos").select("valor").eq("nome", "robo_token").maybeSingle();
  const token = req.headers.get("x-robo-token");
  if (!segredo || !token || token !== segredo.valor) return resp(401, { erro: "token inválido" });

  if (req.method === "GET") {
    const { data, error } = await db.from("estado").select("nome, valor").in("nome", ["ultima", "historico", "avisados"]);
    if (error) return resp(500, { erro: "não leu" });
    return resp(200, Object.fromEntries(data.map((r) => [r.nome, r.valor])));
  }
  if (req.method === "POST") {
    let p: any;
    try { p = await req.json(); } catch { return resp(400, { erro: "JSON inválido" }); }
    const linhas = NOMES.filter((n) => p[n] !== undefined && p[n] !== null).map((nome) => ({ nome, valor: p[nome], atualizado_em: new Date().toISOString() }));
    if (!linhas.length) return resp(400, { erro: "nada para gravar" });
    const { error } = await db.from("estado").upsert(linhas);
    if (error) return resp(500, { erro: "não gravou" });
    return resp(200, { ok: true, gravou: linhas.map((l) => l.nome) });
  }
  return resp(405, { erro: "use GET ou POST" });
});
