/* Confere. · como ler cada loja.
   Cada loja tem um endereço de entrada e uma função `buscar`, que roda DENTRO da página
   da loja e devolve os anúncios de uma busca já no formato do site:
   { id, nome, de, por, pix, parcelas, estrelas, avaliacoes, link, imagem, vendedor, frete, menor30 } */

/* ---------- Magalu: os dados vêm prontos na página de busca (a página já está aberta na busca) ---------- */
async function magalu() {
  let nd = null;
  for (let i = 0; i < 20 && !(nd = document.getElementById("__NEXT_DATA__")); i++) await new Promise((r) => setTimeout(r, 500));
  if (!nd) throw new Error(/Erro 403|tente novamente/i.test(document.body.innerText) ? "BLOQUEIO: a loja pediu para esperar" : "sem dados na página");
  const itens = JSON.parse(nd.textContent).props.pageProps.data.search.items || [];
  return itens.filter((i) => i.available && i.offers && i.offers[0] && i.offers[0].seller && i.offers[0].seller.id === "magazineluiza").map((i) => {
    const o = i.offers[0], pl = o.bestInstallmentPlan, sj = pl && /sem juros/i.test(pl.paymentMethodDescription || "");
    return {
      id: i.id, nome: i.title, de: o.listPrice, por: o.price, pix: o.bestPrice ? o.bestPrice.totalAmount : null,
      parcelas: sj ? pl.installment : 0, estrelas: i.reviewRating || null, avaliacoes: i.reviewCount || 0,
      link: "https://www.magazineluiza.com.br" + i.path, imagem: (i.image || "").replace("{w}x{h}", "800x560"), vendedor: "Magalu"
    };
  });
}

/* ---------- Amazon: só o que a própria Amazon vende ---------- */
async function amazon(q) {
  const num = (s) => (s ? parseFloat(s.replace(/[^\d,]/g, "").replace(",", ".")) : null);
  const html = await (await fetch("/s?k=" + encodeURIComponent(q) + "&rh=p_6%3AA1ZZFT5FULY4LN", { credentials: "include" })).text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll('div[data-component-type="s-search-result"]')].map((e) => {
    const txt = e.textContent.replace(/\s+/g, " ");
    const rot = [...e.querySelectorAll("[aria-label]")].map((x) => x.getAttribute("aria-label"));
    const atual = e.querySelector(".a-price:not(.a-text-price) .a-offscreen");
    const risc = e.querySelector('.a-price[data-a-strike="true"] .a-offscreen');
    const parc = txt.match(/em até (\d+)x de R\$ ?([\d.]+,\d{2}) ?sem juros/);
    const nota = rot.find((l) => /de 5 estrelas/.test(l)), aval = rot.find((l) => /^[\d.,]+ (mil )?classificaç/.test(l));
    const avista = num(atual && atual.textContent);
    const por = parc ? Math.round(+parc[1] * num(parc[2]) * 100) / 100 : avista;
    return {
      id: e.dataset.asin, nome: ((e.querySelector("h2") || {}).textContent || "").trim(), de: num(risc && risc.textContent), por,
      pix: avista && avista < por ? avista : null, parcelas: parc ? +parc[1] : 0,
      estrelas: nota ? parseFloat(nota.replace(",", ".")) : null,
      avaliacoes: aval ? (/mil/.test(aval) ? Math.round(parseFloat(aval.replace(",", ".")) * 1000) : parseInt(aval.replace(/\D/g, ""))) : 0,
      link: "https://www.amazon.com.br/dp/" + e.dataset.asin, imagem: ((e.querySelector("img.s-image") || {}).getAttribute?.("src") || "").replace(/\._AC_[^.]+_\./, "._AC_SL800_."),
      vendedor: "Amazon", menor30: /Menor preço em 30 dias/.test(txt), patrocinado: /Patrocinado/.test(txt)
    };
  }).filter((x) => x.id && !x.patrocinado);
}

/* ---------- Mercado Livre: lê os cards da busca (a página já está aberta na busca) ---------- */
async function mercadolivre() {
  if (/account-verification|\/login/.test(location.href)) throw new Error("LOGIN: o Mercado Livre pediu para entrar na conta");
  for (let y = 0; y < 9; y++) { window.scrollTo(0, y * 900); await new Promise((r) => setTimeout(r, 160)); }
  const txt = (e, s) => { const x = e && e.querySelector(s); return x ? x.innerText.replace(/\s+/g, " ").trim() : ""; };
  /* o valor vem em dois pedaços na página (reais e centavos): lê cada um separado */
  const valor = (m) => { if (!m) return null; const f = txt(m, ".andes-money-amount__fraction").replace(/\D/g, ""), c = txt(m, ".andes-money-amount__cents").replace(/\D/g, ""); return f ? parseFloat(f + "." + (c || "00")) : null; };
  return [...document.querySelectorAll("li.ui-search-layout__item")].filter((e) => !e.querySelector(".poly-component__ads-promotions")).map((e) => {
    const a = e.querySelector("a.poly-component__title"); if (!a) return null;
    const link = a.href.split("#")[0].split("?")[0];
    const id = (link.match(/MLB-?\d+/) || [""])[0].replace("-", "");
    const cur = e.querySelector(".poly-price__current");
    const atual = valor(cur && cur.querySelector(".andes-money-amount")), noPix = /pix/i.test(txt(e, ".poly-price__current"));
    const instEl = e.querySelector(".poly-price__installments"), inst = txt(e, ".poly-price__installments");
    const quantias = instEl ? [...instEl.querySelectorAll(".andes-money-amount")].map(valor) : [];
    const parc = inst.match(/(\d+)x .*sem juros/);
    const cartao = /^ou /.test(inst) && quantias.length ? quantias[0] : parc && quantias.length ? Math.round(+parc[1] * quantias[quantias.length - 1] * 100) / 100 : atual;
    const img = e.querySelector("img.poly-component__picture");
    const src = img ? (img.getAttribute("data-src") || img.src || "") : "";
    return {
      id, nome: a.innerText.trim(), de: valor(e.querySelector("s.andes-money-amount")), por: noPix ? Math.max(cartao || 0, atual) : atual,
      pix: noPix && cartao > atual ? atual : null, parcelas: parc ? +parc[1] : 0,
      estrelas: parseFloat(txt(e, ".poly-component__review-compacted, .poly-reviews__rating")) || null, avaliacoes: null,
      link, imagem: /^https/.test(src) ? src : "",
      vendedor: txt(e, ".poly-component__seller") || "Mercado Livre", frete: /gr[áa]tis/i.test(txt(e, ".poly-component__shipping-v2, .poly-component__shipping")) ? "Frete grátis" : ""
    };
  }).filter((x) => x && x.id && x.por);
}

/* ---------- Casas Bahia: lê os cards da busca (a página já está aberta na busca) ---------- */
async function casasbahia() {
  for (let y = 0; y < 14; y++) { window.scrollTo(0, y * 800); await new Promise((r) => setTimeout(r, 220)); }
  const reais = (s) => { const m = (s || "").match(/R\$\s?([\d.]+),(\d{2})/); return m ? parseFloat(m[1].replace(/\./g, "") + "." + m[2]) : null; };
  const parte = (e, t) => { const x = e.querySelector(`[data-testid="${t}"]`); return x ? x.innerText.replace(/\s+/g, " ").trim() : ""; };
  return [...document.querySelectorAll('[data-testid="product-card-desktop"], [data-testid="product-card-mobile"]')].map((e) => {
    const a = e.querySelector('a[href*="/p/"]'), h = e.querySelector("h3, h2"); if (!a || !h) return null;
    const tudo = e.innerText.replace(/\s+/g, " ");
    const inst = parte(e, "product-card-installment"), dest = parte(e, "product-card-highlight-price-section");
    const parc = inst.match(/(\d+)x de (R\$ ?[\d.]+,\d{2})/), semJuros = /sem juros/i.test(inst);
    const cartao = reais(inst) || reais(dest), pix = /pix/i.test(dest) ? reais(dest) : null;
    const img = e.querySelector("img");
    return {
      id: (a.href.match(/\/p\/(\d+)/) || [])[1], nome: h.innerText.trim(), de: reais((tudo.match(/\bde (R\$ ?[\d.]+,\d{2})/) || [])[1]),
      por: cartao, pix: pix && pix < cartao ? pix : null, parcelas: parc && semJuros ? +parc[1] : 0,
      estrelas: parseFloat(parte(e, "product-card-rating")) || null, avaliacoes: parseInt(parte(e, "product-card-reviews-count").replace(/\D/g, "")) || 0,
      link: a.href.split("?")[0], imagem: img && /^https/.test(img.src) ? img.src : "", vendedor: "Casas Bahia"
    };
  }).filter((x) => x && x.id);
}

/* ---------- Americanas: a busca da loja responde com os dados completos ---------- */
async function americanas(q) {
  const j = await (await fetch("/api/io/_v/api/intelligent-search/product_search/?query=" + encodeURIComponent(q) + "&count=50&page=1&locale=pt-BR&allowRedirect=false")).json();
  return (j.products || []).map((p) => {
    const it = (p.items || [])[0]; if (!it) return null;
    const ofertas = (it.sellers || []).filter((s) => s.commertialOffer && s.commertialOffer.AvailableQuantity > 0 && s.commertialOffer.Price > 0)
      .sort((a, b) => a.commertialOffer.Price - b.commertialOffer.Price);
    if (!ofertas.length) return null;
    const s = ofertas[0], o = s.commertialOffer;
    const sj = (o.Installments || []).filter((i) => i.InterestRate === 0).sort((a, b) => b.NumberOfInstallments - a.NumberOfInstallments)[0];
    return {
      id: p.productId, nome: p.productName, de: o.ListPrice, por: o.Price, pix: o.spotPrice && o.spotPrice < o.Price ? o.spotPrice : null,
      parcelas: sj && sj.NumberOfInstallments > 1 ? sj.NumberOfInstallments : 0, estrelas: null, avaliacoes: null,
      link: "https://www.americanas.com.br" + p.link, imagem: (it.images && it.images[0] && it.images[0].imageUrl) || "", vendedor: s.sellerName
    };
  }).filter(Boolean);
}

/* `porBusca`: endereço a abrir para cada busca (lojas lidas pelos cards). Sem ele, a loja é
   aberta uma vez em `entrada` e as buscas são feitas de dentro da página. */
export const LOJAS = [
  { nome: "Amazon", entrada: "https://www.amazon.com.br/s?k=smart+tv", buscar: amazon },
  { nome: "Mercado Livre", porBusca: (q) => "https://lista.mercadolivre.com.br/" + q.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-"), vazioEhFalha: true, pausa: 4000, buscar: mercadolivre },
  { nome: "Casas Bahia", porBusca: (q) => "https://www.casasbahia.com.br/" + q.replace(/\s+/g, "-") + "/b", vazioEhFalha: true, buscar: casasbahia },
  { nome: "Americanas", entrada: "https://www.americanas.com.br/s?q=smart+tv", buscar: americanas },
  { nome: "Magalu", porBusca: (q) => "https://www.magazineluiza.com.br/busca/" + encodeURIComponent(q).replace(/%20/g, "+") + "/", pausa: 7000, buscar: magalu }
];

/* Reclame Aqui: lê a nota, o % resolvido e o % que voltaria da página da empresa. */
export async function reclameAqui() {
  await new Promise((r) => setTimeout(r, 2500));
  const t = document.body.innerText, n = (re) => { const m = t.match(re); return m ? parseFloat(m[1].replace(",", ".")) : null; };
  const per = t.match(/Dados de (\d{2})\/(\d{2})\/(\d{4}) até (\d{2})\/(\d{2})\/(\d{4})/);
  return {
    nota: n(/nota média nos últimos 6 meses ([\d.,]+)\s*\/\s*10/i), resolvidas: n(/Reclamações resolvidas\s*([\d.,]+)%/i), voltaria: n(/Voltariam a fazer negócio\s*([\d.,]+)%/i),
    periodo: per ? `${+per[1]}/${+per[2]} a ${+per[4]}/${+per[5]}/${per[6]}` : ""
  };
}
