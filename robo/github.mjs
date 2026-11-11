/* Confere. · liga esta pasta ao seu repositório no GitHub e envia o site pela primeira vez.
   node robo/github.mjs https://github.com/SEU-USUARIO/confere

   Na primeira vez, o Git pede:
     Username: o seu usuário do GitHub
     Password: o TOKEN que você criou no GitHub (não a senha da conta)
   O Mac guarda o token nas Chaves; depois disso o robô publica sozinho toda noite. */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.argv[2] || "").trim().replace(/\/$/, "");
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url.replace(/\.git$/, ""))) {
  console.log("Use assim: node robo/github.mjs https://github.com/SEU-USUARIO/NOME-DO-REPOSITORIO");
  process.exit(1);
}
const git = (...a) => execFileSync("git", a, { cwd: RAIZ, stdio: "inherit" });
const tem = (() => { try { execFileSync("git", ["remote", "get-url", "origin"], { cwd: RAIZ, stdio: "ignore" }); return true; } catch { return false; } })();
git("config", "credential.helper", "osxkeychain");
git("remote", tem ? "set-url" : "add", "origin", url.endsWith(".git") ? url : url + ".git");
git("push", "-u", "origin", "main");
const [, usuario, repo] = url.replace(/\.git$/, "").match(/github\.com\/([^/]+)\/([^/]+)/);
console.log(`\nPronto. Agora ative o site em ${url.replace(/\.git$/, "")}/settings/pages`);
console.log(`(Source: "Deploy from a branch", Branch: main, pasta / (root), Save).`);
console.log(`Em 1 ou 2 minutos ele fica no ar em https://${usuario.toLowerCase()}.github.io/${repo}/`);
