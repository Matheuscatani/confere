/* Rasante · entrada no painel: só quem assinou vê os preços.
   Entra com e-mail e senha. A senha é criada pelo link que chega no e-mail depois da compra
   (painel.html#senha=...), e o mesmo caminho serve para "Esqueci minha senha".
   A chave de acesso fica guardada neste aparelho por 60 dias. Com ela, os preços vêm do servidor e o app.js monta o painel. */
(() => {
  const API = "https://jnkvvtdfsfugigcaqplk.supabase.co/functions/v1/acesso";
  const GUARDA = "rasante-acesso";
  const $ = (s) => document.querySelector(s);
  const ler = () => { try { return JSON.parse(localStorage.getItem(GUARDA) || "null"); } catch { return null; } };
  const gravar = (v) => { try { v ? localStorage.setItem(GUARDA, JSON.stringify(v)) : localStorage.removeItem(GUARDA); } catch {} };
  const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const primeiro = (n) => { const p = String(n || "").trim().split(/\s+/)[0] || ""; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""; };
  let tokenLink = null;

  async function chamar(corpo, chave) {
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { Authorization: "Bearer " + chave } : {}) }, body: JSON.stringify(corpo) });
      let j = {}; try { j = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, ...j };
    } catch { return { ok: false, status: 0, erro: "Sem conexão. Confira a internet e tente de novo." }; }
  }
  const msg = (t, tipo) => { const m = $("#entrada-msg"); m.innerHTML = t; m.className = "entrada-msg" + (tipo ? " " + tipo : ""); };
  const ocupado = (form, sim) => form.querySelectorAll("button, input").forEach((el) => (el.disabled = sim));
  const semAssinatura = (email) => msg(`Não achamos assinatura ativa para <b>${esc(email)}</b>. Confira se é o mesmo e-mail da compra ou <a href="./#planos">assine aqui</a>.`, "erro");

  /* ---------- telas da entrada ---------- */
  const TEXTOS = {
    login: ["Entre no seu painel", "Use o e-mail da compra e a sua senha."],
    esqueci: ["Esqueci minha senha", "Digite o e-mail da compra. Mandamos um link para você criar uma senha nova."],
    primeiro: ["Primeiro acesso", "Digite o e-mail da compra. Mandamos um link para você criar a sua senha."],
    senha: ["Crie sua senha", ""],
    abrindo: ["Abrindo o seu painel…", ""],
  };
  function tela(nome, sub) {
    document.body.classList.add("trancado");
    $("#entrada").hidden = false;
    const [t, s] = TEXTOS[nome];
    $("#entrada-titulo").textContent = t;
    $("#entrada-sub").textContent = sub ?? s;
    $("#form-login").hidden = nome !== "login";
    $("#form-esqueci").hidden = nome !== "esqueci" && nome !== "primeiro";
    $("#form-senha").hidden = nome !== "senha";
    $("#entrada-pe").hidden = nome === "senha" || nome === "abrindo";
    msg("");
    const foco = { login: "#l-email", esqueci: "#q-email", primeiro: "#q-email", senha: "#s-senha" }[nome];
    if (foco) setTimeout(() => $(foco).focus(), 30);
  }
  document.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => {
    const destino = b.dataset.ir === "esqueci" && "primeiro" in b.dataset ? "primeiro" : b.dataset.ir;
    if (destino !== "login" && $("#l-email").value) $("#q-email").value = $("#l-email").value;
    tela(destino);
  }));
  document.querySelectorAll(".ver").forEach((b) => b.addEventListener("click", () => {
    const i = b.previousElementSibling, ver = i.type === "password";
    i.type = ver ? "text" : "password"; b.textContent = ver ? "Esconder" : "Mostrar"; b.setAttribute("aria-label", ver ? "Esconder senha" : "Mostrar senha");
  }));

  /* ---------- painel ---------- */
  async function abrirPainel(acesso) {
    tela("abrindo");
    const r = await chamar({ acao: "dados" }, acesso.chave);
    if (r.ok && r.dados) {
      window.RASANTE = r.dados;
      $("#entrada").hidden = true;
      document.body.classList.remove("trancado");
      const s = document.createElement("script"); s.src = "app.js"; document.body.appendChild(s);
      return;
    }
    if (r.status === 401 || r.status === 403) gravar(null);
    tela("login");
    if (acesso.email) $("#l-email").value = acesso.email;
    if (r.status === 403) semAssinatura(acesso.email || "");
    else if (r.status !== 401) msg(r.erro || "Não conseguimos carregar os preços agora. Tente de novo.", "erro");
  }

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#l-email").value.trim().toLowerCase(), senha = $("#l-senha").value;
    if (!emailOk(email)) { msg("Confira o e-mail.", "erro"); $("#l-email").focus(); return; }
    if (!senha) { msg("Digite a sua senha.", "erro"); $("#l-senha").focus(); return; }
    const form = e.target; ocupado(form, true); msg("Entrando…");
    const r = await chamar({ acao: "login", email, senha });
    ocupado(form, false);
    if (r.ok && r.chave) { gravar({ chave: r.chave, email: r.email }); $("#l-senha").value = ""; abrirPainel({ chave: r.chave, email: r.email }); }
    else if (r.erro === "sem_assinatura") semAssinatura(email);
    else if (r.erro === "sem_senha") { $("#q-email").value = email; tela("primeiro"); msg("Você ainda não criou a sua senha. Toque em “Mandar o link” e siga o e-mail.", "ok"); }
    else { msg(r.erro || "Não deu certo. Tente de novo.", "erro"); $("#l-senha").select(); }
  });

  $("#form-esqueci").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#q-email").value.trim().toLowerCase();
    if (!emailOk(email)) { msg("Confira o e-mail.", "erro"); $("#q-email").focus(); return; }
    const form = e.target; ocupado(form, true); msg("Mandando…");
    const r = await chamar({ acao: "esqueci", email });
    ocupado(form, false);
    if (r.ok) msg(`Pronto! Se <b>${esc(email)}</b> tiver assinatura no Rasante, o link chega em instantes. Olhe também a caixa de spam.`, "ok");
    else msg(r.erro || "Não deu certo. Tente de novo.", "erro");
  });

  $("#form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const senha = $("#s-senha").value, senha2 = $("#s-senha2").value;
    if (senha.length < 8) { msg("A senha precisa ter pelo menos 8 caracteres.", "erro"); $("#s-senha").focus(); return; }
    if (senha !== senha2) { msg("As duas senhas não são iguais.", "erro"); $("#s-senha2").focus(); return; }
    const form = e.target; ocupado(form, true); msg("Salvando…");
    const r = await chamar({ acao: "criar_senha", token: tokenLink, senha });
    ocupado(form, false);
    if (r.ok && r.chave) {
      history.replaceState(null, "", location.pathname);
      gravar({ chave: r.chave, email: r.email });
      abrirPainel({ chave: r.chave, email: r.email });
    } else if (r.erro === "sem_assinatura") { history.replaceState(null, "", location.pathname); tela("login"); semAssinatura($("#s-email").value); }
    else msg(r.erro || "Não deu certo. Tente de novo.", "erro");
  });

  /* ---------- minha conta ---------- */
  const dlg = $("#conta");
  const fmtData = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  $("#abrir-conta").addEventListener("click", async () => {
    const a = ler(); if (!a) return location.reload();
    $("#conta-msg").textContent = ""; $("#form-trocar").reset();
    $("#conta-email").textContent = a.email || ""; $("#t-email").value = a.email || "";
    dlg.showModal();
    const r = await chamar({ acao: "conta" }, a.chave);
    if (!r.ok) { if (r.status === 401) { gravar(null); location.reload(); } return; }
    $("#conta-nome").textContent = r.nome ? `Olá, ${primeiro(r.nome)}` : "Olá!";
    $("#conta-email").textContent = r.email;
    $("#conta-plano").textContent = r.plano === "vitalicio" ? "Acesso vitalício" : "1 ano de alertas";
    $("#conta-validade").textContent = r.plano === "vitalicio" ? "Para sempre" : r.valido_ate ? `Válido até ${fmtData(r.valido_ate)}` : "";
  });
  $("#conta-fechar").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("#form-trocar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#conta-msg"), aviso = (t, tipo) => { m.textContent = t; m.className = "entrada-msg " + tipo; };
    const atual = $("#t-atual").value, nova = $("#t-nova").value, nova2 = $("#t-nova2").value;
    if (!atual) return aviso("Digite a sua senha atual.", "erro");
    if (nova.length < 8) return aviso("A senha nova precisa ter pelo menos 8 caracteres.", "erro");
    if (nova !== nova2) return aviso("As duas senhas novas não são iguais.", "erro");
    const form = e.target; ocupado(form, true); aviso("Salvando…", "");
    const r = await chamar({ acao: "trocar_senha", atual, nova }, (ler() || {}).chave);
    ocupado(form, false);
    if (r.ok) { form.reset(); aviso("Senha trocada. Nos outros aparelhos, entre de novo com a senha nova.", "ok"); }
    else if (r.status === 401 && r.erro === "entrar") { gravar(null); location.reload(); }
    else aviso(r.erro || "Não deu certo. Tente de novo.", "erro");
  });
  $("#sair").addEventListener("click", async () => {
    const a = ler(); gravar(null);
    if (a) await chamar({ acao: "sair" }, a.chave);
    location.reload();
  });

  /* ---------- começo ---------- */
  const link = location.hash.match(/senha=([0-9a-f]{64})/);
  if (link) {
    tokenLink = link[1];
    tela("abrindo"); $("#entrada-titulo").textContent = "Só um instante…";
    chamar({ acao: "link", token: tokenLink }).then((r) => {
      if (r.ok) {
        gravar(null);
        const n = primeiro(r.nome);
        tela("senha", `${n ? n + ", e" : "E"}scolha a senha para entrar com ${r.email}.`);
        $("#entrada-titulo").textContent = r.tipo === "redefinir" ? "Crie sua nova senha" : "Crie sua senha";
        $("#s-email").value = r.email;
      } else {
        history.replaceState(null, "", location.pathname);
        tela("esqueci"); msg(r.erro || "Este link não vale mais. Peça outro abaixo.", "erro");
      }
    });
    return;
  }
  const acesso = ler();
  if (acesso && acesso.chave) abrirPainel(acesso); else tela("login");
})();
