// Rasante · recebe os avisos de venda da Kiwify e mantém a lista de clientes (Supabase Edge Function).
// Endereço do webhook na Kiwify: https://jnkvvtdfsfugigcaqplk.supabase.co/functions/v1/kiwify-webhook
// A Kiwify assina cada aviso: ?signature= é o HMAC-SHA1 do corpo com o token do webhook (segredos.kiwify_token).
// Compra aprovada → cliente ativo (1 ano ou vitalício) e e-mail de boas-vindas com o link do painel.
// Reembolso ou chargeback → cliente sai da lista.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const REMETENTE = "rasante.gyn@gmail.com";
const PAINEL = "https://matheuscatani.github.io/confere/passagens/painel.html";
/* os links de checkout de cada plano (vendas.js) */
const CHECKOUT = { anual: "cllMDNS", vitalicio: "M8Yt5l7" };
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const segredo = async (nome: string) => (await db.from("segredos").select("valor").eq("nome", nome).maybeSingle()).data?.valor as string | undefined;

async function hmacSha1(chave: string, texto: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function plano(p: any): "anual" | "vitalicio" {
  const link = String(p.checkout_link || "");
  if (link === CHECKOUT.vitalicio) return "vitalicio";
  if (link === CHECKOUT.anual) return "anual";
  const nomes = String(p.Product?.offer_name ?? p.offer_name ?? p.Subscription?.plan?.name ?? "").toLowerCase();
  if (nomes.includes("vital")) return "vitalicio";
  if (/1 ano|anual/.test(nomes)) return "anual";
  /* pelo valor cobrado: vitalício R$ 49,99, anual R$ 29,99 (em centavos). O preço base é sempre o do
     produto (R$ 49,99), mesmo na oferta de 1 ano, por isso vem por último */
  let v = Number(p.Commissions?.charge_amount ?? p.order_amount ?? p.Commissions?.product_base_price ?? 0);
  if (v > 500) v = v / 100;
  return v >= 40 ? "vitalicio" : "anual";
}

async function boasVindas(email: string, nome: string, planoFinal: string) {
  const senha = (Deno.env.get("GMAIL_SENHA") || "").replace(/\s+/g, "");
  if (!senha) return;
  const primeiro = (nome || "").split(" ")[0];
  const envio = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: REMETENTE, pass: senha } });
  await envio.sendMail({
    from: { name: "Rasante", address: REMETENTE }, to: email,
    subject: "Seu acesso ao Rasante está liberado",
    text: `${primeiro ? primeiro + ", s" : "S"}eu acesso ao Rasante está liberado (${planoFinal === "vitalicio" ? "vitalício" : "1 ano"}).\n\nPainel de preços: ${PAINEL}\nEntre com este e-mail (${email}); mandamos um código para confirmar.\n\nOs alertas de passagem muito abaixo do preço chegam neste e-mail a partir da próxima coleta.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#10213a"><h2 style="margin:0 0 10px">${primeiro ? primeiro + ", seu" : "Seu"} acesso está liberado</h2>
      <p style="margin:0 0 14px">Plano ${planoFinal === "vitalicio" ? "vitalício" : "de 1 ano"}. Os alertas de passagem muito abaixo do preço saindo de Goiânia chegam neste e-mail a partir da próxima coleta.</p>
      <p style="margin:0 0 18px"><a href="${PAINEL}" style="display:inline-block;background:#ff6b3d;color:#fff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px">Abrir o painel de preços</a></p>
      <p style="color:#5b6b82;margin:0">Entre com este e-mail (${email}). Mandamos um código de 6 números para confirmar que é você.</p></div>`,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(405, { erro: "use POST" });
  const corpo = await req.text();
  const token = await segredo("kiwify_token");
  const assinatura = new URL(req.url).searchParams.get("signature");
  if (!token || !assinatura || assinatura !== (await hmacSha1(token, corpo))) return resp(401, { erro: "assinatura inválida" });
  let p: any;
  try { p = JSON.parse(corpo); } catch { return resp(400, { erro: "JSON inválido" }); }
  if (p.order && typeof p.order === "object") p = { ...p.order, ...p }; /* alguns envios vêm dentro de "order" */

  const evento = String(p.webhook_event_type || "");
  const status = String(p.order_status || "");
  const pedido = p.order_id ? String(p.order_id) : null;
  const email = String(p.Customer?.email || "").trim().toLowerCase() || null;
  const nome = String(p.Customer?.full_name || p.Customer?.first_name || "");
  let valor = Number(p.Commissions?.charge_amount ?? 0); if (valor > 500) valor = valor / 100;
  let resultado = "ignorado";

  const pago = status === "paid" || ["order_approved", "subscription_renewed"].includes(evento);
  const desfeito = ["refunded", "chargedback"].includes(status) || ["order_refunded", "chargeback"].includes(evento);

  if (pago && !desfeito && email) {
    const novo = plano(p);
    const quando = new Date(String(p.approved_date || "").replace(" ", "T") + (p.approved_date && !/[zZ+]/.test(p.approved_date) ? "-03:00" : "") || Date.now());
    const data = isNaN(quando.getTime()) ? new Date() : quando;
    const { data: atual } = await db.from("clientes").select("plano, status, valido_ate, transacao_id").eq("email", email).maybeSingle();
    if (atual?.status === "ativo" && atual.transacao_id === pedido) resultado = "repetido";
    else {
      let planoFinal = novo, valido_ate: string | null = null;
      if (atual?.status === "ativo" && atual.plano === "vitalicio") planoFinal = "vitalicio";
      if (planoFinal === "anual") {
        const base = atual?.status === "ativo" && atual.valido_ate && new Date(atual.valido_ate) > data ? new Date(atual.valido_ate) : new Date(data);
        base.setFullYear(base.getFullYear() + 1);
        valido_ate = base.toISOString();
      }
      const { error } = await db.from("clientes").upsert({ email, nome: nome || null, plano: planoFinal, status: "ativo", comprado_em: data.toISOString(), valido_ate, transacao_id: pedido, atualizado_em: new Date().toISOString() });
      if (error) return resp(500, { erro: "não salvou" });
      resultado = `ativo (${planoFinal})`;
      try { await boasVindas(email, nome, planoFinal); } catch (e) { console.error("boas-vindas:", (e as Error).message); }
    }
  } else if (desfeito && (pedido || email)) {
    const novo = status === "chargedback" || evento === "chargeback" ? "estornado" : "reembolsado";
    const alvo = db.from("clientes").update({ status: novo, atualizado_em: new Date().toISOString() });
    const { error } = pedido ? await alvo.eq("transacao_id", pedido) : await alvo.eq("email", email!);
    if (error) return resp(500, { erro: "não salvou" });
    if (email) await db.from("sessoes").delete().eq("email", email);
    resultado = novo;
  }

  await db.from("eventos_kiwify").insert({ evento, status, pedido, email, valor, resultado,
    /* só o que ajuda a conferir o plano; CPF, telefone e cartão ficam de fora */
    corpo: { Product: p.Product, Commissions: p.Commissions, checkout_link: p.checkout_link, offer_name: p.offer_name, approved_date: p.approved_date, payment_method: p.payment_method } });
  return resp(200, { ok: true, resultado });
});
