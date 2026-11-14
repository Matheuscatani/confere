/* Rasante · página de vendas: o e-mail de exemplo e a faixa de destinos saem da amostra do servidor (as 5 maiores ofertas da última coleta) */
(() => {
  /* Links do pagamento na Kiwify (produto Rasante, uma oferta para cada plano). Vazios, os botões levam para os planos. */
  const CHECKOUT = { anual: "https://pay.kiwify.com.br/cllMDNS", vitalicio: "https://pay.kiwify.com.br/M8Yt5l7" };

  const $ = (s) => document.querySelector(s);
  const real = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const dataLonga = (d) => new Date(d + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (CHECKOUT.anual) $("#comprar-anual").href = CHECKOUT.anual;
  if (CHECKOUT.vitalicio) { $("#comprar-vitalicio").href = CHECKOUT.vitalicio; $("#comprar-final").href = CHECKOUT.vitalicio; }

  const D = window.RASANTE;
  if (!D) return;
  const origem = D.origem.cidade;
  const linkVoo = (d) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${d.busca || d.iata} from ${D.origem.iata} on ${d.melhor.data} oneway`)}&curr=BRL&hl=pt-BR&gl=BR`;
  const ofertas = D.destinos.filter((d) => d.melhor && d.desconto >= 0.2).sort((a, b) => b.desconto - a.desconto).slice(0, 5);

  /* ---------- o e-mail ---------- */
  const quando = new Date(D.atualizado);
  $("#alerta-sub").textContent = `Ofertas reais da coleta de ${quando.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}, às ${quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Toque num destino.`;
  $("#nomes").innerHTML = ofertas.map((d, i) =>
    `<button type="button" role="tab" aria-selected="${i === 0}" aria-controls="email" data-i="${i}">${esc(d.cidade)}<small>-${Math.round(d.desconto * 100)}%</small></button>`).join("");

  function email(d) {
    const voo = d.detalhe && d.detalhe.data === d.melhor.data && d.detalhe.voo ? d.detalhe.voo : null;
    return `
      <div class="email-cab">
        <p><b>De</b> Rasante · alertas</p>
        <p><b>Para</b> você</p>
        <p class="email-assunto">${esc(origem)} → ${esc(d.cidade)} por ${real(d.melhor.preco)} (${Math.round(d.desconto * 100)}% abaixo do normal)</p>
      </div>
      <div class="email-corpo">
        <img class="email-foto" src="fotos/${d.iata}.jpg" alt="${esc(d.cidade)}" width="440" height="248">
        <h4>${esc(d.cidade)} (${d.iata})</h4>
        <div class="email-linha">
          <span class="email-preco">${real(d.melhor.preco)}</span>
          <span class="email-desc">${Math.round(d.desconto * 100)}% abaixo</span>
        </div>
        <p class="email-meta">Preço normal da rota: ${real(d.normal)}</p>
        <p class="email-meta">${dataLonga(d.melhor.data)}${voo ? ` · ${esc(voo.cia)} · ${voo.saida} · ${esc(voo.paradas)}` : ""}</p>
        ${d.ofertas > 1 ? `<p class="email-meta">E mais ${d.ofertas - 1} datas baratas para ${esc(d.cidade)}.</p>` : ""}
        <a class="email-botao" href="${linkVoo(d)}" target="_blank" rel="noopener">Ver o voo</a>
      </div>
      <p class="email-pe">Só ida, 1 adulto, com taxas, no momento da coleta. Passagem barata some rápido.</p>`;
  }
  const caixa = $("#email");
  caixa.innerHTML = email(ofertas[0]);
  $("#nomes").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $("#nomes").querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x === b));
    caixa.classList.add("trocando");
    setTimeout(() => { caixa.innerHTML = email(ofertas[b.dataset.i]); caixa.classList.remove("trocando"); }, 200);
  });

  /* ---------- a faixa com os destinos ---------- */
  const nomes = D.destinos.map((d) => d.cidade).sort((a, b) => a.localeCompare(b));
  const volta = nomes.map((n) => `<span>${esc(n)}</span>`).join("");
  $("#trilho").innerHTML = volta + volta;
  $("#faixa-nota").textContent = `Os ${nomes.length} destinos que a equipe confere saindo de ${origem}, de ${nomes[0]} a ${nomes[nomes.length - 1]}, todos os dias.`;

  /* ---------- a conta do plano ---------- */
  const top = ofertas[0];
  if (top) $("#conta").textContent = `Hoje, uma passagem para ${top.cidade} no dia certo sai ${real(top.normal - top.melhor.preco)} mais barata que o normal. O plano de um ano custa R$ 29,99.`;
})();

/* entra uma vez quando aparece na tela; nunca deixa conteúdo escondido */
(() => {
  const alvos = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) { alvos.forEach((el) => el.classList.add("is-in")); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
  alvos.forEach((el) => io.observe(el));
  addEventListener("load", () => setTimeout(() => alvos.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add("is-in"); }), 2500));
})();

/* dúvidas: uma ficha aberta por vez */
document.querySelectorAll(".ficha").forEach((f, _, todas) => f.addEventListener("toggle", () => { if (f.open) todas.forEach((o) => o !== f && (o.open = false)); }));
