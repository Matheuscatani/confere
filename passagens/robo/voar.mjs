/* Rasante. · o robô das passagens.
   Para cada destino, lê no Google Voos o preço mais barato de cada dia saindo de Goiânia
   (LATAM, GOL, Azul e as outras que voam a rota), compara com o preço normal da rota,
   guarda os preços do painel e a amostra da página de vendas no Supabase (o site fica em rasantegyn.com.br)
   e manda e-mail quando aparece passagem muito abaixo do normal.

   node passagens/robo/voar.mjs               coleta tudo, atualiza o site e manda os alertas
   node passagens/robo/voar.mjs --teste       só 3 destinos, sem publicar e sem e-mail
   node passagens/robo/voar.mjs --local      coleta tudo e escreve o voos.js local, sem publicar e sem e-mail
   node passagens/robo/voar.mjs --so SSA,REC  relê só esses destinos e reaproveita o resto da última coleta
   node passagens/robo/voar.mjs --agendado    para agendar no Mac (hoje quem agenda é o GitHub, a cada 30 minutos)
   node passagens/robo/voar.mjs --parte 2/4   na nuvem: lê só 1/4 dos destinos e grava parte-2.json
   node passagens/robo/voar.mjs --juntar dir  na nuvem: junta as partes, grava o painel e manda os alertas */
import { readFileSync, writeFileSync, existsSync, appendFileSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirChrome, fecharChrome, novaAba, espera } from "../../robo/chrome.mjs";
import { enviarEmail } from "./email.mjs";
import { alertaHtml } from "./modelo-email.mjs";

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

/* volta = true: o caminho contrário (do destino para Goiânia), que forma a ida e volta */
export const linkVoo = (dest, data, volta = false) =>
  `https://www.google.com/travel/flights?q=${encodeURIComponent(volta ? `Flights to ${cfg.origem.iata} from ${dest} on ${data} oneway` : `Flights to ${dest} from ${cfg.origem.iata} on ${data} oneway`)}&curr=BRL&hl=pt-BR&gl=BR`;

/* ---------- ida e volta: a ida mais barata somada à volta mais barata, com N dias de viagem ---------- */
const ESTADIAS = cfg.estadias || [{ nome: "Fim de semana", min: 2, max: 3 }, { nome: "4 a 6 dias", min: 4, max: 6 }, { nome: "1 semana", min: 7, max: 9 }, { nome: "10 a 15 dias", min: 10, max: 15 }];
export function combinar(idaDias, voltaDias, min, max, limite) {
  const volta = new Map(voltaDias), melhor = { total: Infinity };
  for (const [ida, pi] of idaDias) {
    if (ida < limite) continue;
    for (let n = min; n <= max; n++) {
      const v = iso(somaDias(new Date(ida + "T12:00"), n)), pv = volta.get(v);
      if (pv && pi + pv < melhor.total) Object.assign(melhor, { ida, volta: v, pi, pv, total: pi + pv, dias: n });
    }
  }
  return melhor.ida ? melhor : null;
}
const menorEstadia = Math.min(...ESTADIAS.map((e) => e.min)), maiorEstadia = Math.max(...ESTADIAS.map((e) => e.max));

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
  const url = linkVoo(d.busca, iso(somaDias(new Date(), d.volta ? 14 : 7)), d.volta);
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
  const h = (hist[d.chave] = (hist[d.chave] || []).filter((x) => x.d >= corte && x.d !== hoje));
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

/* ---------- 4. Monta os dados do painel (voos.js fica só no computador, para conferir) e a amostra pública ---------- */
function escrever(destinos, voltas, resumo) {
  const dados = {
    atualizado: new Date().toISOString(), origem: cfg.origem, alertaDesconto: cfg.alertaDesconto, resumo, estadias: ESTADIAS,
    destinos: destinos.sort((a, b) => b.desconto - a.desconto).map((d) => ({
      iata: d.iata, busca: d.busca, cidade: d.cidade, uf: d.uf, regiao: d.regiao, normal: d.normal, menorHistorico: d.menorHistorico,
      melhor: d.melhor, desconto: Math.round(d.desconto * 100) / 100, ofertas: d.ofertas.length, detalhe: d.detalhe || null, voos: d.voos || {},
      dias: d.dias.map(([data, p]) => data + ":" + p).join(" ")
    })),
    /* o caminho contrário (destino → Goiânia), para o painel montar a ida e volta */
    voltas: voltas.map((d) => ({ iata: d.iata, normal: d.normal, melhor: d.melhor, detalhe: d.detalhe || null, voos: d.voos || {}, dias: d.dias.map(([data, p]) => data + ":" + p).join(" ") }))
  };
  const cab = `/*\n  Rasante. · passagens baratas saindo de ${cfg.origem.cidade}\n  ---------------------------------------------------------------\n  NÃO EDITE ESTE ARQUIVO: o robô reescreve ele de hora em hora.\n  As regras ficam em passagens/robo/config.json.\n\n  Última coleta: ${new Date().toLocaleString("pt-BR")}\n  ${resumo.destinos} destinos · ${resumo.dias} dias com preço · ${resumo.ofertas} passagens muito abaixo do normal\n*/\n\n`;
  writeFileSync(join(SITE, "voos.js"), cab + "window.RASANTE = " + JSON.stringify(dados, null, 1) + ";\n");
  /* a página de vendas mostra só as 5 maiores ofertas (sem o calendário) e os nomes dos destinos */
  const top = new Set(dados.destinos.filter((d) => d.melhor && d.desconto >= 0.2).slice(0, 5).map((d) => d.iata));
  const amostra = { atualizado: dados.atualizado, origem: dados.origem, alertaDesconto: dados.alertaDesconto,
    destinos: dados.destinos.map(({ dias, voos, ...d }) => (top.has(d.iata) ? d : { iata: d.iata, cidade: d.cidade })) };
  return { dados, amostra };
}

/* ---------- memória do robô e preços do painel no Supabase (fora do repositório público) ---------- */
const NA_NUVEM = !!process.env.GITHUB_ACTIONS;
async function memoria(metodo, corpo) {
  const token = process.env.RASANTE_ROBO_TOKEN;
  if (!token || !cfg.memoriaUrl) throw new Error("falta o segredo RASANTE_ROBO_TOKEN");
  const r = await fetch(cfg.memoriaUrl, { method: metodo, headers: { "x-robo-token": token, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function baixarMemoria() {
  const m = await memoria("GET");
  for (const [nome, arq] of [["ultima", ULTIMA], ["historico", HIST], ["avisados", AVISADOS]]) if (m[nome]) writeFileSync(arq, JSON.stringify(m[nome]));
  log(`Memória: lida do Supabase (${Object.keys(m).join(", ") || "vazia"}).`);
}
async function guardarMemoria({ dados: painel, amostra }) {
  await memoria("POST", { painel, amostra, ultima: lerJson(ULTIMA, null), historico: lerJson(HIST, null), avisados: lerJson(AVISADOS, null) });
  log("Painel: preços guardados no Supabase.");
}

/* ---------- 5. Alerta por e-mail: só o que ainda não foi avisado (ou que caiu mais 5%) ---------- */
/* sai logo depois da coleta em que a passagem apareceu; a mesma passagem nunca é avisada duas vezes */
/* ida e volta: a combinação mais barata de cada destino (2 a 15 dias de viagem), com a ida e a volta conferidas na página do voo */
function idaVoltaBarata(d, v) {
  if (!v || !v.normal || !d.normal) return null;
  const c = combinar(d.dias, v.dias, menorEstadia, maiorEstadia, iso(somaDias(new Date(), cfg.diasMinimos)));
  if (!c) return null;
  const normal = d.normal + v.normal;
  return { ...c, normal, desconto: 1 - c.total / normal, conferido: !!(d.conferidos?.has(c.ida) && v.conferidos?.has(c.volta)) };
}

async function alertar(destinos, voltas = []) {
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
  /* ida e volta muito abaixo do normal (soma das duas passagens) */
  const pares = [], porIata = Object.fromEntries(voltas.map((v) => [v.iata, v]));
  for (const d of destinos) {
    const v = porIata[d.iata], c = idaVoltaBarata(d, v);
    if (!c || c.desconto < cfg.alertaDesconto || c.normal - c.total < cfg.economiaMinima) continue;
    const k = `${d.iata}|${c.ida}|${c.volta}`;
    if (avisados[k] && c.total > avisados[k] * 0.95) continue;
    if (!c.conferido) { log(`E-mail: ida e volta para ${d.cidade} ficou fora (ida ou volta não conferida na página do voo)`); continue; }
    pares.push({ d, v, c }); avisados[k] = c.total;
  }
  if (!novos.length && !pares.length) { log("E-mail: nenhuma passagem nova muito abaixo do normal."); return; }
  novos.sort((a, b) => b.melhor.desconto - a.melhor.desconto);
  pares.sort((a, b) => b.c.desconto - a.c.desconto);
  const total = novos.length + pares.length, p = novos[0], q = pares[0];
  const assunto = (p ? `✈ ${cfg.origem.cidade} → ${p.d.cidade} por ${real(p.melhor.preco)} (${Math.round(p.melhor.desconto * 100)}% abaixo do normal)`
    : `✈ ${cfg.origem.cidade} ⇄ ${q.d.cidade} ida e volta por ${real(q.c.total)} (${Math.round(q.c.desconto * 100)}% abaixo do normal)`) + (total > 1 ? ` + ${total - 1} oferta(s)` : "");
  const quando = new Date().toLocaleString("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
  const html = alertaHtml({ origem: cfg.origem.cidade, novos, pares, linkVoo, desconto: cfg.alertaDesconto, quando });
  /* clientes que pagaram (lista no Supabase, alimentada pela Kiwify) */
  const clientes = (await clientesAtivos()).filter((e) => e !== cfg.email.para);
  let enviados = 0, saiu = false;
  /* 1º: pelo Resend, com o domínio do Rasante e um e-mail para cada pessoa (não cai no spam) */
  try {
    const r = await fetch(cfg.alertaUrl, { method: "POST", headers: { "x-robo-token": process.env.RASANTE_ROBO_TOKEN || "", "Content-Type": "application/json" },
      body: JSON.stringify({ assunto, html, para: [cfg.email.para, ...clientes] }), signal: AbortSignal.timeout(90000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "HTTP " + r.status);
    enviados = j.enviados - 1; saiu = true;
    if (j.falhas && j.falhas.length) log("E-mail: parte não saiu pelo Resend ·", j.falhas.join(" | ").slice(0, 300));
  } catch (e) { log(`E-mail: Resend não mandou (${e.message.slice(0, 200)}); indo pelo Gmail`); }
  /* reserva: pelo Gmail, clientes em cópia oculta (um não vê o outro) */
  if (!saiu) {
    const lotes = [];
    for (let i = 0; i < Math.max(clientes.length, 1); i += 90) lotes.push(clientes.slice(i, i + 90));
    for (const bcc of lotes) {
      try { await enviarEmail({ de: cfg.email.de, para: cfg.email.para, bcc, assunto, html }); enviados += bcc.length; saiu = true; }
      catch (e) { log("E-mail: FALHOU ·", e.message.slice(0, 300)); }
    }
  }
  /* só marca como avisado o que saiu de verdade; se falhou, tenta de novo na próxima hora */
  if (saiu) {
    avisados._envio = new Date().toISOString();
    writeFileSync(AVISADOS, JSON.stringify(avisados, null, 1));
    log(`E-mail: enviado com ${novos.length} só ida e ${pares.length} ida e volta para ${cfg.email.para} e ${enviados} cliente(s).`);
  }
}

async function clientesAtivos() {
  const token = process.env.RASANTE_ROBO_TOKEN;
  if (!token || !cfg.clientesUrl) { log(`Clientes: falta o segredo RASANTE_ROBO_TOKEN; o alerta vai só para ${cfg.email.para}`); return []; }
  try {
    const r = await fetch(cfg.clientesUrl, { headers: { "x-robo-token": token }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.json()).emails || [];
  } catch (e) { log(`Clientes: não consegui ler a lista (${e.message}); o alerta vai só para ${cfg.email.para}`); return []; }
}

/* ---------- 6. Coleta de um grupo de destinos: calendário + duplo check na página do voo ---------- */
const lerLista = () => cfg.destinos.map(([iata, cidade, uf, regiao, busca]) => ({ iata, cidade, uf, regiao, busca: busca || iata, chave: iata }));
/* o caminho contrário de cada destino: chave "SSA-V" (no histórico e na última coleta) */
const comVolta = (lista) => [...lista, ...(cfg.idaVolta === false ? [] : lista.map((d) => ({ ...d, volta: true, chave: d.iata + "-V" })))];

async function coletar(lista, anterior) {
  const aba = await novaAba(), destinos = [], falharam = [];
  let lidos = 0, lidosVolta = 0;
  for (const d of lista) {
    if ((SO && !SO.includes(d.iata)) || falharam.length >= 5) {
      if (anterior[d.chave]) destinos.push({ ...d, dias: anterior[d.chave].dias });
      if (!SO) falharam.push(d.chave);
      continue;
    }
    const nome = d.volta ? `Volta ${d.cidade} → ${cfg.origem.cidade} (${d.iata})` : `${d.cidade} (${d.iata})`;
    try {
      d.dias = await lerDestino(aba, d); destinos.push(d); if (d.volta) lidosVolta++; else lidos++;
      log(`${nome}: ${d.dias.length} dias, de ${real(Math.min(...d.dias.map((x) => x[1])))}`);
    } catch (e) {
      falharam.push(d.chave); log(`${nome}: FALHOU (${e.message.slice(0, 100)})`);
      /* destino que falhou hoje usa os preços da última coleta */
      if (anterior[d.chave]) destinos.push({ ...d, dias: anterior[d.chave].dias });
    }
    await espera(1500 + Math.random() * 2000);
  }

  const hist = lerJson(HIST, {});

  /* duplo check: abre a página do voo daquele dia. O preço que vale é SEMPRE o da página do voo.
     Até 20% acima do calendário conta como "confere" (o calendário estava certo, só um pouco velho);
     mais que isso, o calendário estava errado e os outros dias suspeitos parecidos também saem. */
  const conferir = async (d, data) => {
    try {
      await aba.ir(linkVoo(d.busca, data, d.volta)); await espera(2500);
      const det = { data, ...(await aba.js(naPagina(detalhe))) };
      if (det.voo) (d.voos ||= {})[data] = det.voo;
      return det;
    }
    catch (e) { log(`Conferência ${d.iata} ${data}: falhou (${e.message.slice(0, 80)})`); return null; }
  };
  const aplicar = (d, det, preco) => {
    const real = det && det.voo && det.voo.preco;
    if (!real) return "sem";
    d.dias = d.dias.map(([x, p]) => [x, x === det.data ? real : p]);
    if (real <= preco * 1.2) { (d.conferidos ||= new Set()).add(det.data); return "ok"; }
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

  /* o menor preço de CADA destino (é o que aparece no painel e no e-mail) passa pelo duplo check na página do voo.
     Se a página mostra outro preço, ele entra no lugar; se com isso o menor preço passa a ser outro dia, confere esse também. */
  let corrigidos = 0;
  for (const d of destinos.filter((x) => x.melhor)) {
    for (let tentativa = 0; tentativa < 3 && d.melhor; tentativa++) {
      const ja = d.conferidos && d.conferidos.has(d.melhor.data) && d.detalhe && d.detalhe.data === d.melhor.data;
      const det = ja ? d.detalhe : await conferir(d, d.melhor.data);
      if (!det) break;
      const preco = d.melhor.preco, r = aplicar(d, det, preco);
      if (r === "sem") { d.dias = d.dias.filter(([x]) => x !== det.data); log(`${d.cidade} (${d.iata}): nenhum voo na página para ${det.data}; dia descartado`); analisarUm(d, hist); continue; }
      d.detalhe = det;
      (d.conferidos ||= new Set()).add(det.data);
      if (det.voo.preco !== preco) { corrigidos++; log(`${d.cidade} (${d.iata}): calendário dizia R$ ${preco} em ${det.data}, a página do voo diz R$ ${det.voo.preco}; corrigido`); }
      analisarUm(d, hist);
      if (d.melhor && d.melhor.data === det.data) break;
    }
  }

  /* ida e volta: a combinação mais barata de cada destino, quando está perto de virar alerta,
     tem a ida e a volta conferidas na página do voo (o preço da página entra no lugar) */
  let pares = 0;
  for (const d of destinos.filter((x) => !x.volta)) {
    const v = destinos.find((x) => x.volta && x.iata === d.iata);
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const c = idaVoltaBarata(d, v);
      if (!c || c.conferido || c.desconto < cfg.alertaDesconto - 0.05) break;
      for (const [x, data, preco] of [[d, c.ida, c.pi], [v, c.volta, c.pv]]) {
        if (x.conferidos?.has(data)) continue;
        const det = await conferir(x, data), r = aplicar(x, det, preco);
        if (r === "sem") { if (det) x.dias = x.dias.filter(([y]) => y !== data); }
        else (x.conferidos ||= new Set()).add(data);
      }
      analisarUm(d, hist); analisarUm(v, hist);
      if (idaVoltaBarata(d, v)?.conferido) { pares++; break; }
    }
  }
  await aba.fechar();
  const conferidos = destinos.filter((d) => d.melhor && d.conferidos && d.conferidos.has(d.melhor.data)).length;
  log(`Duplo check: ${conferidos} de ${destinos.filter((d) => d.melhor).length} menores preços conferidos na página do voo (${corrigidos} corrigido(s)); ${pares} ida e volta barata(s) conferida(s).`);
  return { destinos, falharam, lidos, lidosVolta };
}

/* ---------- 7. Fecha a coleta: preço normal, painel, memória e e-mail ---------- */
async function finalizar(todos, falharam, lidos, inicio) {
  if (lidos < (TESTE ? 1 : 15)) throw new Error(`Só ${lidos} destinos lidos agora; o painel anterior foi mantido.`);
  const hist = lerJson(HIST, {});
  analisar(todos, hist);
  const destinos = todos.filter((d) => !d.volta), voltas = todos.filter((d) => d.volta);
  const resumo = { destinos: destinos.length, voltas: voltas.length, dias: destinos.reduce((s, d) => s + d.dias.length, 0), ofertas: destinos.reduce((s, d) => s + d.ofertas.length, 0), falharam };
  const painel = escrever(destinos, voltas, resumo);
  if (!TESTE) {
    writeFileSync(HIST, JSON.stringify(hist));
    /* na última coleta a volta fica com a chave "SSA-V" */
    writeFileSync(ULTIMA, JSON.stringify({ quando: new Date().toISOString(), destinos: todos.map(({ chave, dias }) => ({ iata: chave, dias })) }));
  }
  log(`Pronto: ${resumo.destinos} destinos, ${resumo.dias} dias com preço, ${resumo.ofertas} passagens muito abaixo do normal, em ${Math.round((Date.now() - inicio) / 60000)} min.` + (falharam.length ? ` Falharam: ${falharam.join(", ")}` : ""));
  if (!LOCAL) {
    await alertar(destinos, voltas);
    try { await guardarMemoria(painel); }
    catch (e) { log("ERRO: não guardei os preços no Supabase:", e.message); process.exitCode = 1; }
  }
}

/* ---------- roda ---------- */
/* Na nuvem a coleta é dividida: --parte 2/4 lê só um quarto dos destinos e grava parte-2.json;
   --juntar <pasta> junta as partes, calcula o preço normal, grava o painel e manda o e-mail. */
const PARTE = arg("--parte") ? process.argv[process.argv.indexOf("--parte") + 1].split("/").map(Number) : null;
const JUNTAR = arg("--juntar") ? process.argv[process.argv.indexOf("--juntar") + 1] : null;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  /* um robô de cada vez: dois rodando juntos um apaga a coleta do outro */
  const TRAVA = join(AQUI, "rodando.pid");
  const outro = Number(lerJson(TRAVA, 0));
  if (outro && outro !== process.pid) { try { process.kill(outro, 0); log(`Já tem uma coleta rodando (processo ${outro}); esta foi cancelada.`); process.exit(0); } catch {} }
  writeFileSync(TRAVA, String(process.pid));
  process.on("exit", () => { try { if (readFileSync(TRAVA, "utf8") === String(process.pid)) rmSync(TRAVA); } catch {} });
  const inicio = Date.now();
  log(TESTE ? "Início (teste)" : PARTE ? `Início da parte ${PARTE.join("/")}` : JUNTAR ? "Juntando as partes" : "Início da coleta");
  /* na nuvem cada coleta começa do zero: sem a memória (preço normal, avisos já mandados) não coleta, para não repetir e-mail */
  if (!LOCAL && (NA_NUVEM || process.env.RASANTE_ROBO_TOKEN)) {
    try { await baixarMemoria(); }
    catch (e) { log("ERRO: não consegui ler a memória no Supabase:", e.message); if (NA_NUVEM) console.log(`::error::Memória do Supabase: ${e.message}`); process.exit(1); }
  }
  const anterior = Object.fromEntries((lerJson(ULTIMA, {}).destinos || []).map((d) => [d.iata, d]));

  if (JUNTAR) {
    /* sem Chrome: só junta. Destino de parte que não chegou fica com os preços da última coleta (sem o selo de conferido). */
    try {
      const partes = readdirSync(JUNTAR, { recursive: true }).filter((f) => /parte-\d+\.json$/.test(String(f))).map((f) => lerJson(join(JUNTAR, String(f)), null)).filter(Boolean);
      const vindos = Object.fromEntries(partes.flatMap((p) => p.destinos).map((d) => [d.chave || d.iata, d]));
      const destinos = [], falharam = partes.flatMap((p) => p.falharam);
      for (const d of comVolta(lerLista())) {
        const v = vindos[d.chave];
        if (v) destinos.push({ ...d, ...v, conferidos: new Set(v.conferidos || []) });
        else if (anterior[d.chave]) { destinos.push({ ...d, dias: anterior[d.chave].dias }); if (!falharam.includes(d.chave)) falharam.push(d.chave); }
      }
      log(`Partes recebidas: ${partes.map((p) => p.parte).join(", ") || "nenhuma"}.`);
      await finalizar(destinos, falharam, partes.reduce((s, p) => s + p.lidos, 0), inicio);
    } catch (e) { log("ERRO:", e.message); process.exitCode = 1; }
  } else {
    const abriu = await abrirChrome();
    try {
      let lista = lerLista();
      if (TESTE) lista = lista.slice(0, 3);
      if (PARTE) { const [n, total] = PARTE; lista = lista.filter((_, i) => i % total === n - 1); }
      /* cada parte lê a ida e a volta dos mesmos destinos, para conferir a ida e volta junto */
      lista = comVolta(lista);
      const { destinos, falharam, lidos, lidosVolta } = await coletar(lista, anterior);
      if (PARTE) {
        if (!lidos) throw new Error("nenhum destino lido nesta parte");
        const arq = join(AQUI, `parte-${PARTE[0]}.json`);
        writeFileSync(arq, JSON.stringify({ parte: PARTE[0], lidos, falharam,
          destinos: destinos.map(({ iata, chave, volta, cidade, uf, regiao, busca, dias, conferidos, detalhe, voos }) => ({ iata, chave, volta: !!volta, cidade, uf, regiao, busca, dias, conferidos: [...(conferidos || [])], detalhe: detalhe || null, voos: voos || {} })) }));
        log(`Parte ${PARTE.join("/")}: ${lidos} destinos e ${lidosVolta} voltas lidos, em ${Math.round((Date.now() - inicio) / 60000)} min.`);
      } else await finalizar(destinos, falharam, lidos, inicio);
    } catch (e) {
      log("ERRO:", e.message); process.exitCode = 1;
    } finally {
      if (abriu) await fecharChrome();
    }
  }
}
