/* Confere. · o robô da noite.
   Lê os anúncios das lojas, compara os do mesmo departamento, escolhe os melhores,
   reescreve o ofertas.js e publica o site.

   node robo/coletar.mjs               coleta tudo e atualiza o site
   node robo/coletar.mjs --teste       só 1 busca por departamento, sem publicar
   node robo/coletar.mjs --so Magalu,Americanas   relê só essas lojas e reaproveita o resto da última coleta
   node robo/coletar.mjs --agendado    usado pelo agendamento: só roda se a coleta de hoje ainda não foi feita */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirChrome, fecharChrome, novaAba, espera } from "./chrome.mjs";
import { LOJAS, reclameAqui } from "./lojas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url)), RAIZ = join(AQUI, "..");
const arg = (a) => process.argv.includes(a);
const TESTE = arg("--teste");
const cfg = JSON.parse(readFileSync(join(AQUI, "config.json"), "utf8"));
const ULTIMA = join(AQUI, "ultima.json"), BRUTO = join(AQUI, "bruto.json");
const SO = arg("--so") ? process.argv[process.argv.indexOf("--so") + 1].split(",").map((x) => x.trim()) : null;
const lerJson = (f, padrao) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return padrao; } };
const log = (...a) => { const l = `[${new Date().toLocaleString("pt-BR")}] ${a.join(" ")}`; console.log(l); try { appendFileSync(join(AQUI, "robo.log"), l + "\n"); } catch {} };

/* A coleta "de hoje" é a das 23:59. Se o Mac estava desligado, roda na primeira chance. */
if (arg("--agendado")) {
  const ult = lerJson(ULTIMA, {}).quando, agora = new Date();
  const marco = new Date(agora); marco.setHours(23, 59, 0, 0); if (marco > agora) marco.setDate(marco.getDate() - 1);
  if (ult && new Date(ult) >= marco) process.exit(0);
}

const precisaLogin = [];
const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const EXCLUIR = new RegExp(cfg.excluir, "i");
const naPagina = (fn, ...args) => `return await (${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")});`;

/* ---------- 1. Reclame Aqui ---------- */
async function notasDasLojas() {
  const antes = lerJson(ULTIMA, {}).lojas || {}, lojas = {}, hoje = new Date().toISOString().slice(0, 10);
  const aba = await novaAba();
  for (const [nome, url] of Object.entries(cfg.lojas)) {
    try {
      await aba.ir(url);
      const r = await aba.js(naPagina(reclameAqui));
      if (r.nota == null) throw new Error("nota não encontrada");
      lojas[nome] = { ...r, consultado: hoje, reclameAqui: url };
      log(`Reclame Aqui · ${nome}: ${r.nota}`);
    } catch (e) {
      if (!antes[nome]) throw new Error(`Sem nota do Reclame Aqui para ${nome}: ${e.message}`);
      lojas[nome] = antes[nome]; log(`Reclame Aqui · ${nome}: falhou (${e.message}), mantida a nota de ${antes[nome].consultado}`);
    }
  }
  await aba.fechar();
  return lojas;
}

/* ---------- 2. Anúncios ---------- */
async function coletarLoja(loja, buscas) {
  const achados = [], falharam = []; let seguidas = 0;
  const aba = await novaAba();
  const ler = async (b) => {
    if (loja.porBusca) { await aba.ir(loja.porBusca(b.q)); await espera(1500); }
    return await aba.js(naPagina(loja.buscar, b.q));
  };
  try {
    if (loja.entrada) { await aba.ir(loja.entrada); await espera(2500); }
    for (const b of buscas) {
      /* três falhas seguidas: a loja está recusando o robô; insistir só piora */
      if (seguidas >= 3) { falharam.push(b.q); continue; }
      let itens = null, erro = "";
      try { itens = await ler(b); } catch (e) { erro = e.message; }
      if ((!itens || (!itens.length && loja.vazioEhFalha)) && loja.porBusca && !/LOGIN/.test(erro)) {
        await espera(/BLOQUEIO/.test(erro) ? 95000 : 10000);
        try { itens = await ler(b); erro = ""; } catch (e) { erro = e.message; }
      }
      /* página de busca sem nenhum anúncio é falha (a loja barrou), não resultado */
      if (!erro && loja.vazioEhFalha && itens && !itens.length) erro = "a página veio sem anúncios";
      if (/LOGIN/.test(erro)) { precisaLogin.push(loja.nome); seguidas = 3; }
      if (itens && !erro) {
        seguidas = 0;
        itens.forEach((i) => achados.push({ ...i, loja: loja.nome, categoria: b.categoria, tipo: b.tipo, q: b.q }));
        log(`${loja.nome} · ${b.q}: ${itens.length}`);
      } else { seguidas++; falharam.push(b.q); log(`${loja.nome} · ${b.q}: FALHOU (${erro.slice(0, 100)})`); }
      await espera((loja.pausa || 700) + Math.random() * 900);
    }
  } finally { await aba.fechar(); }
  return { achados, falharam };
}

/* ---------- 3. Comparação ---------- */
const GENERICO = /^(\d+(GB|TB|HZ|BTUS?|KG|V|W|MP|L|MM|CM|MAH|POL|K|G|X)|HDR\d+\+?|WIFI\d?|WI-?FI\d?|[A-Z]\d|\d[A-Z]|4K|8K|5G|4G|USB\d?|HDMI\d?|\d+X\d+|\d+EM\d+)$/;
/* Código do modelo (55P7L, UN55U8600F, E1504FA…): é o que liga o mesmo produto em lojas diferentes. */
function modelo(nome) {
  const t = semAcento(nome).toUpperCase().replace(/[^A-Z0-9\-\/ ]/g, " ").split(/[\s\/]+/).map((x) => x.replace(/^-+|-+$/g, ""))
    .filter((x) => x.length >= 5 && /[A-Z]/.test(x) && /\d/.test(x) && !GENERICO.test(x.replace(/-/g, "")));
  return t.length ? t.sort((a, b) => b.length - a.length)[0].replace(/-/g, "") : null;
}
const avista = (p) => p.pix || p.por;

function comparar(todos, lojas) {
  const cat = Object.fromEntries(cfg.categorias.map((c) => [c.nome, { ...c, re: new RegExp(c.aceita, "i") }]));
  /* limpa: preço válido, é mesmo do departamento, não é acessório nem usado */
  const vistos = new Set();
  const limpos = todos.filter((p) => {
    const c = cat[p.categoria], chave = p.loja + p.id;
    if (!p.nome || !p.por || !p.link || vistos.has(chave)) return false;
    if (!c.re.test(p.nome) || EXCLUIR.test(p.nome + " ") || avista(p) < c.minimo) return false;
    vistos.add(chave); p.de = Math.max(p.de || 0, p.por); p.nome = p.nome.replace(/\s+/g, " ").trim();
    /* "de" que daria mais de 60% de desconto quase sempre é preço de tabela inflado: não mostramos */
    if ((p.de - avista(p)) / p.de > 0.6) p.de = p.por;
    return true;
  });

  const aprovada = (l) => lojas[l].nota >= cfg.notaMinima;
  /* o produto presta? nota e volume de avaliações, quando a loja informa */
  const bomProduto = (p) => p.estrelas != null && (p.avaliacoes == null ? p.estrelas >= Math.max(cfg.notaProduto, 4.5) : p.estrelas >= cfg.notaProduto && p.avaliacoes >= cfg.avaliacoesMinimas);

  /* agrupa o mesmo modelo entre as lojas */
  const grupos = new Map();
  for (const p of limpos) { const k = p.categoria + "|" + (modelo(p.nome) || p.loja + p.id); (grupos.get(k) || grupos.set(k, []).get(k)).push(p); }

  const escolhidos = [];
  for (const g of grupos.values()) {
    const bons = g.filter(bomProduto); if (!bons.length) continue;
    const ref = bons.slice().sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0))[0];
    /* descarta preço muito fora do grupo: quase sempre é outro produto com o mesmo código no nome */
    const precos = g.map(avista).sort((a, b) => a - b), med = precos[Math.floor(precos.length / 2)];
    const validos = g.filter((p) => avista(p) >= med * 0.55 && avista(p) <= med * 1.8);
    const porLoja = new Map();
    for (const p of validos.sort((a, b) => avista(a) - avista(b))) if (!porLoja.has(p.loja)) porLoja.set(p.loja, p);
    const venc = [...porLoja.values()].find((p) => aprovada(p.loja)); if (!venc) continue;
    if (!bomProduto(venc)) { venc.estrelas = ref.estrelas; venc.avaliacoes = ref.avaliacoes; venc.notaDe = ref.loja; }
    /* preço muito distante do vencedor costuma ser outra versão do produto: fica fora da comparação */
    venc.outras = [...porLoja.values()].filter((p) => p !== venc && avista(p) <= avista(venc) * 1.5 && avista(p) >= avista(venc) * 0.6).map((p) => ({ loja: p.loja, preco: avista(p) }));
    escolhidos.push(venc);
  }

  /* pontua: desconto real, nota, volume de avaliações, reputação da loja e preço conferido em outra loja */
  for (const p of escolhidos) {
    const desc = Math.min(Math.max((p.de - avista(p)) / p.de, 0), 0.6) / 0.6;
    const nota = Math.min(Math.max((p.estrelas - 4) / 1, 0), 1);
    const vol = p.avaliacoes == null ? 0.4 : Math.min(Math.log10(p.avaliacoes + 1) / 4, 1);
    const loja = Math.min(Math.max((lojas[p.loja].nota - 6) / 4, 0), 1);
    const maisCaras = p.outras.filter((o) => o.preco >= avista(p) * 1.01);
    p.pontos = Math.round(40 * desc + 20 * nota + 15 * vol + 10 * loja + (maisCaras.length ? 10 + Math.min(maisCaras.length, 3) * 1.5 : 0) + (p.menor30 ? 3 : 0));
  }

  /* só entra com preço bom de verdade: desconto, selo de menor preço ou mais barato que em outra loja */
  const precoBom = (p) => (p.de - avista(p)) / p.de >= 0.05 || p.menor30 || p.outras.some((o) => o.preco >= avista(p) * 1.01);
  /* o mesmo aparelho em outra cor ou voltagem conta uma vez só */
  const COR = /\b(pret[oa]|branc[oa]|cinza|lil[aá]s|azul( marinho| claro| escuro)?|verde|rosa|prata|pratead[oa]|grafite|dourad[oa]|tit[aâ]nio|vermelh[oa]|rox[oa]|amarel[oa]|bege|cobre|127 ?v|220 ?v|110 ?v|bivolt)\b/gi;
  const variante = (p) => semAcento(p.nome.replace(COR, " ")).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 9).join(" ");
  const saida = [];
  for (const c of cfg.categorias) {
    const ja = new Set(), top = [];
    for (const p of escolhidos.filter((p) => p.categoria === c.nome && precoBom(p)).sort((a, b) => b.pontos - a.pontos || avista(a) - avista(b))) {
      const v = variante(p); if (ja.has(v)) continue;
      ja.add(v); top.push(p); if (top.length >= cfg.porCategoria) break;
    }
    saida.push(...top);
  }
  return { saida, limpos: limpos.length };
}

/* ---------- 4. Escreve o ofertas.js ---------- */
function escrever(produtos, lojas, resumo) {
  const prefixo = { "Magalu": "mag", "Amazon": "amz", "Mercado Livre": "ml", "Casas Bahia": "cb", "Americanas": "ame" };
  const campos = (p) => ({
    id: `${prefixo[p.loja]}-${p.id}`, categoria: p.categoria, tipo: p.tipo, nome: p.nome.length > 140 ? p.nome.slice(0, 137).replace(/\s+\S*$/, "") + "…" : p.nome, loja: p.loja,
    de: p.de, por: p.por, pix: p.pix || null, menor90: null, menor30: !!p.menor30, parcelas: p.parcelas || 0, frete: p.frete || "Frete pelo CEP",
    estrelas: Math.round(p.estrelas * 10) / 10, avaliacoes: p.avaliacoes ?? null, notaDe: p.notaDe || null, outras: p.outras, pontos: p.pontos, link: p.link, imagem: p.imagem || ""
  });
  const lista = produtos.map(campos);
  const melhor = lista.slice().sort((a, b) => b.pontos - a.pontos)[0];
  const dados = {
    atualizado: new Date().toISOString(), cidade: cfg.cidade, whatsapp: cfg.whatsapp, email: cfg.email,
    parceiroMagalu: cfg.parceiroMagalu, associadoAmazon: cfg.associadoAmazon, afiliados: cfg.afiliados,
    notaMinima: cfg.notaMinima, notaProduto: cfg.notaProduto, avaliacoesMinimas: cfg.avaliacoesMinimas,
    analise: resumo, destaque: melhor ? melhor.id : "", lojas, categorias: cfg.categorias.map((c) => c.nome)
  };
  const cab = `/*\n  Confere. · catálogo da loja\n  ---------------------------------------------------------------\n  NÃO EDITE ESTE ARQUIVO: o robô reescreve ele toda noite.\n  Seus dados (afiliados, WhatsApp, e-mail, regras) ficam em robo/config.json.\n\n  Última coleta: ${new Date().toLocaleString("pt-BR")}\n  ${resumo.anuncios} anúncios lidos em ${resumo.lojas} lojas · ${lista.length} ofertas escolhidas\n*/\n\n`;
  const corpo = JSON.stringify(dados, null, 2).replace(/\n}$/, "") + ",\n  \"produtos\": [\n" + lista.map((p) => "    " + JSON.stringify(p)).join(",\n") + "\n  ]\n}";
  writeFileSync(join(RAIZ, "ofertas.js"), cab + "window.CONFERE = " + corpo + ";\n");
}

/* ---------- 5. Publica (GitHub Pages) ---------- */
function publicar(msg) {
  if (!cfg.publicar || !existsSync(join(RAIZ, ".git"))) { log("Publicação: pulada (sem repositório configurado)."); return; }
  const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try { git("remote", "get-url", "origin"); } catch { log('Publicação: pulada (falta ligar o GitHub: rode "node robo/github.mjs <endereço do repositório>").'); return; }
  try {
    git("add", "ofertas.js");
    if (!git("status", "--porcelain", "ofertas.js").trim()) { log("Publicação: nada mudou."); return; }
    git("commit", "-m", msg);
    git("push");
    log("Publicação: site atualizado no GitHub.");
  } catch (e) { log("Publicação: FALHOU ·", (e.stderr || e.message).toString().slice(0, 300)); }
}

/* ---------- roda ---------- */
const inicio = Date.now();
log(TESTE ? "Início (teste)" : "Início da coleta");
const abriu = await abrirChrome();
try {
  const lojas = await notasDasLojas();
  const buscas = cfg.categorias.flatMap((c) => (TESTE ? c.buscas.slice(0, 1) : c.buscas).map(([q, tipo]) => ({ q, tipo, categoria: c.nome })));
  const todos = []; const porLoja = {};
  const anterior = lerJson(BRUTO, []);
  for (const loja of LOJAS) {
    if (SO && !SO.includes(loja.nome)) {
      const antes = anterior.filter((p) => p.loja === loja.nome);
      porLoja[loja.nome] = antes.length; todos.push(...antes); log(`${loja.nome}: reaproveitados ${antes.length} anúncios da última coleta`); continue;
    }
    const { achados, falharam } = await coletarLoja(loja, buscas);
    /* busca que falhou hoje usa os anúncios da última coleta dessa mesma busca */
    const reserva = anterior.filter((p) => p.loja === loja.nome && falharam.includes(p.q));
    porLoja[loja.nome] = achados.length + reserva.length; todos.push(...achados, ...reserva);
    if (falharam.length) log(`${loja.nome}: ${falharam.length} busca(s) falharam; ${reserva.length} anúncios vieram da coleta anterior`);
  }
  const lojasOk = Object.values(porLoja).filter((n) => n > 0).length;
  if (todos.length < 200 && !TESTE) throw new Error(`Só ${todos.length} anúncios lidos; o site de ontem foi mantido.`);
  if (!TESTE) writeFileSync(BRUTO, JSON.stringify(todos));
  const { saida, limpos } = comparar(todos, lojas);
  const resumo = { anuncios: todos.length, validos: limpos, lojas: lojasOk, porLoja, escolhidas: saida.length };
  if (saida.length < 30 && !TESTE) throw new Error(`Só ${saida.length} ofertas passaram; o site de ontem foi mantido.`);
  escrever(saida, lojas, resumo);
  writeFileSync(ULTIMA, JSON.stringify({ quando: new Date().toISOString(), lojas, resumo, precisaLogin: [...new Set(precisaLogin)] }, null, 2));
  if (precisaLogin.length) log(`ATENÇÃO: ${[...new Set(precisaLogin)].join(", ")} pediu login. Rode "node robo/entrar.mjs" e entre na conta; até lá o site usa os anúncios da última coleta dessa loja.`);
  log(`Pronto: ${todos.length} anúncios lidos, ${saida.length} ofertas no site, em ${Math.round((Date.now() - inicio) / 60000)} min. Por loja: ${JSON.stringify(porLoja)}`);
  if (!TESTE) publicar(`Ofertas de ${new Date().toLocaleDateString("pt-BR")}: ${saida.length} ofertas, ${todos.length} anúncios lidos`);
} catch (e) {
  log("ERRO:", e.message); process.exitCode = 1;
} finally {
  if (abriu) await fecharChrome();
}
