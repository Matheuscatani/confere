/* Confere. · liga esta pasta ao seu repositório no GitHub e envia o site pela primeira vez.
   node robo/github.mjs https://github.com/SEU-USUARIO/confere

   Abre uma janela do Mac pedindo o TOKEN do GitHub (não a senha da conta).
   O token vai direto para as Chaves do Mac; depois disso o robô publica sozinho toda noite. */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.argv[2] || "").trim().replace(/\/$/, "").replace(/\.git$/, "");
const m = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/);
if (!m) { console.log("Use assim: node robo/github.mjs https://github.com/SEU-USUARIO/NOME-DO-REPOSITORIO"); process.exit(1); }
const [, dono, repo] = m;

const git = (args, input) => execFileSync("git", args, { cwd: RAIZ, input, encoding: "utf8", stdio: [input ? "pipe" : "ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
const janela = (script) => execFileSync("osascript", ["-e", script], { encoding: "utf8" }).trim();
const aviso = (txt) => { try { janela(`display dialog ${JSON.stringify(txt)} buttons {"OK"} default button "OK" with title "Confere"`); } catch {} };

/* aponta para o repositório, com o usuário no endereço */
let tem = true; try { git(["remote", "get-url", "origin"]); } catch { tem = false; }
git(["config", "credential.helper", "osxkeychain"]);
git(["remote", tem ? "set-url" : "add", "origin", `https://${dono}@github.com/${dono}/${repo}.git`]);

const cred = (token) => `protocol=https\nhost=github.com\nusername=${dono}\npassword=${token}\n\n`;
for (let tentativa = 1; tentativa <= 3; tentativa++) {
  let token;
  try {
    token = janela(`with timeout of 1800 seconds
tell application "System Events"
activate
text returned of (display dialog "Cole aqui o token do GitHub (começa com github_pat_) e clique em OK." default answer "" with hidden answer with title "Confere · ligar o GitHub" buttons {"Cancelar", "OK"} default button "OK")
end tell
end timeout`).trim();
  } catch { console.log("Cancelado."); process.exit(1); }
  if (!/^(github_pat_|ghp_)\w{20,}$/.test(token)) { aviso("Isso não parece um token do GitHub. Ele começa com github_pat_ e não tem espaços. Copie de novo e tente outra vez."); continue; }
  git(["credential", "approve"], cred(token));
  try {
    git(["push", "-u", "origin", "main"]);
    console.log(`Site enviado para ${url}.`);
    console.log(`Agora ative em ${url}/settings/pages (Deploy from a branch · main · / (root) · Save).`);
    console.log(`Endereço do site: https://${dono.toLowerCase()}.github.io/${repo}/`);
    aviso("Pronto! O site foi enviado para o GitHub. Pode voltar para o Claude.");
    process.exit(0);
  } catch (e) {
    git(["credential", "reject"], cred(token));
    const msg = String(e.stderr || e.message);
    console.log("O GitHub recusou:", msg.split("\n").filter((l) => /remote:|fatal:/.test(l)).join(" ").slice(0, 300));
    aviso(/Permission|403/.test(msg)
      ? "O token entrou, mas não tem permissão para gravar no repositório. Confira se ele tem acesso ao repositório e Contents: Read and write."
      : "O GitHub não aceitou esse token. Gere um token novo (Regenerate token) e cole aqui.");
  }
}
process.exit(1);
