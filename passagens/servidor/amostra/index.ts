// Rasante · amostra pública para a página de vendas (Supabase Edge Function).
// GET → as 5 maiores ofertas da última coleta (sem o calendário) e os nomes dos destinos.
// O robô grava a amostra junto com os preços do painel; os preços completos só saem pelo serviço "acesso".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const { data } = await db.from("estado").select("valor").eq("nome", "amostra").maybeSingle();
  if (!data) return new Response(JSON.stringify({ erro: "sem amostra" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
  return new Response(JSON.stringify(data.valor), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
});
