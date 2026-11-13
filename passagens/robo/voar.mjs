/* Rasante. · o robô das passagens.
   Para cada destino, lê no Google Voos o preço mais barato de cada dia saindo de Goiânia
   (LATAM, GOL, Azul e as outras que voam a rota), compara com o preço normal da rota,
   reescreve o voos.js, publica o site e manda e-mail quando aparece passagem muito abaixo do normal.

   node passagens/robo/voar.mjs               coleta tudo, atualiza o site e manda os alertas
   node passagens/robo/voar.mjs --teste       só 3 destinos, sem publicar e sem e-mail
   node passagens/robo/voar.mjs --local      coleta tudo e atualiza o voos.js, sem publicar e sem e-mail
   node passagens/robo/voar.mjs --so SSA,REC  relê só esses destinos e reaproveita o resto da última coleta
   node passagens/robo/voar.mjs --agendado    para agendar no Mac (hoje quem agenda é o GitHub, de hora em hora) */
import { readFileSync, writeFileSync, existsSync, appendFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirChrome, fecharChrome, novaAba, espera } from "../../robo/chrome.mjs";
import { enviarEmail } from "./email.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url)), SITE = join(AQUI, ".."), RAIZ = join(SITE, "..");
const arg = (a) => process.argv.includes(a);
const TESTE = arg("--teste"), LOCAL = TESTE || arg("--local");
const cfg = JSON.parse(readFileSync(join(AQUI, "config.json"), "utf8"));
const ULTIMA = join(AQUI, "ultima.json"), HIST = join(AQUI, "historico.json"), AVISADOS = join(AQUI, "avisados.json");
const SO = arg("--so") ? process.argv[process.argv.indexOf("--so") + 1].split(",").map((x) => x.trim().toUpperCase()) : null;
const lerJson = (f, padrao) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return padrao; } };
const log = (...a) => { const l = `[${new Date().toLocaleString("pt-BR")}] ${a.join(" ")}`; console.log(l); try { appendFileSync(join(AQUI, "robo.log"), l + "\n"); } catch {} };
const naPagina = (fn, ...args) => `return await (${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")});`;
const iso = (d) => d.toISOString().slice(0, 10);
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mediana = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const real = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const dataBr = (d) => new Date(d + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

/* Agendado no Mac (não usado hoje: o GitHub roda de hora em hora): duas janelas por dia, 07:00 e 19:00. */
if (arg("--agendado")) {
  const ult = lerJson(ULTIMA, {}).quando, agora = new Date();
  const marco = new Date(agora); marco.setMinutes(0, 0, 0);
  marco.setHours(agora.getHours() >= 19 ? 19 : agora.getHours() >= 7 ? 7 : -5);
  if (ult && new Date(ult) >= marco) process.exit(0);
  /* o Chrome do robô é o mesmo do Confere.: se ele estiver no meio da coleta, espera terminar */
  for (let i = 0; i < 120; i++) {
    try { await fetch("http://127.0.0.1:9333/json/version"); } catch { break; }
    await espera(60000);
  }
}

export const linkVoo = (dest, data) =>
  `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${dest} from ${cfg.origem.iata} on ${data} oneway`)}&curr=BRL&hl=pt-BR&gl=BR`;

/* ---------- 1. Calendário de preços (roda dentro da página do Google Voos) ---------- */
async function calendario(avancos) {
  const z = (ms) => new Promise((r) => setTimeout(r, ms));
  const campo = document.querySelector('input[aria-label*="Partida"]');
  if (!campo) throw new Error(/não é um robô|unusual traffic|captcha/i.test(document.body.innerText) ? "BLOQUEIO" : "página sem campo de data");
  campo.click(); await z(4500);
  const ler = () => [...document.querySelectorAll("[role=gridcell]")].map((c) => {
    const g = c.querySelector("[data-gs]"), m = g && (g.getAttribute("aria-label") || "").match(/([\d.]+) Reais/);
    return m ? [c.dataset.iso, Number(m[1].replace(/\./g, ""))] : null;
  }).filter(Boolean);
  const avancar = [...document.querySelectorAll("button,[role=button]")].find((b) => b.getAttribute("aria-label") === "Avançar");
  /* cada "Avançar" carrega mais meses; espera os preços aparecerem antes do próximo clique */
  for (let k = 0; k < avancos && avancar; k++) {
    const antes = ler().length; avancar.click();
    for (let t = 0; t < 12 && ler().length <= antes; t++) await z(700);
    await z(800);
  }
  return ler();
}

/* ---------- 2. Detalhe de um dia: companhia, horário, paradas e o que o Google acha do preço ---------- */
async function detalhe() {
  const z = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20 && /Carregando resultados|Buscando resultados/.test(document.body.innerText); i++) await z(700);
  const texto = document.body.innerText;
  const nivel = (texto.match(/Os preços estão (baixos|normais|altos)/) || [])[1] || null;
  const voos = [...document.querySelectorAll("li")].map((li) => {
    const t = li.innerText, preco = t.match(/R\$\s?([\d.]+)/), hor = t.match(/(\d{2}:\d{2})\s*\n?\s*–\s*\n?\s*(\d{2}:\d{2}(?:\+\d)?)/);
    if (!preco || !hor) return null;
    const linhas = t.split("\n").map((l) => l.trim()).filter(Boolean);
    const iCia = linhas.findIndex((l) => /^(LATAM|Gol|GOL|Azul|Voepass|Passaredo|Sideral|Map|Abra|TAP|Copa)/.test(l));
    return {
      preco: Number(preco[1].replace(/\./g, "")), saida: hor[1], chegada: hor[2],
      cia: iCia >= 0 ? linhas[iCia].replace(/Operado por.*$/, "").trim() : (linhas.find((l) => /^[A-Z][a-zA-Z ]+$/.test(l) && !/^(Sem escalas|Parada)/.test(l)) || ""),
      duracao: (t.match(/\d+\s?h(?:\s?\d+\s?min)?/) || [""])[0], paradas: (t.match(/Sem escalas|\d+ paradas?/) || [""])[0]
    };
  }).filter(Boolean).sort((a, b) => a.preco - b.preco);
  const cias = [...new Set(voos.map((v) => v.cia).filter(Boolean))];
  return { nivel, voo: voos[0] || null, cias };
}

async function lerDestino(aba, d) {
  const url = linkVoo(d.busca, iso(somaDias(new Date(), 7)));
  /* menos de ~4 meses de preços deixa o "preço normal" torto: tenta de novo e fica com a leitura mais longa.
     Mês com preços em outra moeda (o servidor do GitHub fica nos EUA e às vezes o Google manda um mês em dólar
     marcado como real): a leitura não serve, tenta de novo. */
  const esperado = 30 * (cfg.meses - 2);
  let dias = [], erro = "", estranhos = [];
  for (let t = 0; t < 3 && (dias.length < esperado || estranhos.length); t++) {
    let lidos = [];
    try { await aba.ir(url); await espera(2500); lidos = await aba.js(naPagina(calendario, cfg.meses - 1), 120000); erro = ""; }
    catch (e) { erro = e.message; }
    const ruins = mesesEmOutraMoeda(lidos);
    if (ruins.length) log(`${d.cidade} (${d.iata}): mês ${ruins.join(", ")} veio com preços de outra moeda; lendo de novo`);
    if (!dias.length || ruins.length < estranhos.length || (ruins.length === estranhos.length && lidos.length > dias.length)) { dias = lidos; estranhos = ruins; }
    if (dias.length < esperado || estranhos.length) await espera(/BLOQUEIO/.test(erro) ? 90000 : 6000);
  }
  /* se nem lendo de novo veio certo, o mês em outra moeda fica de fora */
  if (estranhos.length) { dias = dias.filter(([data]) => !estranhos.includes(data.slice(0, 7))); log(`${d.cidade} (${d.iata}): mês ${estranhos.join(", ")} descartado (moeda errada)`); }
  if (dias.length < 20) throw new Error(erro || `só ${dias.length} dias com preço`);
  return dias;
}

/* mês cuja mediana fica abaixo de 30% da mediana da rota: é a mesma passagem em dólar (R$ 503 ≈ US$ 89), não promoção */
function mesesEmOutraMoeda(dias) {
  if (dias.length < 40) return [];
  const med = mediana(dias.map(([, p]) => p));
  return [...new Set(dias.map(([data]) => data.slice(0, 7)))]
    .filter((m) => { const ps = dias.filter(([x]) => x.startsWith(m)).map(([, p]) => p); return ps.length >= 7 && mediana(ps) < med * 0.3; });
}

/* ---------- 3. Preço normal e ofertas ---------- */
/* Preço muito baixo pode ser uma tarifa extraordinária de verdade ou uma leitura com defeito
   (ex.: Vitória em maio a "R$ 89" quando o voo custava R$ 503: o calendário veio em outra moeda).
   Por isso nada é descartado na hora: o preço suspeito é conferido na página do voo daquele dia. */
function suspeitos(d) {
  const med = mediana(d.dias.map(([, p]) => p)), limite = iso(somaDias(new Date(), cfg.diasMinimos));
  return d.dias.filter(([data, p]) => data >= limite && p < med * cfg.suspeito).sort((x, y) => x[1] - y[1]);
}

function analisarUm(d, hist) {
  const hoje = iso(new Date()), limite = iso(somaDias(new Date(), cfg.diasMinimos)), corte = iso(somaDias(new Date(), -30));
  const precos = d.dias.map(([, p]) => p);
  const h = (hist[d.iata] = (hist[d.iata] || []).filter((x) => x.d >= corte && x.d !== hoje));
  h.push({ d: hoje, med: mediana(precos), min: Math.min(...precos) });
  /* preço normal: a mediana dos dias, nas coletas dos últimos 30 dias */
  d.normal = mediana(h.map((x) => x.med));
  d.menorHistorico = Math.min(...h.map((x) => x.min));
  const validos = d.dias.filter(([data]) => data >= limite);
  const [data, preco] = validos.reduce((m, x) => (x[1] < m[1] ? x : m), validos[0] || [null, Infinity]);
  d.melhor = data ? { data, preco, conferido: !!(d.conferidos && d.conferidos.has(data)) } : null;
  d.desconto = d.melhor ? Math.max(0, 1 - preco / d.normal) : 0;
  d.ofertas = validos.filter(([, p]) => 1 - p / d.normal >= cfg.alertaDesconto && d.normal - p >= cfg.economiaMinima)
    .map(([data, preco]) => ({ data, preco, desconto: 1 - preco / d.normal }));
}
const analisar = (destinos, hist) => { destinos.forEach((d) => analisarUm(d, hist)); return destinos; };

/* ---------- 4. Escreve o voos.js ---------- */
function escrever(destinos, resumo) {
  const dados = {
    atualizado: new Date().toISOString(), origem: cfg.origem, alertaDesconto: cfg.alertaDesconto, resumo,
    destinos: destinos.sort((a, b) => b.desconto - a.desconto).map((d) => ({
      iata: d.iata, busca: d.busca, cidade: d.cidade, uf: d.uf, regiao: d.regiao, normal: d.normal, menorHistorico: d.menorHistorico,
      melhor: d.melhor, desconto: Math.round(d.desconto * 100) / 100, ofertas: d.ofertas.length, detalhe: d.detalhe || null,
      dias: d.dias.map(([data, p]) => data + ":" + p).join(" ")
    }))
  };
  const cab = `/*\n  Rasante. · passagens baratas saindo de ${cfg.origem.cidade}\n  ---------------------------------------------------------------\n  NÃO EDITE ESTE ARQUIVO: o robô reescreve ele de hora em hora.\n  As regras ficam em passagens/robo/config.json.\n\n  Última coleta: ${new Date().toLocaleString("pt-BR")}\n  ${resumo.destinos} destinos · ${resumo.dias} dias com preço · ${resumo.ofertas} passagens muito abaixo do normal\n*/\n\n`;
  writeFileSync(join(SITE, "voos.js"), cab + "window.RASANTE = " + JSON.stringify(dados, null, 1) + ";\n");
}

/* ---------- 5. Alerta por e-mail: só o que ainda não foi avisado (ou que caiu mais 5%) ---------- */
function alertar(destinos) {
  const avisados = lerJson(AVISADOS, {}), hoje = iso(new Date()), novos = [];
  for (const k of Object.keys(avisados)) if (k.split("|")[1] < hoje) delete avisados[k];
  for (const d of destinos) {
    const nova = d.ofertas.filter((o) => !avisados[d.iata + "|" + o.data] || o.preco <= avisados[d.iata + "|" + o.data] * 0.95);
    if (!nova.length) continue;
    /* só vai para o e-mail o preço que passou pelo duplo check na página do voo */
    const conferidas = nova.filter((o) => d.conferidos && d.conferidos.has(o.data));
    if (!conferidas.length) { log(`E-mail: ${d.cidade} ficou fora (preço não conferido na página do voo)`); continue; }
    const melhor = conferidas.reduce((m, o) => (o.preco < m.preco ? o : m));
    novos.push({ d, melhor, outras: nova.length - 1 });
    nova.forEach((o) => (avisados[d.iata + "|" + o.data] = o.preco));
  }
  if (!novos.length) { log("E-mail: nenhuma passagem nova muito abaixo do normal."); return; }
  novos.sort((a, b) => b.melhor.desconto - a.melhor.desconto);
  const p = novos[0];
  const assunto = `✈ ${cfg.origem.cidade} → ${p.d.cidade} por ${real(p.melhor.preco)} (${Math.round(p.melhor.desconto * 100)}% abaixo do normal)` + (novos.length > 1 ? ` + ${novos.length - 1} destino(s)` : "");
  const linhas = novos.map(({ d, melhor, outras }) => {
    const det = d.detalhe && d.detalhe.data === melhor.data && d.detalhe.voo ? `<br><span style="color:#555">${d.detalhe.voo.cia} · ${d.detalhe.voo.saida}–${d.detalhe.voo.chegada} · ${d.detalhe.voo.paradas}</span>` : "";
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #ddd"><b style="font-size:17px">${d.cidade} (${d.iata})</b><br>${dataBr(melhor.data)}${outras ? ` · e mais ${outras} data(s) barata(s)` : ""}${det}</td>
      <td style="padding:14px 0;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap"><b style="font-size:20px">${real(melhor.preco)}</b><br><span style="color:#b3261e">${Math.round(melhor.desconto * 100)}% abaixo</span> · normal ${real(d.normal)}<br><a href="${linkVoo(d.busca, melhor.data)}">Ver o voo</a></td></tr>`;
  }).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#111"><h2 style="margin:0 0 4px">Passagens muito abaixo do preço saindo de ${cfg.origem.cidade}</h2>
    <p style="margin:0 0 12px;color:#555">Só ida, 1 adulto, menor preço do dia entre as companhias. Preço confere no momento da coleta (${new Date().toLocaleString("pt-BR")}); passagem barata some rápido.</p>
    <table style="width:100%;border-collapse:collapse">${linhas}</table>
    <p style="color:#777;font-size:12px;margin-top:16px">Rasante. · alerta quando o preço fica ${Math.round(cfg.alertaDesconto * 100)}% ou mais abaixo do normal da rota. Mude isso em passagens/robo/config.json.</p></div>`;
  try {
    enviarEmail({ de: cfg.email.de, para: cfg.email.para, assunto, html });
    writeFileSync(AVISADOS, JSON.stringify(avisados, null, 1));
    log(`E-mail: enviado com ${novos.length} destino(s) para ${cfg.email.para}.`);
  } catch (e) { log("E-mail: FALHOU ·", e.message.slice(0, 300)); }
}

/* ---------- 6. Publica (GitHub Pages, o mesmo repositório do Confere.) ---------- */
function publicar(msg) {
  if (!cfg.publicar || !existsSync(join(RAIZ, ".git"))) { log("Publicação: pulada."); return; }
  const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  /* o site e a memória do robô (preço normal, avisos já mandados): na nuvem, cada coleta começa do zero e lê daqui */
  const arquivos = ["passagens/voos.js", ...[ULTIMA, HIST, AVISADOS].filter(existsSync).map((f) => "passagens/robo/" + f.split("/").pop())];
  try {
    git("add", ...arquivos);
    if (!git("status", "--porcelain", ...arquivos).trim()) { log("Publicação: nada mudou."); return; }
    git("commit", "-m", msg, "--", ...arquivos);
    /* o robô do Confere. também publica no mesmo repositório: junta antes de enviar */
    git("pull", "--rebase", "--autostash");
    git("push");
    log("Publicação: site atualizado no GitHub.");
  } catch (e) { log("Publicação: FALHOU ·", (e.stderr || e.message).toString().slice(0, 300)); }
}

/* ---------- roda ---------- */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  /* um robô de cada vez: dois rodando juntos um apaga a coleta do outro */
  const TRAVA = join(AQUI, "rodando.pid");
  const outro = Number(lerJson(TRAVA, 0));
  if (outro && outro !== process.pid) { try { process.kill(outro, 0); log(`Já tem uma coleta rodando (processo ${outro}); esta foi cancelada.`); process.exit(0); } catch {} }
  writeFileSync(TRAVA, String(process.pid));
  process.on("exit", () => { try { if (readFileSync(TRAVA, "utf8") === String(process.pid)) rmSync(TRAVA); } catch {} });
  const inicio = Date.now();
  log(TESTE ? "Início (teste)" : "Início da coleta");
  const abriu = await abrirChrome();
  try {
    const anterior = Object.fromEntries((lerJson(ULTIMA, {}).destinos || []).map((d) => [d.iata, d]));
    const lista = (TESTE ? cfg.destinos.slice(0, 3) : cfg.destinos).map(([iata, cidade, uf, regiao, busca]) => ({ iata, cidade, uf, regiao, busca: busca || iata }));
    const aba = await novaAba(), destinos = [], falharam = [];
    for (const d of lista) {
      if ((SO && !SO.includes(d.iata)) || falharam.length >= 5) {
        if (anterior[d.iata]) destinos.push({ ...d, dias: anterior[d.iata].dias });
        if (!SO) falharam.push(d.iata);
        continue;
      }
      try {
        d.dias = await lerDestino(aba, d); destinos.push(d);
        log(`${d.cidade} (${d.iata}): ${d.dias.length} dias, de ${real(Math.min(...d.dias.map((x) => x[1])))}`);
      } catch (e) {
        falharam.push(d.iata); log(`${d.cidade} (${d.iata}): FALHOU (${e.message.slice(0, 100)})`);
        /* destino que falhou hoje usa os preços da última coleta */
        if (anterior[d.iata]) destinos.push({ ...d, dias: anterior[d.iata].dias });
      }
      await espera(1500 + Math.random() * 2000);
    }
    if (destinos.length < (TESTE ? 1 : 15)) throw new Error(`Só ${destinos.length} destinos lidos; o site anterior foi mantido.`);

    const hist = lerJson(HIST, {});

    /* duplo check: abre a página do voo e compara com o calendário.
       Confere (até 20% de diferença): o preço fica, mesmo extraordinário. Não confere: vale o preço da página do voo. */
    const conferir = async (d, data) => {
      try { await aba.ir(linkVoo(d.busca, data)); await espera(2500); return { data, ...(await aba.js(naPagina(detalhe))) }; }
      catch (e) { log(`Conferência ${d.iata} ${data}: falhou (${e.message.slice(0, 80)})`); return null; }
    };
    const aplicar = (d, det, preco) => {
      const real = det && det.voo && det.voo.preco;
      if (!real) return "sem";
      if (real <= preco * 1.2) { (d.conferidos ||= new Set()).add(det.data); return "ok"; }
      d.dias = d.dias.map(([x, p]) => [x, x === det.data ? real : p]);
      return "errado";
    };
    for (const d of destinos) {
      const lista = suspeitos(d); if (!lista.length) continue;
      let ok = 0, errados = 0, vistos = 0;
      for (const [data, preco] of lista.slice(0, cfg.conferenciasPorDestino)) {
        const det = await conferir(d, data), r = aplicar(d, det, preco); vistos++;
        if (r === "ok") { ok++; if (!d.detalhe) d.detalhe = det; }
        else if (r === "errado") { errados++; log(`${d.cidade} (${d.iata}): calendário dizia R$ ${preco} em ${data}, a página do voo diz R$ ${d.dias.find(([x]) => x === data)[1]}; corrigido`); }
        else { if (det) { d.dias = d.dias.filter(([x]) => x !== data); log(`${d.cidade} (${d.iata}): nenhum voo na página para ${data}; preço do calendário descartado`); } break; }
      }
      /* o que não deu para conferir: se algum conferido estava errado, os parecidos também estão (fora); se todos conferiram, ficam */
      const resto = lista.slice(vistos).map(([x]) => x);
      if (errados || !ok) { d.dias = d.dias.filter(([x]) => !resto.includes(x)); if (resto.length) log(`${d.cidade} (${d.iata}): ${resto.length} preço(s) baixo(s) sem conferência descartados`); }
      if (ok) log(`${d.cidade} (${d.iata}): ${ok} preço(s) muito baixo(s) conferido(s) na página do voo e mantido(s)`);
    }
    analisar(destinos, hist);

    /* os melhores do dia: companhia, horário, paradas, e o duplo check do preço que vai para o site e para o e-mail */
    const top = destinos.filter((d) => d.melhor).sort((a, b) => b.desconto - a.desconto).slice(0, TESTE ? 3 : cfg.detalhes);
    for (const d of top) {
      for (let tentativa = 0; tentativa < 3 && d.melhor; tentativa++) {
        const det = d.conferidos && d.conferidos.has(d.melhor.data) && d.detalhe && d.detalhe.data === d.melhor.data ? d.detalhe : await conferir(d, d.melhor.data);
        if (!det) break;
        d.detalhe = det;
        const preco = d.melhor.preco, r = aplicar(d, det, preco);
        if (r === "errado") log(`${d.cidade} (${d.iata}): calendário dizia R$ ${preco} em ${det.data}, a página do voo diz R$ ${det.voo.preco}; corrigido`);
        analisarUm(d, hist);
        if (r !== "errado") break;
      }
    }
    await aba.fechar();

    const resumo = { destinos: destinos.length, dias: destinos.reduce((s, d) => s + d.dias.length, 0), ofertas: destinos.reduce((s, d) => s + d.ofertas.length, 0), falharam };
    escrever(destinos, resumo);
    if (!TESTE) {
      writeFileSync(HIST, JSON.stringify(hist));
      writeFileSync(ULTIMA, JSON.stringify({ quando: new Date().toISOString(), destinos: destinos.map(({ iata, dias }) => ({ iata, dias })) }));
    }
    log(`Pronto: ${resumo.destinos} destinos, ${resumo.dias} dias com preço, ${resumo.ofertas} passagens muito abaixo do normal, em ${Math.round((Date.now() - inicio) / 60000)} min.` + (falharam.length ? ` Falharam: ${falharam.join(", ")}` : ""));
    if (!LOCAL) { alertar(destinos); publicar(`Passagens de ${new Date().toLocaleString("pt-BR")}: ${resumo.ofertas} abaixo do normal em ${resumo.destinos} destinos`); }
  } catch (e) {
    log("ERRO:", e.message); process.exitCode = 1;
  } finally {
    if (abriu) await fecharChrome();
  }
}
