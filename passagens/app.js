/* Rasante. · monta a página a partir do voos.js (escrito pelo robô) */
(() => {
  const D = window.RASANTE;
  const $ = (s) => document.querySelector(s);
  const real = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const pct = (x) => Math.round(x * 100) + "%";
  const dataBr = (d, longa) => new Date(d + "T12:00").toLocaleDateString("pt-BR", longa ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "2-digit", month: "short" });
  const link = (dest, data) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${dest} from ${D.origem.iata} on ${data} oneway`)}&curr=BRL&hl=pt-BR&gl=BR`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (!D) { $("#hero").innerHTML = `<p class="hero-vazio">A primeira coleta ainda não rodou.</p>`; return; }
  const limite = new Date(); limite.setDate(limite.getDate() + 3);
  const hojeIso = limite.toISOString().slice(0, 10);
  const destinos = D.destinos.map((d) => ({ ...d, dias: d.dias.split(" ").map((x) => { const [data, p] = x.split(":"); return [data, Number(p)]; }).filter(([data]) => data >= new Date().toISOString().slice(0, 10)) }));

  $("#origem").textContent = `${D.origem.cidade} (${D.origem.iata})`;
  $("#atualizado").textContent = "conferido " + new Date(D.atualizado).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  $("#regra").textContent = pct(D.alertaDesconto);

  const vooTxt = (d) => d.detalhe && d.detalhe.voo && d.melhor && d.detalhe.data === d.melhor.data
    ? `${d.detalhe.voo.cia} · ${d.detalhe.voo.saida}–${d.detalhe.voo.chegada} · ${d.detalhe.voo.paradas}` : "";

  /* ---------- destaque ---------- */
  const top = destinos.filter((d) => d.melhor).sort((a, b) => b.desconto - a.desconto)[0];
  if (top) {
    $("#hero").innerHTML = `
      <div>
        <p class="hero-rota">${esc(D.origem.cidade)} → ${top.uf} · a mais abaixo do preço agora</p>
        <h1 id="hero-titulo">${esc(top.cidade)}</h1>
        <p class="hero-data">${dataBr(top.melhor.data, true)}</p>
      </div>
      <div class="hero-lado">
        <span class="selo">${pct(top.desconto)} abaixo do normal</span>
        <p class="hero-preco">${real(top.melhor.preco)}</p>
        <p class="hero-voo">Normal da rota: ${real(top.normal)}${vooTxt(top) ? "<br>" + esc(vooTxt(top)) : ""}</p>
        <a class="btn" href="${link(top.busca || top.iata, top.melhor.data)}" target="_blank" rel="noopener">Ver o voo</a>
      </div>`;
  }

  /* ---------- filtros ---------- */
  const regioes = ["Todas", ...new Set(destinos.map((d) => d.regiao))];
  let regiao = "Todas";
  $("#regioes").innerHTML = regioes.map((r) => `<button type="button" aria-pressed="${r === regiao}">${r}</button>`).join("");
  $("#regioes").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    regiao = b.textContent; $("#regioes").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); desenhar();
  });
  $("#so-ofertas").addEventListener("change", desenhar);
  $("#ordem").addEventListener("change", desenhar);

  /* ---------- lista ---------- */
  function grafico(d) {
    if (!d.dias.length) return "";
    const max = Math.max(...d.dias.map((x) => x[1])), min = Math.min(...d.dias.map((x) => x[1]));
    let mesAnt = "", meses = "";
    const barras = d.dias.map(([data, p], i) => {
      const h = 12 + 88 * (p - min) / Math.max(max - min, 1);
      const desc = 1 - p / d.normal, cls = desc >= D.alertaDesconto && data >= hojeIso ? "of" : p <= d.normal ? "ok" : "";
      const mes = data.slice(0, 7);
      if (mes !== mesAnt) { mesAnt = mes; meses += `<span class="mes" style="left:${(100 * i / d.dias.length).toFixed(2)}%">${new Date(data + "T12:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>`; }
      return `<button type="button" class="${cls}" style="height:${h.toFixed(1)}%" data-d="${data}" data-p="${p}" data-i="${esc(d.busca || d.iata)}" aria-label="${dataBr(data)}, ${real(p)}"></button>`;
    }).join("");
    return `<div class="dias-wrap"><div class="dias" data-normal="${d.normal}">${barras}${meses}</div></div>`;
  }

  function desenhar() {
    const so = $("#so-ofertas").checked, ordem = $("#ordem").value;
    const lista = destinos.filter((d) => (regiao === "Todas" || d.regiao === regiao) && (!so || d.ofertas > 0) && d.melhor)
      .sort(ordem === "preco" ? (a, b) => a.melhor.preco - b.melhor.preco : ordem === "nome" ? (a, b) => a.cidade.localeCompare(b.cidade) : (a, b) => b.desconto - a.desconto);
    $("#lista").innerHTML = lista.length ? lista.map((d) => `
      <li>
        <div class="cid">${esc(d.cidade)}<small>${d.iata} · ${d.uf}</small><span class="cid-voo">${dataBr(d.melhor.data)}${vooTxt(d) ? " · " + esc(vooTxt(d)) : ""}</span></div>
        <p class="preco">${real(d.melhor.preco)}<span>${d.desconto >= 0.05 ? `<b class="abaixo">${pct(d.desconto)} abaixo</b> · ` : ""}normal ${real(d.normal)}</span></p>
        ${grafico(d)}
        <a class="ir" href="${link(d.busca || d.iata, d.melhor.data)}" target="_blank" rel="noopener">Ver voo →</a>
      </li>`).join("") : `<li class="vazio">Nenhum destino com esse filtro agora.</li>`;
  }
  desenhar();

  /* ---------- dia: dica ao passar, abre o voo ao tocar ---------- */
  const dica = $("#dica");
  const mostrar = (b) => {
    const r = b.getBoundingClientRect(), normal = Number(b.parentElement.dataset.normal), p = Number(b.dataset.p), desc = 1 - p / normal;
    dica.textContent = `${dataBr(b.dataset.d)} · ${real(p)}${desc >= 0.05 ? ` · ${pct(desc)} abaixo` : ""}`;
    dica.style.left = Math.min(Math.max(r.left + r.width / 2, 110), innerWidth - 110) + "px"; dica.style.top = r.top + "px"; dica.hidden = false;
  };
  $("#lista").addEventListener("pointerover", (e) => { const b = e.target.closest(".dias button"); if (b) mostrar(b); });
  $("#lista").addEventListener("focusin", (e) => { const b = e.target.closest(".dias button"); if (b) mostrar(b); });
  $("#lista").addEventListener("pointerout", () => (dica.hidden = true));
  $("#lista").addEventListener("focusout", () => (dica.hidden = true));
  addEventListener("scroll", () => (dica.hidden = true), { passive: true });
  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest(".dias button"); if (!b) return;
    window.open(link(b.dataset.i, b.dataset.d), "_blank", "noopener");
  });
})();
