/* Confere. · vitrine, filtros, oferta do dia e página do produto */
(function () {
  document.documentElement.classList.add("js");
  const D = window.CONFERE;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: v % 1 ? 2 : 0 });
  const brl2 = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const STAR = `<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z"/></svg>`;
  const n1 = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const faixa = (v) => v >= 8 ? "Ótimo" : v >= 7 ? "Bom" : v >= 6 ? "Regular" : v >= 5 ? "Ruim" : "Não recomendada";
  const pct = (p) => Math.round((1 - p.por / p.de) * 100);
  const parcela = (p) => p.parcelas > 1 ? `ou ${p.parcelas}x de ${brl2(p.por / p.parcelas)} sem juros` : "à vista";
  const pixTxt = (p) => p.pix ? `${brl2(p.pix)} no Pix` : "";
  const termos = (p) => [parcela(p), pixTxt(p) && "ou " + pixTxt(p)].filter(Boolean).join(" · ");
  const tag = (p) => pct(p) > 0 ? `<span class="off">-${pct(p)}%</span>` : "";
  const riscado = (p) => p.de > p.por ? `<s>${brl(p.de)}</s>` : "";
  /* Com os códigos de afiliado preenchidos em ofertas.js, os links das lojas viram links de afiliado. */
  const link = (p) => {
    if (D.parceiroMagalu && p.link.startsWith("https://www.magazineluiza.com.br/"))
      return p.link.replace("https://www.magazineluiza.com.br/", `https://www.magazinevoce.com.br/${D.parceiroMagalu}/`);
    if (D.associadoAmazon && p.link.startsWith("https://www.amazon.com.br/"))
      return p.link + (p.link.includes("?") ? "&" : "?") + "tag=" + encodeURIComponent(D.associadoAmazon);
    const a = (D.afiliados || {})[p.loja] || {};
    if (a.prefixo) return a.prefixo + encodeURIComponent(p.link);
    if (a.sufixo) return p.link + (p.link.includes("?") ? "&" : "?") + a.sufixo.replace(/^[?&]/, "");
    return p.link;
  };
  const avista = (p) => p.pix || p.por;
  /* só conta como "mais barato" quando a diferença é de pelo menos 1% */
  const maisCaras = (p) => (p.outras || []).filter((o) => o.preco >= avista(p) * 1.01).sort((a, b) => a.preco - b.preco);
  const NA = { "Mercado Livre": "no", "Casas Bahia": "nas" };
  const na = (loja) => `${NA[loja] || "na"} ${loja}`;
  const aval = (p) => p.avaliacoes == null ? "" : p.avaliacoes.toLocaleString("pt-BR");
  const NOTA_MIN = D.notaMinima || 7;
  const imagem = (p, alt) => p.imagem
    ? `<img src="${p.imagem}" alt="${alt ? p.nome : ""}" loading="lazy" data-tipo="${p.tipo}">`
    : window.ilustra(p.tipo, alt ? "Ilustração: " + p.nome : "");
  /* Se a foto da loja não carregar, entra o desenho do tipo de produto. */
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.dataset.tipo) return;
    img.insertAdjacentHTML("afterend", window.ilustra(img.dataset.tipo, img.alt ? "Ilustração: " + img.alt : ""));
    img.remove();
  }, true);

  /* As três checagens. Cada uma devolve se passou e o porquê. */
  function checar(p, min) {
    const l = D.lojas[p.loja];
    return {
      preco: { ok: p.menor90 != null ? p.por < p.menor90 : pct(p) >= 5 || !!p.pix || !!p.menor30 || maisCaras(p).length > 0, p, l },
      loja: { ok: l.nota >= min, p, l },
      produto: { ok: p.estrelas >= (D.notaProduto || 4) && (p.avaliacoes == null || p.avaliacoes >= (D.avaliacoesMinimas ?? 300)), p, l }
    };
  }
  const passa = (c) => c.preco.ok && c.loja.ok && c.produto.ok;

  /* ---------- estado ---------- */
  const st = { cat: "Todas", q: "", min: NOTA_MIN, max: 0, lojas: new Set(Object.keys(D.lojas)), frete: false, ordem: "melhores", ver: 24 };
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* ---------- categorias ---------- */
  const catsEl = $("cats");
  function drawCats() {
    const vis = D.produtos.filter((p) => passa(checar(p, st.min)));
    const all = ["Todas", ...D.categorias];
    catsEl.innerHTML = all.map((c) => {
      const n = c === "Todas" ? vis.length : vis.filter((p) => p.categoria === c).length;
      return `<button class="cat" type="button" data-cat="${c}" aria-pressed="${st.cat === c}">${c} <span class="sr">(${n} ofertas)</span></button>`;
    }).join("");
  }
  catsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".cat"); if (!b) return;
    st.cat = b.dataset.cat; st.ver = 24; drawCats(); render();
    $("loja").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  /* ---------- filtro de lojas ---------- */
  $("lojas-filtro").innerHTML = Object.entries(D.lojas)
    .filter(([nome]) => D.produtos.some((p) => p.loja === nome))
    .sort((a, b) => b[1].nota - a[1].nota)
    .map(([nome, l]) => `<label class="check"><input type="checkbox" value="${nome}" checked> ${nome} <small>RA ${n1(l.nota)}</small></label>`).join("");

  /* ---------- vitrine ---------- */
  const grid = $("grid");
  let firstRun = true;
  function render() {
    let lista = D.produtos.map((p) => ({ p, c: checar(p, st.min) }));
    lista = lista.filter((x) => st.cat === "Todas" || x.p.categoria === st.cat)
      .filter((x) => !st.q || norm(x.p.nome + " " + x.p.categoria + " " + x.p.loja).includes(norm(st.q)))
      .filter((x) => !st.max || x.p.por <= st.max)
      .filter((x) => st.lojas.has(x.p.loja))
      .filter((x) => !st.frete || /grátis/i.test(x.p.frete));
    const foraLoja = lista.filter((x) => x.c.preco.ok && x.c.produto.ok && !x.c.loja.ok).length;
    lista = lista.filter((x) => passa(x.c));

    const sorters = {
      melhores: (a, b) => (b.p.pontos || 0) - (a.p.pontos || 0),
      desconto: (a, b) => pct(b.p) - pct(a.p),
      menor: (a, b) => a.p.por - b.p.por,
      maior: (a, b) => b.p.por - a.p.por,
      reputacao: (a, b) => D.lojas[b.p.loja].nota - D.lojas[a.p.loja].nota,
      avaliacao: (a, b) => b.p.estrelas - a.p.estrelas || (b.p.avaliacoes || 0) - (a.p.avaliacoes || 0)
    };
    lista.sort(sorters[st.ordem]);

    $("loja-title").textContent = st.q ? `Busca: ${st.q}` : st.cat === "Todas" ? "Todas as ofertas" : st.cat;
    $("count").textContent = `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"}` +
      (foraLoja ? ` · ${foraLoja} ${foraLoja === 1 ? "ficou" : "ficaram"} de fora pela nota da loja` : "");
    $("empty").hidden = lista.length > 0;

    $("mais").hidden = lista.length <= st.ver;
    $("mais").textContent = `Mostrar mais ${Math.min(24, lista.length - st.ver)} de ${lista.length - st.ver}`;
    grid.innerHTML = lista.slice(0, st.ver).map(({ p }) => {
      const mc = maisCaras(p)[0];
      const l = D.lojas[p.loja];
      return `<li class="card${firstRun ? " rise" : ""}">
        <button class="card-open" type="button" data-id="${p.id}" aria-label="Ver detalhes: ${p.nome}">
          <div class="card-img">${imagem(p, false)}${tag(p)}</div>
          <div class="card-body">
            <p class="card-name">${p.nome}</p>
            <p class="stars"><b>${STAR}${n1(p.estrelas)}</b>${aval(p) ? ` (${aval(p)})` : ""}</p>
            <p class="price">${riscado(p)}<strong>${brl(p.por)}</strong></p>
            <p class="terms">${termos(p)}</p>
            ${mc ? `<p class="beats">${brl(mc.preco - avista(p))} a menos que ${na(mc.loja)}</p>` : ""}
          </div>
        </button>
        <p class="store"><span>Vendido por <b>${p.loja}</b></span><span class="ra${l.nota >= 8 ? " ra-otimo" : ""}">Reclame Aqui: ${n1(l.nota)} ${faixa(l.nota)}</span></p>
        <a class="btn card-buy" href="${link(p)}" rel="sponsored nofollow noopener" target="_blank">Comprar</a>
      </li>`;
    }).join("");

    if (firstRun) { stagger(grid.querySelectorAll(".rise")); firstRun = false; }
  }

  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".card-open"); if (b) abrir(b.dataset.id);
  });

  /* ---------- controles ---------- */
  const range = $("nota-min");
  range.addEventListener("input", () => {
    st.min = parseFloat(range.value); st.ver = 24;
    $("nota-out").textContent = `${n1(st.min)} ou mais (${faixa(st.min)})`;
    drawCats(); render();
  });
  $("preco-max").addEventListener("change", (e) => { st.max = +e.target.value; st.ver = 24; render(); });
  $("frete-box").hidden = !D.produtos.some((p) => /grátis/i.test(p.frete));
  $("frete-gratis").addEventListener("change", (e) => { st.frete = e.target.checked; render(); });
  $("ordem").addEventListener("change", (e) => { st.ordem = e.target.value; st.ver = 24; render(); });
  $("mais").addEventListener("click", () => { st.ver += 24; render(); });
  range.value = NOTA_MIN; $("nota-out").textContent = `${n1(NOTA_MIN)} ou mais (${faixa(NOTA_MIN)})`;
  $("lojas-filtro").addEventListener("change", (e) => {
    e.target.checked ? st.lojas.add(e.target.value) : st.lojas.delete(e.target.value); st.ver = 24; render();
  });
  let t;
  $("busca").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { st.q = e.target.value.trim(); st.ver = 24; if (st.q) { st.cat = "Todas"; drawCats(); } render(); }, 120);
  });
  document.querySelector(".search").addEventListener("submit", () => $("loja").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }));
  $("limpar").addEventListener("click", () => {
    Object.assign(st, { cat: "Todas", q: "", min: NOTA_MIN, max: 0, frete: false, ver: 24 });
    st.lojas = new Set(Object.keys(D.lojas));
    range.value = NOTA_MIN; range.dispatchEvent(new Event("input"));
    $("busca").value = ""; $("preco-max").value = "0"; $("frete-gratis").checked = false;
    document.querySelectorAll("#lojas-filtro input").forEach((i) => (i.checked = true));
    drawCats(); render();
  });

  /* ---------- oferta do dia ---------- */
  const d = D.produtos.find((p) => p.id === D.destaque) || D.produtos[0];
  const dl = D.lojas[d.loja];
  $("deal-img").innerHTML = imagem(d, true) + tag(d);
  $("deal-name").textContent = d.nome;
  $("deal-de").textContent = d.de > d.por ? brl(d.de) : "";
  $("deal-por").textContent = brl(d.por);
  $("deal-terms").textContent = `${termos(d)} · ${d.frete}`;
  $("deal-checks").innerHTML = `
    <li>${d.menor90 != null ? `${brl(d.menor90 - d.por)} abaixo do menor preço dos últimos 90 dias` : `${brl(d.de - (d.pix || d.por))} a menos que o preço de tabela${d.pix ? ", pagando no Pix" : ""}`}</li>
    <li>${d.loja}: nota ${n1(dl.nota)} (${faixa(dl.nota)}) no Reclame Aqui, ${String(dl.resolvidas).replace(".", ",")}% das reclamações resolvidas</li>
    <li>${n1(d.estrelas)} de 5${aval(d) ? ` em ${aval(d)} avaliações` : " na avaliação"} de quem comprou</li>
    ${maisCaras(d)[0] ? `<li>${brl(maisCaras(d)[0].preco - avista(d))} a menos que ${na(maisCaras(d)[0].loja)}, hoje</li>` : ""}`;
  $("deal-buy").href = link(d);
  $("deal-buy").textContent = `Comprar ${na(d.loja)}`;
  $("deal-img").addEventListener("click", () => abrir(d.id));
  $("deal-more").addEventListener("click", () => abrir(d.id));

  /* ---------- página do produto ---------- */
  const pdp = $("pdp");
  function abrir(id, semHistorico) {
    const p = D.produtos.find((x) => x.id === id); if (!p) return;
    const l = D.lojas[p.loja];
    const c = checar(p, st.min);
    $("pdp-img").innerHTML = imagem(p, true) + tag(p);
    $("pdp-cat").textContent = p.categoria;
    $("pdp-name").textContent = p.nome;
    $("pdp-rating").innerHTML = `<b>${STAR} ${n1(p.estrelas)}</b> de 5${aval(p) ? ` · ${aval(p)} avaliações` : ""}`;
    $("pdp-de").textContent = p.de > p.por ? brl(p.de) : "";
    $("pdp-por").textContent = brl(p.por);
    $("pdp-terms").textContent = `${termos(p)} · ${p.frete} · à venda ${na(p.loja)}`;
    $("pdp-buy").href = link(p);
    $("pdp-buy").textContent = `Comprar ${na(p.loja)}`;

    const outras = (p.outras || []).slice().sort((a, b) => a.preco - b.preco);
    const top = Math.max(p.de, p.menor90 || 0, p.por, ...outras.map((o) => o.preco));
    const bar = (rot, v, cls) => `<div class="${cls || ""}"><span>${rot}</span><i style="width:${(v / top) * 100}%"></i><b>${brl(v)}</b></div>`;
    const comparou = outras.length
      ? `<p>Comparamos com ${outras.length === 1 ? "outra loja" : `outras ${outras.length} lojas`} hoje${maisCaras(p).length === outras.length ? `: aqui está o menor preço, ${brl(outras[0].preco - avista(p))} abaixo da segunda mais barata.` : maisCaras(p).length ? "." : ": há preço menor em loja com nota abaixo do nosso mínimo no Reclame Aqui, por isso indicamos esta."}</p>
       <div class="bars">${outras.map((o) => bar(`${o.loja}${D.lojas[o.loja] ? ` (RA ${n1(D.lojas[o.loja].nota)})` : ""}`, o.preco)).join("")}__AQUI__</div>` : "";
    const box = (el, ok, titulo, corpo) => { el.className = "why-box" + (ok ? "" : " fail"); el.innerHTML = `<h4>${titulo}</h4>${corpo}`; };
    box($("why-preco"), c.preco.ok, c.preco.ok ? "Preço bom" : "Preço comum",
      p.menor90 != null
        ? `<p>Hoje está ${pct(p)}% abaixo do preço de tabela e ${brl(p.menor90 - p.por)} abaixo do menor preço dos últimos 90 dias.</p>
       <div class="bars">${bar("Preço de tabela", p.de)}${bar("Menor em 90 dias", p.menor90)}${bar("Hoje", p.por, "now")}</div>`
        : `<p>${pct(p) > 0 ? `Hoje está ${pct(p)}% abaixo do preço de tabela da loja` : "Hoje está no preço de tabela da loja"}${p.pix ? `, e no Pix sai ${brl(p.por - p.pix)} mais barato` : ""}.${p.menor30 ? ` A ${p.loja} marca este como o menor preço dos últimos 30 dias.` : outras.length ? "" : " Não achamos este modelo em outra loja para comparar; preço de tabela pode estar inflado, então compare antes."}</p>
       <div class="bars">${p.de > p.por ? bar("Preço de tabela", p.de) : ""}${bar(p.pix ? "No cartão" : "Hoje", p.por, p.pix ? "" : "now")}${p.pix ? bar("No Pix", p.pix, "now") : ""}</div>
       ${comparou.replace("__AQUI__", bar(`${p.loja}, hoje`, avista(p), "now"))}`);
    box($("why-loja"), c.loja.ok, c.loja.ok ? "Loja confiável" : "Loja abaixo da nota",
      `<p>${p.loja} tem nota ${n1(l.nota)}, ${faixa(l.nota)}, no ${l.reclameAqui ? `<a href="${l.reclameAqui}" rel="noopener" target="_blank">Reclame Aqui</a>` : "Reclame Aqui"}${l.periodo ? `, de ${l.periodo}` : ""} (consultado em ${new Date(l.consultado + "T12:00").toLocaleDateString("pt-BR")}).</p>
       <div class="nums"><div><strong>${n1(l.nota)}</strong>nota</div><div><strong>${n1(l.resolvidas).replace(",0", "")}%</strong>resolvidas</div><div><strong>${String(l.voltaria).replace(".", ",")}%</strong>voltariam</div></div>`);
    box($("why-produto"), c.produto.ok, c.produto.ok ? "Produto aprovado" : "Poucas avaliações",
      `<p>Quem comprou deu ${n1(p.estrelas)} de 5${aval(p) ? `, em ${aval(p)} avaliações` : ""} ${na(p.notaDe || p.loja)}.${aval(p) ? "" : " A loja não mostra quantas avaliações são, então pedimos nota mais alta: 4,5 ou mais."}</p>
       <div class="nums"><div><strong>${n1(p.estrelas)}</strong>de 5</div>${aval(p) ? `<div><strong>${p.avaliacoes >= 1000 ? (p.avaliacoes / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : p.avaliacoes}</strong>avaliações</div>` : ""}<div><strong>${pct(p) || Math.round((1 - avista(p) / p.de) * 100)}%</strong>${pct(p) ? "de desconto" : "no Pix"}</div></div>`);

    if (!pdp.open) pdp.showModal();
    pdp.scrollTop = 0;
    if (!semHistorico) history.replaceState(null, "", "#produto=" + id);
  }
  pdp.addEventListener("close", () => history.replaceState(null, "", location.pathname));
  pdp.addEventListener("click", (e) => { if (e.target === pdp) pdp.close(); });
  const fromHash = () => { const m = location.hash.match(/^#produto=(.+)$/); if (m) abrir(decodeURIComponent(m[1]), true); };

  /* ---------- rodapé ---------- */
  $("foot-cats").innerHTML = D.categorias.map((c) => `<li><a href="#loja" data-cat="${c}">${c}</a></li>`).join("");
  $("foot-cats").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-cat]"); if (!a) return;
    st.cat = a.dataset.cat; st.ver = 24; drawCats(); render();
  });
  const at = new Date(D.atualizado);
  const hora = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const dia = at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  $("last-check").textContent = (dia === new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ? "hoje" : dia) + ", " + hora;
  if (D.analise) $("analise").textContent = `${D.analise.anuncios.toLocaleString("pt-BR")} anúncios lidos em ${D.analise.lojas} lojas; ${D.produtos.length} passaram.`;
  $("city").textContent = D.cidade;
  document.querySelectorAll('a[href^="https://chat.whatsapp.com"]').forEach((a) => (a.href = D.whatsapp));
  const mail = $("mail");
  mail.textContent = D.email;
  mail.href = `mailto:${D.email}?subject=${encodeURIComponent("Sugestão para o Confere.")}`;

  /* ---------- movimento ---------- */
  function stagger(els) { els.forEach((el, i) => setTimeout(() => el.classList.add("is-in"), 80 + Math.min(i, 12) * 60)); }

  if (matchMedia("(max-width: 1080px)").matches) $("filtros-box").open = false;
  drawCats();
  render();
  fromHash();
})();
