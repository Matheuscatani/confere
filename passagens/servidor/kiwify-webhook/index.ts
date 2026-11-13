// Rasante · recebe os avisos de venda da Kiwify e mantém a lista de clientes (Supabase Edge Function).
// order_approved (pago)                → cliente ativo (1 ano ou vitalício, pelo valor pago)
// order_refunded, chargeback           → cliente sai da lista
// A Kiwify assina cada aviso: ?signature= é o HMAC-SHA1 do corpo com o token do webhook,
// que fica na tabela segredos com o nome "kiwify_token".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

async function hmacSha1(chave: string, texto: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* valor cobrado em reais; a Kiwify manda em centavos ("2999"). O preço base é o do produto
   (R$ 49,99) mesmo quando a compra foi da oferta de 1 ano, por isso vem por último */
function valorPago(p: any) {
  const c = p.Commissions || {};
  const bruto = Number(c.charge_amount ?? p.order_amount ?? c.product_base_price ?? 0);
  return bruto > 500 ? bruto / 100 : bruto;
}
/* pelo nome da oferta ("1 ano de alertas" / "Acesso vitalício"); sem nome, pelo valor:
   o vitalício custa R$ 49,99 e o de 1 ano R$ 29,99 (parcelado com juros fica abaixo de R$ 40) */
function plano(p: any, valor: number) {
  const oferta = String(p.Product?.offer_name ?? p.offer_name ?? p.Subscription?.plan?.name ?? "").toLowerCase();
  if (/vital/.test(oferta)) return "vitalicio";
  if (/1 ano|anual/.test(oferta)) return "anual";
  return valor >= 40 ? "vitalicio" : "anual";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "use POST" });
  const corpo = await req.text();
  const { data: segredo } = await db.from("segredos").select("valor").eq("nome", "kiwify_token").maybeSingle();
  const assinatura = new URL(req.url).searchParams.get("signature");
  if (!segredo || !assinatura || assinatura !== (await hmacSha1(segredo.valor, corpo))) return resposta(401, { erro: "assinatura inválida" });

  let p: any;
  try { p = JSON.parse(corpo); } catch { return resposta(400, { erro: "JSON inválido" }); }
  const evento = String(p.webhook_event_type || p.order_status || "");
  const status = String(p.order_status || "");
  const pedido = p.order_id ? String(p.order_id) : null;
  const email = String(p.Customer?.email || "").trim().toLowerCase() || null;
  const valor = valorPago(p);
  let resultado = "ignorado";

  if ((evento === "order_approved" || status === "paid") && email) {
    const comprado = plano(p, valor);
    const lida = new Date(String(p.approved_date || "").replace(" ", "T") + "-03:00");
    const pago = isNaN(lida.getTime()) ? new Date() : lida;
    const { data: atual } = await db.from("clientes").select("plano, status, valido_ate").eq("email", email).maybeSingle();
    let valido_ate: string | null = null;
    let planoFinal = comprado;
    if (atual?.status === "ativo" && atual.plano === "vitalicio") planoFinal = "vitalicio";
    if (planoFinal === "anual") {
      /* renovação antes de vencer soma 1 ano a partir do vencimento atual */
      const base = atual?.status === "ativo" && atual.valido_ate && new Date(atual.valido_ate) > pago ? new Date(atual.valido_ate) : pago;
      base.setFullYear(base.getFullYear() + 1);
      valido_ate = base.toISOString();
    }
    const { error } = await db.from("clientes").upsert({
      email, nome: p.Customer?.full_name ?? null, plano: planoFinal, status: "ativo",
      comprado_em: pago.toISOString(), valido_ate, transacao_id: pedido, atualizado_em: new Date().toISOString(),
    });
    if (error) return resposta(500, { erro: "não salvou" });
    resultado = `ativo (${planoFinal})`;
  } else if (["order_refunded", "chargeback"].includes(evento) || ["refunded", "chargedback"].includes(status)) {
    const novo = evento === "chargeback" || status === "chargedback" ? "estornado" : "reembolsado";
    const q = db.from("clientes").update({ status: novo, atualizado_em: new Date().toISOString() });
    const { error } = pedido ? await q.eq("transacao_id", pedido) : await q.eq("email", email ?? "");
    if (error) return resposta(500, { erro: "não salvou" });
    resultado = novo;
  }

  /* guarda também o nome da oferta, para conferir as primeiras vendas de verdade */
  const oferta = p.Product?.offer_name ?? p.offer_name ?? null;
  await db.from("eventos_wiven").insert({ evento: "kiwify:" + evento + (oferta ? " · " + oferta : ""), transacao_id: pedido, email, valor, resultado });
  return resposta(200, { ok: true, resultado });
});
