// Rasante · entrega ao robô do GitHub a lista de e-mails que recebem os alertas (Supabase Edge Function).
// Só responde com o cabeçalho x-robo-token igual ao segredo "robo_token" (no GitHub: segredo RASANTE_ROBO_TOKEN).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const { data: segredo } = await db.from("segredos").select("valor").eq("nome", "robo_token").maybeSingle();
  const token = req.headers.get("x-robo-token");
  if (!segredo || !token || token !== segredo.valor) return new Response(JSON.stringify({ erro: "token inválido" }), { status: 401 });
  const { data, error } = await db.from("clientes_ativos").select("email");
  if (error) return new Response(JSON.stringify({ erro: "não leu" }), { status: 500 });
  return new Response(JSON.stringify({ emails: data.map((c) => c.email) }), { headers: { "Content-Type": "application/json" } });
});
