/* Rasante. · o visual do e-mail de alerta: fundo azul, logo, título grande e um card branco por destino
   (foto da cidade, "Goiânia → Ilhéus por R$ 366", data e companhia, selo laranja, botão "Ver o voo").
   Mesmo visual dos e-mails da conta (passagens/servidor/_shared/email.ts). Tabelas e estilo na tag: é o que os e-mails mostram igual. */
const SITE = "https://matheuscatani.github.io/confere/passagens/";
const F = "Arial,Helvetica,sans-serif";
const real = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dia = (d) => new Date(d + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
const semana = (d) => new Date(d + "T12:00").toLocaleDateString("pt-BR", { weekday: "long" });

function card(origem, { d, melhor, outras }, link) {
  const voo = d.detalhe && d.detalhe.data === melhor.data && d.detalhe.voo ? d.detalhe.voo : null;
  const meta = [`${semana(melhor.data)}, ${dia(melhor.data)}`, voo && voo.cia, voo && voo.saida && `sai ${voo.saida}`, "só ida"].filter(Boolean).join(" · ");
  return `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:28px">
  <tr><td style="padding:28px 28px 24px;font-family:${F};color:#10213a">
    <div style="font-size:24px;line-height:30px;font-weight:bold;letter-spacing:-0.5px">${esc(origem)} &rarr; ${esc(d.cidade)} por <span style="white-space:nowrap">${real(melhor.preco)}</span></div>
    <img src="${SITE}fotos/${d.iata}.jpg" width="500" alt="${esc(d.cidade)}" style="display:block;width:100%;height:auto;border:0;border-radius:14px;margin:18px 0 16px">
    <div style="font-size:17px;line-height:24px;color:#5b6b82">${esc(meta)}</div>
    <div style="margin:12px 0 0"><span style="display:inline-block;background:#ff6b3d;color:#10213a;font-size:18px;font-weight:bold;padding:8px 14px">${Math.round(melhor.desconto * 100)}% abaixo do normal</span></div>
    ${outras ? `<div style="margin:12px 0 0;font-size:15px;color:#5b6b82">E mais ${outras} ${outras > 1 ? "datas baratas" : "data barata"} para ${esc(d.cidade)}.</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td align="center" style="background:#0d4f91;border-radius:999px">
      <a href="${esc(link)}" style="display:block;padding:17px 20px;font-family:${F};font-size:19px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">Ver o voo</a>
    </td></tr></table>
    <div style="margin-top:14px;text-align:center;font-size:14px;color:#5b6b82">Normal da rota: ${real(d.normal)} · conferido na página do voo</div>
  </td></tr></table></td></tr>`;
}

export function alertaHtml({ origem, novos, linkVoo, desconto, quando }) {
  const titulo = novos.length === 1 ? `Passagem lá embaixo para ${esc(novos[0].d.cidade)}` : `${novos.length} passagens lá embaixo saindo de ${esc(origem)}`;
  const previa = novos.slice(0, 3).map(({ d, melhor }) => `${d.cidade} por ${real(melhor.preco)}`).join(" · ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Rasante</title></head>
<body style="margin:0;padding:0;background:#0d4f91">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(previa)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d4f91"><tr><td align="center" style="padding:32px 14px 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:8px 8px 26px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="46" valign="middle"><img src="${SITE}email/logo.png" width="38" height="38" alt="" style="display:block;border:0"></td>
        <td valign="middle" style="font-family:${F};font-size:28px;font-weight:bold;color:#ffffff;letter-spacing:-1px">rasante</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0 8px 10px;font-family:${F};font-size:38px;line-height:42px;font-weight:bold;color:#ffffff;letter-spacing:-1.5px">${titulo}</td></tr>
    <tr><td style="padding:0 8px 26px;font-family:${F};font-size:16px;line-height:23px;color:#d6e4f5">Preços de ${esc(quando)}. Passagem barata some rápido: se for viajar, garanta logo.</td></tr>
    ${novos.map((n) => card(origem, n, linkVoo(n.d.busca, n.melhor.data))).join("")}
    <tr><td style="padding:22px 8px 0;font-family:${F};font-size:13px;line-height:20px;color:#b9d0ea">
      Só ida, 1 adulto, com taxas, menor preço do dia entre as companhias, no momento da coleta. Avisamos quando a passagem fica ${Math.round(desconto * 100)}% ou mais abaixo do preço normal da rota.<br>
      Você recebe este alerta porque assinou o Rasante. <a href="${SITE}painel.html" style="color:#ffffff">Abrir o painel</a> · Dúvidas? Responda este e-mail.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
