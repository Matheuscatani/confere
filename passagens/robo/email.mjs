/* Rasante. · envia os alertas pelo Gmail (Nodemailer na nuvem do GitHub; no Mac, sem instalar nada, pelo curl).
   node passagens/robo/email.mjs

   Abre uma janela do Mac pedindo a SENHA DE APP do Gmail (não a senha da conta):
   myaccount.google.com/apppasswords. Ela vai direto para as Chaves do Mac e o robô usa dali.
   Depois manda um e-mail de teste. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICO = "rasante-gmail";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

function senha(conta) {
  /* na nuvem do GitHub a senha vem do segredo GMAIL_SENHA; no Mac, das Chaves */
  if (process.env.GMAIL_SENHA) return process.env.GMAIL_SENHA.replace(/\s+/g, "");
  try { return execFileSync("security", ["find-generic-password", "-s", SERVICO, "-a", conta, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { throw new Error(`falta a senha de app do Gmail de ${conta}: cadastre o segredo GMAIL_SENHA no GitHub`); }
}

/* texto puro para quem não abre HTML (e para os filtros de spam, que desconfiam de e-mail só com HTML) */
const textoPuro = (html) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|h\d|div)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();

export async function enviarEmail({ de, para, bcc = [], assunto, html }) {
  /* Nodemailer monta a mensagem no padrão que o Gmail confere (Message-ID, DKIM); na nuvem ele é instalado na coleta */
  let nodemailer = null;
  try { nodemailer = (await import("nodemailer")).default; } catch {}
  if (nodemailer) {
    const envio = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: de, pass: senha(de) } });
    await envio.sendMail({ from: { name: "Rasante", address: de }, to: para, bcc, subject: assunto, html, text: textoPuro(html) });
    return;
  }
  /* sem Nodemailer (no Mac, sem instalar nada): mensagem montada aqui e enviada pelo curl */
  const msg = [
    `From: "Rasante" <${de}>`, `To: ${para}`, `Subject: =?UTF-8?B?${b64(assunto)}?=`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${process.pid}.${Math.random().toString(36).slice(2)}@${de.split("@")[1]}>`,
    "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    b64(html).replace(/.{76}/g, "$&\r\n"), ""
  ].join("\r\n");
  const arq = join(tmpdir(), `rasante-${process.pid}.eml`);
  writeFileSync(arq, msg, { mode: 0o600 });
  try {
    /* a senha vai pela entrada do curl, não pela linha de comando */
    execFileSync("curl", ["-sS", "--ssl-reqd", "--url", "smtps://smtp.gmail.com:465", "--mail-from", de, "--mail-rcpt", para, ...bcc.flatMap((b) => ["--mail-rcpt", b]), "--mail-rcpt-allowfails", "--upload-file", arq, "-K", "-"],
      { input: `user = "${de}:${senha(de)}"\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000 });
  } catch (e) { throw new Error(String(e.stderr || e.message).trim()); }
  finally { rmSync(arq, { force: true }); }
}

/* ---------- configuração (rodando direto) ---------- */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "config.json"), "utf8"));
  const conta = cfg.email.de;
  const janela = (script) => execFileSync("osascript", ["-e", script], { encoding: "utf8" }).trim();
  const aviso = (txt) => { try { janela(`display dialog ${JSON.stringify(txt)} buttons {"OK"} default button "OK" with title "Rasante"`); } catch {} };
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let s;
    try {
      s = janela(`with timeout of 1800 seconds
tell application "System Events"
activate
text returned of (display dialog ${JSON.stringify(`Cole a senha de app do Gmail de ${conta} (16 letras, criada em myaccount.google.com/apppasswords) e clique em OK.`)} default answer "" with hidden answer with title "Rasante · ligar o e-mail" buttons {"Cancelar", "OK"} default button "OK")
end tell
end timeout`).replace(/\s+/g, "");
    } catch { console.log("Cancelado."); process.exit(1); }
    if (!/^[a-z]{16}$/i.test(s)) { aviso("A senha de app tem 16 letras (o Google mostra em 4 grupos de 4). Copie de novo e tente outra vez."); continue; }
    execFileSync("security", ["add-generic-password", "-U", "-s", SERVICO, "-a", conta, "-w", s]);
    try {
      await enviarEmail({ de: conta, para: cfg.email.para, assunto: "✈ Rasante.: alertas de passagem ligados", html: `<p>Pronto! Quando aparecer passagem saindo de ${cfg.origem.cidade} muito abaixo do preço normal, o aviso chega aqui.</p>` });
      console.log(`E-mail de teste enviado para ${cfg.email.para}.`);
      aviso(`Pronto! Mandamos um e-mail de teste para ${cfg.email.para}. Pode voltar para o Claude.`);
      process.exit(0);
    } catch (e) {
      console.log("O Gmail recusou:", e.message.slice(0, 300));
      aviso("O Gmail não aceitou essa senha. Confira se é a senha de app (não a senha da conta) e se a verificação em duas etapas está ligada.");
    }
  }
  process.exit(1);
}
