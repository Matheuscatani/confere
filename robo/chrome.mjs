/* Confere. · controla um Chrome próprio do robô, sem instalar nada.
   O perfil fica fora da pasta do site (os logins nunca vão para o GitHub). */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const PORTA = 9333;
export const PERFIL = `${homedir()}/.confere-robo/chrome`;
/* no Mac usa o Chrome instalado; num servidor Linux, o caminho vem de CHROME_BIN */
const LINUX = process.platform === "linux";
const BIN = process.env.CHROME_BIN || (LINUX ? "/usr/bin/google-chrome" : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function versao() {
  try { return await (await fetch(`http://127.0.0.1:${PORTA}/json/version`)).json(); } catch { return null; }
}

/* Abre o Chrome do robô (ou reaproveita o que já está aberto). */
export async function abrirChrome(urls = []) {
  if (await versao()) return false;
  mkdirSync(PERFIL, { recursive: true });
  spawn(BIN, [`--remote-debugging-port=${PORTA}`, `--user-data-dir=${PERFIL}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "--lang=pt-BR",
    ...(LINUX ? ["--no-sandbox", "--disable-dev-shm-usage"] : []), ...urls],
    { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40 && !(await versao()); i++) await espera(500);
  if (!(await versao())) throw new Error("O Chrome do robô não abriu.");
  return true;
}

export async function fecharChrome() {
  const v = await versao(); if (!v) return;
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  await espera(800);
}

/* Uma aba. ir(url) navega; js(código) roda na página e devolve o valor. */
export async function novaAba(url = "about:blank") {
  const t = await (await fetch(`http://127.0.0.1:${PORTA}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map(); const ouvintes = new Set();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const [ok, erro] = pend.get(d.id); pend.delete(d.id); d.error ? erro(new Error(d.error.message)) : ok(d.result); }
    else ouvintes.forEach((f) => f(d));
  };
  const cmd = (method, params = {}) => new Promise((ok, erro) => { const id = ++seq; pend.set(id, [ok, erro]); ws.send(JSON.stringify({ id, method, params })); });
  await cmd("Page.enable");
  const aba = {
    async ir(u, limite = 30000) {
      const carregou = new Promise((r) => { const f = (d) => { if (d.method === "Page.loadEventFired") { ouvintes.delete(f); r(); } }; ouvintes.add(f); });
      await cmd("Page.navigate", { url: u });
      await Promise.race([carregou, espera(limite)]);
      await espera(1200);
    },
    async js(codigo, limite = 60000) {
      const r = await Promise.race([
        cmd("Runtime.evaluate", { expression: `(async () => { ${codigo} })()`, awaitPromise: true, returnByValue: true }),
        espera(limite).then(() => { throw new Error("a página demorou demais"); })
      ]);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async fechar() { try { ws.close(); await fetch(`http://127.0.0.1:${PORTA}/json/close/${t.id}`); } catch {} }
  };
  return aba;
}
