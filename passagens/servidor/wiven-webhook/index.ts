// Rasante · recebe os avisos de venda da Wiven e mantém a lista de clientes (Supabase Edge Function).
// TRANSACTION_PAID           → cliente ativo (1 ano ou vitalício, pelo valor pago)
// TRANSACTION_REFUNDED, TRANSACTION_CHARGED_BACK, REFUND_COMPLETED → cliente sai da lista
// O token do webhook (gerado pela Wiven) fica na tabela segredos, com o nome "wiven_token".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/* o vitalício custa R$ 49,99 e o de 1 ano R$ 29,99: acima de R$ 40 é vitalício */
const planoPeloValor = (valor: number) => (valor >= 40 ? "vitalicio" : "anual");

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "use POST" });
  let p: any;
  try { p = await req.json(); } catch { return resposta(400, { erro: "JSON inválido" }); }

  const { data: segredo } = await db.from("segredos").select("valor").eq("nome", "wiven_token").maybeSingle();
  if (!segredo || !p?.token || p.token !== segredo.valor) return resposta(401, { erro: "token inválido" });

  const evento = String(p.event || "");
  const transacao = p.transaction?.id ?? null;
  const email = String(p.client?.email || "").trim().toLowerCase() || null;
  const valor = Number(p.orderItems?.[0]?.price ?? p.transaction?.amount ?? 0);
  let resultado = "ignorado";

  if (evento === "TRANSACTION_PAID" && email) {
    const plano = planoPeloValor(valor);
    const pago = new Date(p.transaction?.payedAt || Date.now());
    const { data: atual } = await db.from("clientes").select("plano, status, valido_ate").eq("email", email).maybeSingle();
    let valido_ate: string | null = null;
    let planoFinal = plano;
    if (atual?.status === "ativo" && atual.plano === "vitalicio") planoFinal = "vitalicio";
    if (planoFinal === "anual") {
      /* renovação antes de vencer soma 1 ano a partir do vencimento atual */
      const base = atual?.status === "ativo" && atual.valido_ate && new Date(atual.valido_ate) > pago ? new Date(atual.valido_ate) : pago;
      base.setFullYear(base.getFullYear() + 1);
      valido_ate = base.toISOString();
    }
    const { error } = await db.from("clientes").upsert({
      email, nome: p.client?.name ?? null, plano: planoFinal, status: "ativo",
      comprado_em: pago.toISOString(), valido_ate, transacao_id: transacao, atualizado_em: new Date().toISOString(),
    });
    if (error) return resposta(500, { erro: "não salvou" });
    resultado = `ativo (${planoFinal})`;
  } else if (["TRANSACTION_REFUNDED", "REFUND_COMPLETED", "TRANSACTION_CHARGED_BACK"].includes(evento)) {
    const status = evento === "TRANSACTION_CHARGED_BACK" ? "estornado" : "reembolsado";
    const filtro = transacao ? db.from("clientes").update({ status, atualizado_em: new Date().toISOString() }).eq("transacao_id", transacao)
      : db.from("clientes").update({ status, atualizado_em: new Date().toISOString() }).eq("email", email ?? "");
    const { error } = await filtro;
    if (error) return resposta(500, { erro: "não salvou" });
    resultado = status;
  }

  await db.from("eventos_wiven").insert({ evento, transacao_id: transacao, email, valor, resultado });
  return resposta(200, { ok: true, resultado });
});
