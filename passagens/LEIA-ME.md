# Rasante.

Passagens baratas saindo de Goiânia para todo o Brasil. Mostra o menor preço de cada dia nos próximos 6 meses e avisa por e-mail quando aparece passagem muito abaixo do preço normal.

## Como funciona

De hora em hora (aos 7 minutos de cada hora), o robô roda na nuvem do GitHub (GitHub Actions, gratuito), sem usar o seu Mac. Cada coleta leva uns 25 minutos:

1. abre o Google Voos para cada destino e lê o calendário com o menor preço de cada dia (junta LATAM, GOL, Azul e as outras que voam a rota);
2. calcula o preço normal de cada rota: a mediana dos preços nas coletas dos últimos 30 dias;
3. marca como oferta o dia que estiver 35% (ou mais) abaixo do normal e pelo menos R$ 150 mais barato;
4. abre o dia mais barato dos melhores destinos para anotar companhia, horário e paradas;
5. reescreve o `voos.js`, publica o site e manda e-mail com as ofertas novas.

A memória do robô (preço normal de cada rota e avisos já mandados) fica em `robo/historico.json`, `robo/ultima.json` e `robo/avisados.json`, salvos no repositório a cada coleta.

Para ver as coletas ou rodar uma agora: aba **Actions** do repositório → **Passagens** (botão *Run workflow*). O agendamento está em `.github/workflows/passagens.yml`.

Cada passagem é avisada uma vez; só volta a avisar se o preço cair mais 5%.

## O que você edita

Só o arquivo `robo/config.json`:

- `email.para`: quem recebe os alertas. `email.de`: a conta Gmail que envia.
- `alertaDesconto`: quanto abaixo do normal vira alerta (0.35 = 35%).
- `economiaMinima`, `diasMinimos`, `meses`: economia mínima em reais, voos muito em cima da hora ficam fora, quantos meses à frente.
- `destinos`: os destinos lidos. Para São Paulo, Rio e Belo Horizonte o código da cidade (SAO, RIO, BHZ) junta todos os aeroportos.

## Ligar o e-mail (uma vez)

1. Crie uma senha de app em https://myaccount.google.com/apppasswords (precisa da verificação em duas etapas ligada).
2. No GitHub, abra o repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Nome: `GMAIL_SENHA`. Valor: as 16 letras da senha de app. Salve.

## Rodar no Mac (opcional)

```bash
node passagens/robo/voar.mjs
```

Sem publicar e sem e-mail: `--local`. Teste rápido com 3 destinos: `--teste`.

O que o robô fez fica anotado em `robo/robo.log`.

## Arquivos

- `index.html`, `estilo.css`, `app.js`: o site. `voos.js`: os preços, escritos pelo robô.
- `robo/voar.mjs`: o robô. `robo/email.mjs`: envia os alertas. Usa o mesmo Chrome do robô do Confere. (`../robo/chrome.mjs`).
- `../.github/workflows/passagens.yml`: o agendamento de hora em hora na nuvem do GitHub.

## Vendas (Kiwify) e lista de clientes (Supabase)

- Produto **Rasante** na Kiwify, com duas ofertas: 1 ano de alertas (R$ 29,99, https://pay.kiwify.com.br/cllMDNS) e Acesso vitalício (R$ 49,99, https://pay.kiwify.com.br/M8Yt5l7). Os links estão em `vendas.js` e nos botões do `index.html`.
- O webhook "Rasante lista de clientes" da Kiwify (compra aprovada, reembolso, chargeback) avisa `https://jnkvvtdfsfugigcaqplk.supabase.co/functions/v1/kiwify-webhook`.
- Esse serviço (código em `servidor/kiwify-webhook/`) confere a assinatura da Kiwify e guarda o cliente no Supabase, projeto **rasante**: 1 ano (válido até 12 meses depois do pagamento) ou vitalício, pelo nome da oferta ou pelo valor cobrado. Reembolso ou chargeback tira o cliente da lista.
- A cada coleta, o robô pede a lista de clientes ativos em `servidor/clientes-ativos/` e manda o alerta a todos em cópia oculta, em lotes de 90.
- Segredos no GitHub: `GMAIL_SENHA` (senha de app de rasante.gyn@gmail.com) e `RASANTE_ROBO_TOKEN`. No Supabase, tabela `segredos`: `kiwify_token` (o token do webhook na Kiwify) e `robo_token`.
- `servidor/wiven-webhook/` é da tentativa com a Wiven e não é usado.
- O Gmail comum aceita cerca de 500 destinatários por dia. Com muitos clientes, troque o envio por um serviço de e-mail (Brevo, Resend).
