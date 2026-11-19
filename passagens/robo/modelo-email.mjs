/* Rasante. · o visual do e-mail de alerta: fundo azul, logo, título grande e um card branco por destino
   (foto da cidade, "Goiânia → Ilhéus por R$ 366", data e companhia, selo laranja, botão "Ver o voo").
   Mesmo visual dos e-mails da conta (passagens/servidor/_shared/email.ts). Tabelas e estilo na tag: é o que os e-mails mostram igual. */
const SITE = "https://rasantegyn.com.br/";
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

/* ida e volta: as duas datas, a companhia de cada trecho e um botão para cada passagem */
const botao = (texto, link, fundo, cor) => `<td align="center" style="background:${fundo};border-radius:999px">
      <a href="${esc(link)}" style="display:block;padding:16px 10px;font-family:${F};font-size:17px;font-weight:bold;color:${cor};text-decoration:none;border-radius:999px">${texto}</a></td>`;
function cardPar(origem, { d, v, c }, linkVoo) {
  const trecho = (rotulo, data, voo, preco) => `<tr><td style="padding:6px 0;font-family:${F};font-size:16px;line-height:22px;color:#5b6b82">
      <b style="color:#10213a">${rotulo}</b> ${esc(semana(data))}, ${esc(dia(data))}${voo ? ` · ${esc(voo.cia)}${voo.saida ? ` · sai ${esc(voo.saida)}` : ""}` : ""}</td>
      <td align="right" style="padding:6px 0;font-family:${F};font-size:16px;font-weight:bold;color:#10213a;white-space:nowrap">${real(preco)}</td></tr>`;
  return `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:28px">
  <tr><td style="padding:28px 28px 24px;font-family:${F};color:#10213a">
    <div style="font-size:15px;font-weight:bold;color:#0d4f91;letter-spacing:0.5px;text-transform:uppercase">Ida e volta · ${c.dias} dias</div>
    <div style="margin-top:6px;font-size:24px;line-height:30px;font-weight:bold;letter-spacing:-0.5px">${esc(origem)} &harr; ${esc(d.cidade)} por <span style="white-space:nowrap">${real(c.total)}</span></div>
    <img src="${SITE}fotos/${d.iata}.jpg" width="500" alt="${esc(d.cidade)}" style="display:block;width:100%;height:auto;border:0;border-radius:14px;margin:18px 0 10px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${trecho("Ida", c.ida, d.voos && d.voos[c.ida], c.pi)}
      ${trecho("Volta", c.volta, v.voos && v.voos[c.volta], c.pv)}
    </table>
    <div style="margin:14px 0 0"><span style="display:inline-block;background:#ff6b3d;color:#10213a;font-size:18px;font-weight:bold;padding:8px 14px">${Math.round(c.desconto * 100)}% abaixo do normal</span></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr>
      ${botao("Ver a ida", linkVoo(d.busca, c.ida), "#0d4f91", "#ffffff")}
      <td width="10"></td>
      ${botao("Ver a volta", linkVoo(d.buscaVolta || d.busca, c.volta, true), "#0d4f91", "#ffffff")}
    </tr></table>
    <div style="margin-top:14px;text-align:center;font-size:14px;color:#5b6b82">Normal ida e volta: ${real(c.normal)} · conferido na página do voo</div>
  </td></tr></table></td></tr>`;
}

export function alertaHtml({ origem, novos, pares = [], linkVoo, desconto, quando }) {
  const n = novos.length + pares.length;
  const titulo = n > 1 ? `${n} passagens lá embaixo saindo de ${esc(origem)}`
    : novos.length ? `Passagem lá embaixo para ${esc(novos[0].d.cidade)}` : `Ida e volta lá embaixo para ${esc(pares[0].d.cidade)}`;
  const previa = [...novos.map(({ d, melhor }) => `${d.cidade} por ${real(melhor.preco)}`), ...pares.map(({ d, c }) => `${d.cidade} ida e volta por ${real(c.total)}`)].slice(0, 3).join(" · ");
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
    ${pares.map((p) => cardPar(origem, p, linkVoo)).join("")}
    <tr><td style="padding:12px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:28px">
      <tr><td style="padding:26px 28px 28px;font-family:${F};color:#10213a;text-align:center">
        <div style="font-size:22px;line-height:28px;font-weight:bold;letter-spacing:-0.5px">Quer ver outras passagens?</div>
        <div style="margin:8px 0 20px;font-size:16px;line-height:23px;color:#5b6b82">No seu painel estão os preços de hoje para os 43 destinos saindo de ${esc(origem)}, só ida ou ida e volta.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#ff6b3d;border-radius:999px">
          <a href="${SITE}painel.html" style="display:block;padding:17px 20px;font-family:${F};font-size:19px;font-weight:bold;color:#10213a;text-decoration:none;border-radius:999px">Ver todas as passagens</a>
        </td></tr></table>
      </td></tr></table></td></tr>
    <tr><td style="padding:22px 8px 0;font-family:${F};font-size:13px;line-height:20px;color:#b9d0ea">
      1 adulto, com taxas, menor preço do dia entre as companhias, no momento da coleta. Avisamos quando a passagem fica ${Math.round(desconto * 100)}% ou mais abaixo do preço normal da rota.<br>
      Você recebe este alerta porque assinou o Rasante. <a href="${SITE}painel.html" style="color:#ffffff">Abrir o painel</a> · Dúvidas? Responda este e-mail.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
