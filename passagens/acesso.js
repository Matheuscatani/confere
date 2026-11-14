/* Rasante · entrada no painel: só quem assinou vê os preços.
   E-mail da compra → código de 6 números no e-mail → chave de acesso guardada neste aparelho (60 dias).
   Com a chave, os preços vêm do servidor e o app.js monta o painel. */
(() => {
  const API = "https://jnkvvtdfsfugigcaqplk.supabase.co/functions/v1/acesso";
  const GUARDA = "rasante-acesso";
  const $ = (s) => document.querySelector(s);
  const ler = () => { try { return JSON.parse(localStorage.getItem(GUARDA) || "null"); } catch { return null; } };
  const gravar = (v) => { try { v ? localStorage.setItem(GUARDA, JSON.stringify(v)) : localStorage.removeItem(GUARDA); } catch {} };
  let email = "";

  async function chamar(corpo, chave) {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { Authorization: "Bearer " + chave } : {}) }, body: JSON.stringify(corpo) });
    let j = {}; try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, ...j };
  }
  const msg = (t, erro) => { const m = $("#entrada-msg"); m.innerHTML = t; m.classList.toggle("erro", !!erro); };
  const ocupado = (form, sim) => form.querySelectorAll("button, input").forEach((el) => (el.disabled = sim));
  const semAssinatura = () => msg(`Não achamos assinatura ativa para <b>${email.replace(/[<>&"]/g, "")}</b>. Confira se é o mesmo e-mail da compra ou <a href="./#planos">assine aqui</a>.`, true);

  function mostrarEntrada() {
    document.body.classList.add("trancado");
    $("#entrada").hidden = false;
    $("#form-email").hidden = false; $("#form-codigo").hidden = true;
    $("#entrada-sub").textContent = "Use o e-mail da compra. Mandamos um código de 6 números para confirmar que é você.";
    if (email) $("#e-email").value = email;
    $("#e-email").focus();
  }

  async function abrirPainel(acesso) {
    const r = await chamar({ acao: "dados" }, acesso.chave).catch(() => ({ ok: false, status: 0 }));
    if (r.ok && r.dados) {
      window.RASANTE = r.dados;
      $("#entrada").hidden = true;
      document.body.classList.remove("trancado");
      $("#sair").title = "Sair de " + r.email;
      const s = document.createElement("script"); s.src = "app.js"; document.body.appendChild(s);
      return;
    }
    if (r.status === 401) gravar(null);
    if (r.status === 403) { gravar(null); email = acesso.email || ""; mostrarEntrada(); semAssinatura(); return; }
    mostrarEntrada();
    if (r.status !== 401) msg(r.erro && r.erro !== "entrar" ? r.erro : "Não conseguimos carregar os preços agora. Confira a internet e tente de novo.", true);
  }

  async function pedirCodigo() {
    const form = $("#form-email");
    email = $("#e-email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg("Confira o e-mail.", true); $("#e-email").focus(); return; }
    ocupado(form, true); msg("Mandando o código…");
    const r = await chamar({ acao: "entrar", email }).catch(() => ({ ok: false, erro: "Sem conexão. Tente de novo." }));
    ocupado(form, false);
    if (r.ok) {
      $("#form-email").hidden = true; $("#form-codigo").hidden = false;
      $("#entrada-sub").textContent = `Mandamos o código para ${email}. Olhe também a caixa de spam.`;
      msg(""); $("#e-codigo").value = ""; $("#e-codigo").focus();
    } else if (r.erro === "sem_assinatura") semAssinatura();
    else msg(r.erro || "Não deu certo. Tente de novo.", true);
  }

  $("#form-email").addEventListener("submit", (e) => { e.preventDefault(); pedirCodigo(); });
  $("#e-reenviar").addEventListener("click", async () => {
    $("#form-codigo").hidden = true; $("#form-email").hidden = false; await pedirCodigo();
  });
  $("#e-trocar").addEventListener("click", () => {
    $("#form-codigo").hidden = true; $("#form-email").hidden = false; msg("");
    $("#entrada-sub").textContent = "Use o e-mail da compra. Mandamos um código de 6 números para confirmar que é você.";
    $("#e-email").focus();
  });
  $("#e-codigo").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); if (e.target.value.length === 6) $("#form-codigo").requestSubmit(); });
  $("#form-codigo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = $("#e-codigo").value;
    if (codigo.length !== 6) { msg("O código tem 6 números.", true); return; }
    const form = $("#form-codigo");
    ocupado(form, true); msg("Conferindo…");
    const r = await chamar({ acao: "conferir", email, codigo }).catch(() => ({ ok: false, erro: "Sem conexão. Tente de novo." }));
    ocupado(form, false);
    if (r.ok && r.chave) { gravar({ chave: r.chave, email: r.email }); msg(""); abrirPainel({ chave: r.chave, email: r.email }); }
    else if (r.erro === "sem_assinatura") semAssinatura();
    else { msg(r.erro || "Não deu certo. Tente de novo.", true); $("#e-codigo").select(); }
  });
  $("#sair").addEventListener("click", async () => {
    const a = ler(); gravar(null);
    if (a) await chamar({ acao: "sair" }, a.chave).catch(() => {});
    location.reload();
  });

  const acesso = ler();
  if (acesso && acesso.chave) { $("#form-email").hidden = true; $("#entrada-sub").textContent = "Abrindo o seu painel…"; abrirPainel(acesso); } else mostrarEntrada();
})();
