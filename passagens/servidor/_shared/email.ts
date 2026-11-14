// Rasante · modelo dos e-mails da conta (boas-vindas, criar senha, redefinir senha).
// Mesmo visual do alerta de passagem: fundo azul, logo, título grande em branco e um card branco.
import nodemailer from "npm:nodemailer@6.9.16";

export const REMETENTE = "rasante.gyn@gmail.com";
export const SITE = "https://matheuscatani.github.io/confere/passagens/";
export const PAINEL = SITE + "painel.html";
const CAPA = SITE + "email/capa.jpg";

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const primeiroNome = (nome?: string | null) => {
  const p = String(nome || "").trim().split(/\s+/)[0] || "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "";
};
export const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

type Bloco = { titulo: string; texto: string };
export type Modelo = {
  previa: string;
  saudacao: string;
  texto: string;
  plano?: { nome: string; detalhe: string };
  botao: { texto: string; link: string };
  aviso?: string;
  passos?: Bloco[];
  pe?: string;
};

const F = "Arial,Helvetica,sans-serif";
export const LOGO = SITE + "email/logo.png";
export const topo = (titulo: string) => `
  <tr><td style="padding:8px 8px 26px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="46" valign="middle"><img src="${LOGO}" width="38" height="38" alt="" style="display:block;border:0"></td>
      <td valign="middle" style="font-family:${F};font-size:28px;font-weight:bold;color:#ffffff;letter-spacing:-1px">rasante</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 8px 28px;font-family:${F};font-size:38px;line-height:42px;font-weight:bold;color:#ffffff;letter-spacing:-1.5px">${titulo}</td></tr>`;
export const pagina = (previa: string, miolo: string, pe: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Rasante</title></head>
<body style="margin:0;padding:0;background:#0d4f91">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(previa)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d4f91"><tr><td align="center" style="padding:32px 14px 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    ${miolo}
    <tr><td style="padding:22px 8px 0;font-family:${F};font-size:13px;line-height:20px;color:#b9d0ea">${pe}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
export const selo = (t: string) => `<span style="display:inline-block;background:#ff6b3d;color:#10213a;font-family:${F};font-size:17px;font-weight:bold;padding:8px 14px">${esc(t)}</span>`;
export const botao = (t: string, link: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#0d4f91;border-radius:999px">
  <a href="${esc(link)}" style="display:block;padding:17px 20px;font-family:${F};font-size:19px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">${esc(t)}</a></td></tr></table>`;
export const card = (conteudo: string) => `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:28px">
  <tr><td style="padding:30px 30px 26px;font-family:${F};color:#10213a">${conteudo}</td></tr></table></td></tr>`;

export function montar(m: Modelo) {
  const passos = m.passos?.length ? `<div style="margin-top:24px;padding-top:20px;border-top:2px solid #e1e7f0">
      <div style="font-size:17px;font-weight:bold;margin-bottom:4px">Como funciona daqui para frente</div>
      ${m.passos.map((p, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
        <td valign="top" width="42"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:#ff6b3d;color:#ffffff;font-weight:bold;font-size:15px;text-align:center">${i + 1}</div></td>
        <td valign="top" style="font-family:${F};font-size:15px;line-height:22px;color:#10213a"><b>${esc(p.titulo)}</b><br><span style="color:#5b6b82">${p.texto}</span></td>
      </tr></table>`).join("")}</div>` : "";
  const conteudo = `
      <p style="margin:0 0 20px;font-size:17px;line-height:26px">${m.texto}</p>
      <img src="${CAPA}" width="500" alt="Pedra Furada, Jericoacoara" style="display:block;width:100%;height:auto;border:0;border-radius:14px">
      ${m.plano ? `<p style="margin:18px 0 10px;font-size:16px;color:#5b6b82">${esc(m.plano.detalhe)}</p>${selo(m.plano.nome)}` : ""}
      <div style="height:24px;line-height:24px">&nbsp;</div>
      ${botao(m.botao.texto, m.botao.link)}
      ${m.aviso ? `<p style="margin:14px 0 0;text-align:center;font-size:14px;line-height:20px;color:#5b6b82">${m.aviso}</p>` : ""}
      ${passos}`;
  const html = pagina(m.previa, topo(esc(m.saudacao)) + card(conteudo), m.pe ?? "Dúvidas? É só responder este e-mail que a equipe do Rasante te ajuda.<br>Rasante · passagens baratas saindo de Goiânia");

  const texto = [m.saudacao, "", m.texto.replace(/<[^>]+>/g, ""), m.plano ? `\nSeu plano: ${m.plano.nome} (${m.plano.detalhe})` : "",
    `\n${m.botao.texto}: ${m.botao.link}`, m.aviso ? m.aviso.replace(/<[^>]+>/g, "") : "",
    ...(m.passos || []).map((p, i) => `\n${i + 1}. ${p.titulo}: ${p.texto.replace(/<[^>]+>/g, "")}`),
    "\nDúvidas? Responda este e-mail."].join("\n");
  return { html, texto };
}

export async function enviar(para: string, assunto: string, m: Modelo) {
  const senha = (Deno.env.get("GMAIL_SENHA") || "").replace(/\s+/g, "");
  if (!senha) throw new Error("sem GMAIL_SENHA");
  const { html, texto } = montar(m);
  const envio = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: REMETENTE, pass: senha } });
  await envio.sendMail({ from: { name: "Rasante", address: REMETENTE }, to: para, subject: assunto, html, text: texto });
}

/* os dois e-mails que levam ao link de criar ou trocar a senha */
export function emailCriarSenha(nome: string | null, plano: string, valido_ate: string | null, link: string, comprou: boolean): [string, Modelo] {
  const n = primeiroNome(nome);
  const nomePlano = plano === "vitalicio" ? "Acesso vitalício" : "1 ano de alertas";
  const detalhe = plano === "vitalicio" ? "Para sempre, sem mensalidade" : valido_ate ? `Válido até ${dataBr(valido_ate)}` : "Válido por 12 meses";
  return [comprou ? `${n ? n + ", s" : "S"}eu acesso ao Rasante está liberado` : "Crie sua senha do Rasante", {
    previa: "Crie sua senha e veja as passagens mais baratas saindo de Goiânia.",
    saudacao: comprou ? (n ? `${n}, boas-vindas ao Rasante!` : "Boas-vindas ao Rasante!") : (n ? `${n}, crie sua senha` : "Crie sua senha"),
    texto: comprou
      ? "Seu pagamento foi aprovado. Agora falta só um passo: criar a sua senha para entrar no painel com os preços de todas as passagens saindo de Goiânia."
      : "Toque no botão abaixo para criar a sua senha e entrar no painel do Rasante.",
    plano: { nome: nomePlano, detalhe },
    botao: { texto: "Criar minha senha", link },
    aviso: "O link vale por 7 dias. Depois disso, é só pedir outro em “Esqueci minha senha”.",
    passos: comprou ? [
      { titulo: "Crie sua senha", texto: "Pelo botão acima. Ela é só sua e entra em qualquer aparelho." },
      { titulo: "Abra o painel quando quiser", texto: "O menor preço de cada dia para 43 destinos, conferido de hora em hora." },
      { titulo: "Fique de olho neste e-mail", texto: "Quando uma passagem ficar muito abaixo do preço normal, a gente te avisa aqui." },
    ] : undefined,
  }];
}

export function emailRedefinir(nome: string | null, link: string): [string, Modelo] {
  const n = primeiroNome(nome);
  return ["Troque sua senha do Rasante", {
    previa: "Recebemos um pedido para trocar a sua senha.",
    saudacao: n ? `${n}, vamos trocar sua senha` : "Vamos trocar sua senha",
    texto: "Recebemos um pedido para trocar a senha da sua conta no Rasante. Toque no botão para escolher uma nova.",
    botao: { texto: "Criar nova senha", link },
    aviso: "O link vale por 1 hora. Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
  }];
}

/* link de uso único para criar ou trocar a senha; só o resumo (hash) fica no banco */
export const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
export const aleatorio = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, "0")).join("");
export async function criarLink(db: any, email: string, tipo: "criar" | "redefinir") {
  const token = aleatorio(32);
  const horas = tipo === "criar" ? 24 * 7 : 1;
  await db.from("links_senha").update({ usado_em: new Date().toISOString() }).eq("email", email).is("usado_em", null);
  await db.from("links_senha").insert({ token_hash: await hash(token), email, tipo, expira: new Date(Date.now() + horas * 3_600_000).toISOString() });
  return `${PAINEL}#senha=${token}`;
}
