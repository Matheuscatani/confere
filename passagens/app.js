/* Rasante · monta a página a partir do voos.js (escrito pelo robô) */
(() => {
  const D = window.RASANTE;
  const $ = (s) => document.querySelector(s);
  const real = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const pct = (x) => Math.round(x * 100) + "%";
  const dt = (d) => new Date(d + "T12:00");
  const dataCurta = (d) => dt(d).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  const nomeMes = (m) => dt(m + "-01").toLocaleDateString("pt-BR", { month: "long" });
  const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const link = (d, data) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${d.busca || d.iata} from ${D.origem.iata} on ${data} oneway`)}&curr=BRL&hl=pt-BR&gl=BR`;
  const foto = (iata) => `<img src="fotos/${iata}.jpg" alt="" loading="lazy" onerror="this.remove()">`;

  if (!D) { $("#promos").innerHTML = `<p class="vazio">A primeira coleta ainda não rodou.</p>`; return; }

  const iso = (d) => d.toISOString().slice(0, 10);
  const minimo = new Date(); minimo.setDate(minimo.getDate() + 3);
  const LIMITE = iso(minimo), REGRA = D.alertaDesconto;
  const destinos = D.destinos.map((d) => ({ ...d, dias: d.dias.split(" ").map((x) => { const [data, p] = x.split(":"); return [data, Number(p)]; }).filter(([data]) => data >= LIMITE) }))
    .filter((d) => d.dias.length);
  const meses = [...new Set(destinos.flatMap((d) => d.dias.map(([data]) => data.slice(0, 7))))].sort();
  const regioes = ["Centro-Oeste", "Nordeste", "Norte", "Sudeste", "Sul"].filter((r) => destinos.some((d) => d.regiao === r));

  /* ---------- cabeçalho e busca ---------- */
  $("#origem").textContent = `${D.origem.cidade} (${D.origem.iata})`;
  /* ao lado de Goiânia, a hora da última conferência (com o dia, se não for hoje) */
  const conferido = new Date(D.atualizado), hora = conferido.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = conferido.toDateString() === new Date().toDateString() ? "" : conferido.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " ";
  document.querySelector(".saida").insertAdjacentHTML("beforeend", `<span class="hora">&nbsp;· <span class="longo">conferido&nbsp;</span>${dia}às ${hora}</span>`);
  $("#atualizado").textContent = "Preços conferidos em " + new Date(D.atualizado).toLocaleString("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  $("#n-destinos").textContent = destinos.length + " destinos";
  $("#regra").textContent = pct(REGRA);
  document.querySelector(".hero").style.setProperty("--capa", `url("fotos/${D.origem.iata}.jpg")`);
  $("#cidades").innerHTML = destinos.map((d) => `<option value="${esc(d.cidade)}">`).join("");
  $("#f-mes").innerHTML += meses.map((m) => `<option value="${m}">${nomeMes(m)} de ${m.slice(0, 4)}</option>`).join("");
  $("#f-regiao").innerHTML += regioes.map((r) => `<option>${r}</option>`).join("");
  $("#abas").innerHTML = ["", ...regioes].map((r) => `<button type="button" role="tab" data-r="${r}" aria-selected="${!r}">${r || "Todos"}</button>`).join("");

  const filtro = () => ({ texto: semAcento($("#f-texto").value.trim()), mes: $("#f-mes").value, regiao: $("#f-regiao").value, ordem: $("#ordem").value });

  /* o menor preço de cada destino dentro da data escolhida */
  function melhores(f) {
    return destinos.filter((d) => (!f.regiao || d.regiao === f.regiao) && (!f.texto || semAcento(d.cidade + " " + d.iata + " " + d.uf).includes(f.texto)))
      .map((d) => {
        const dias = f.mes ? d.dias.filter(([data]) => data.startsWith(f.mes)) : d.dias;
        if (!dias.length) return null;
        const [data, preco] = dias.reduce((m, x) => (x[1] < m[1] ? x : m));
        const voo = d.detalhe && d.detalhe.data === data && d.detalhe.voo ? d.detalhe.voo : null;
        return { d, data, preco, desconto: Math.max(0, 1 - preco / d.normal), dias, voo, ofertas: dias.filter(([, p]) => 1 - p / d.normal >= REGRA).length };
      }).filter(Boolean);
  }
  const ordenar = (lista, ordem) => lista.sort(ordem === "preco" ? (a, b) => a.preco - b.preco : ordem === "nome" ? (a, b) => a.d.cidade.localeCompare(b.d.cidade) : (a, b) => b.desconto - a.desconto || a.preco - b.preco);
  const vooTxt = (v) => (v ? `${v.cia} · ${v.saida} · ${v.paradas}` : "");

  /* ---------- promoções ---------- */
  function promos(lista) {
    const top = lista.filter((x) => x.desconto >= REGRA).sort((a, b) => b.desconto - a.desconto).slice(0, 8);
    $("#promos").innerHTML = top.length ? top.map((x) => `
      <button class="promo" type="button" data-i="${x.d.iata}">
        ${foto(x.d.iata)}
        <span class="selo">-${pct(x.desconto)}</span>
        ${x.ofertas > 1 ? `<span class="selo-g">${x.ofertas} datas baratas</span>` : ""}
        <span class="uf">${D.origem.cidade} → ${x.d.uf}</span>
        <h3>${esc(x.d.cidade)}</h3>
        <span class="de">de <s>${real(x.d.normal)}</s> por</span>
        <span class="por"><small>R$</small> ${Math.round(x.preco).toLocaleString("pt-BR")}</span>
        <span class="quando">${dataCurta(x.data)}${x.voo ? " · " + esc(x.voo.cia) : ""}</span>
        <span class="ver">Ver datas e preços</span>
      </button>`).join("") : `<p class="vazio">Nenhuma passagem ${pct(REGRA)} abaixo do normal com esse filtro agora. Os preços são conferidos de hora em hora.</p>`;
  }

  /* ---------- cartões ---------- */
  function cartoes(lista, f) {
    const barras = (x) => {
      const ps = x.dias.map(([, p]) => p), max = Math.max(...ps), min = Math.min(...ps);
      const passo = Math.max(1, Math.ceil(x.dias.length / 60));
      return x.dias.filter((_, i) => i % passo === 0).map(([, p]) => {
        const cls = 1 - p / x.d.normal >= REGRA ? "of" : p <= x.d.normal ? "ok" : "";
        return `<i class="${cls}" style="height:${(15 + 85 * (p - min) / Math.max(max - min, 1)).toFixed(0)}%"></i>`;
      }).join("");
    };
    $("#dest-sub").textContent = f.mes ? `O menor preço de cada destino em ${nomeMes(f.mes)}.` : "O menor preço de cada destino nos próximos 6 meses.";
    $("#cards").innerHTML = lista.length ? ordenar(lista, f.ordem).map((x) => `
      <button class="card" type="button" data-i="${x.d.iata}">
        <div class="card-foto">${foto(x.d.iata)}</div>
        <div class="card-corpo">
          <div class="card-cid"><h3>${esc(x.d.cidade)}</h3><span class="uf">${x.d.iata} · ${x.d.uf}</span></div>
          <span class="apartir">Só ida a partir de</span>
          <span class="preco"><small>R$</small> ${Math.round(x.preco).toLocaleString("pt-BR")}</span>
          ${x.desconto >= 0.05 ? `<span class="chip chip-g">↓ ${pct(x.desconto)} abaixo do normal</span>` : `<span class="chip chip-n">Preço normal ${real(x.d.normal)}</span>`}
          <span class="quando">${dataCurta(x.data)}</span>
          ${x.voo ? `<span class="voo">${esc(vooTxt(x.voo))}</span>` : ""}
          <div class="barras" aria-hidden="true">${barras(x)}</div>
          <span class="btn btn-claro">Ver calendário</span>
        </div>
      </button>`).join("") : `<p class="vazio">Nenhum destino com essa busca. Tente outra cidade ou data.</p>`;
  }

  function desenhar() {
    const f = filtro(), lista = melhores(f);
    promos(lista); cartoes(lista, f);
    $("#abas").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.r === f.regiao));
  }

  ["#f-texto", "#f-mes", "#f-regiao", "#ordem"].forEach((s) => $(s).addEventListener("input", desenhar));
  $("#abas").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("#f-regiao").value = b.dataset.r; desenhar(); });
  $("#buscar").addEventListener("click", () => { desenhar(); $("#promocoes").scrollIntoView({ behavior: "smooth" }); });
  desenhar();

  /* ---------- calendário de preços ---------- */
  const cal = $("#cal");
  let atual = null;
  function abrir(iata) {
    const d = destinos.find((x) => x.iata === iata); if (!d) return;
    atual = d;
    const ms = [...new Set(d.dias.map(([data]) => data.slice(0, 7)))];
    const minMes = Object.fromEntries(ms.map((m) => [m, Math.min(...d.dias.filter(([x]) => x.startsWith(m)).map(([, p]) => p))]));
    const [bd, bp] = d.dias.reduce((m, x) => (x[1] < m[1] ? x : m));
    $("#cal-foto").innerHTML = foto(d.iata);
    $("#cal-rota").textContent = `${D.origem.cidade} (${D.origem.iata}) → ${d.iata} · só ida`;
    $("#cal-titulo").textContent = d.cidade;
    $("#cal-resumo").innerHTML = `<span class="chip chip-g">Menor: ${real(bp)} em ${dataCurta(bd)}</span><span class="chip chip-n">Normal da rota: ${real(d.normal)}</span>` +
      (d.detalhe && d.detalhe.cias && d.detalhe.cias.length ? `<span class="chip chip-n">${esc(d.detalhe.cias.join(", "))}</span>` : "");
    const mesIni = $("#f-mes").value && ms.includes($("#f-mes").value) ? $("#f-mes").value : bd.slice(0, 7);
    $("#cal-meses").innerHTML = ms.map((m) => `<button type="button" role="tab" data-m="${m}" aria-selected="${m === mesIni}">${nomeMes(m)}<small>desde ${real(minMes[m])}</small></button>`).join("");
    mes(mesIni);
    cal.showModal();
  }
  function mes(m) {
    const d = atual, precos = Object.fromEntries(d.dias.filter(([x]) => x.startsWith(m)));
    $("#cal-meses").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.m === m));
    const [a, mm] = m.split("-").map(Number), ini = new Date(a, mm - 1, 1).getDay(), total = new Date(a, mm, 0).getDate();
    let h = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((s) => `<span class="sem">${s}</span>`).join("") + "<span></span>".repeat(ini);
    for (let i = 1; i <= total; i++) {
      const data = `${m}-${String(i).padStart(2, "0")}`, p = precos[data];
      if (!p) { h += `<span class="dia vazio-d"><b>${i}</b><span>–</span></span>`; continue; }
      const desc = 1 - p / d.normal, cls = desc >= REGRA ? "of" : p <= d.normal ? "ok" : "alto";
      h += `<button type="button" class="dia ${cls}" data-d="${data}" aria-label="${dataCurta(data)}, ${real(p)}"><b>${i}</b><span>${real(p)}</span></button>`;
    }
    $("#cal-grade").innerHTML = h;
  }
  document.addEventListener("click", (e) => { const c = e.target.closest(".promo, .card"); if (c) abrir(c.dataset.i); });
  $("#cal-meses").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) mes(b.dataset.m); });
  $("#cal-grade").addEventListener("click", (e) => { const b = e.target.closest(".dia[data-d]"); if (b) window.open(link(atual, b.dataset.d), "_blank", "noopener"); });
  $("#cal-fechar").addEventListener("click", () => cal.close());
  cal.addEventListener("click", (e) => { if (e.target === cal) cal.close(); });
})();
