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

- **O site fica em https://rasantegyn.com.br**, no repositório `Matheuscatani/rasante` (página de vendas `index.html`, painel `painel.html`, `app.js`, `acesso.js`, estilos, fotos e imagens dos e-mails). Aqui no computador ele fica em `rasante-site/` (fora deste repositório): edite lá e envie com `git push`.
- Domínio no registro.br (zona DNS no modo avançado: 4 registros A para o GitHub Pages e `www` CNAME para matheuscatani.github.io), com https ligado no GitHub.
- `index.html` e `painel.html` desta pasta só levam ao endereço novo (os links antigos continuam funcionando). `fotos/` e `email/` ficam aqui para os e-mails já enviados.
- `robo/voar.mjs`: o robô. Guarda os preços do painel e a amostra da página de vendas no Supabase. `robo/email.mjs` envia os alertas e `robo/modelo-email.mjs` monta o visual deles.
- `servidor/`: os serviços do Supabase (acesso, amostra, robo, kiwify-webhook, clientes-ativos).
- `../.github/workflows/passagens.yml`: o agendamento de hora em hora na nuvem do GitHub.

## Vendas (Kiwify) e lista de clientes (Supabase)

- Produto **Rasante** na Kiwify, com duas ofertas: 1 ano de alertas (R$ 29,99, https://pay.kiwify.com.br/cllMDNS) e Acesso vitalício (R$ 49,99, https://pay.kiwify.com.br/M8Yt5l7). Os links estão em `vendas.js` e nos botões do `index.html`.
- O webhook "Rasante lista de clientes" da Kiwify (compra aprovada, reembolso, chargeback) avisa `https://jnkvvtdfsfugigcaqplk.supabase.co/functions/v1/kiwify-webhook`.
- Esse serviço (código em `servidor/kiwify-webhook/`) confere a assinatura da Kiwify e guarda o cliente no Supabase, projeto **rasante**: 1 ano (válido até 12 meses depois do pagamento) ou vitalício, pelo nome da oferta ou pelo valor cobrado. Reembolso ou chargeback tira o cliente da lista.
- A cada coleta, o robô pede a lista de clientes ativos em `servidor/clientes-ativos/` e manda o alerta a todos em cópia oculta, em lotes de 90.
- Segredos no GitHub: `GMAIL_SENHA` (senha de app de rasante.gyn@gmail.com) e `RASANTE_ROBO_TOKEN`. No Supabase, tabela `segredos`: `kiwify_token` (o token do webhook na Kiwify) e `robo_token`.
- `servidor/wiven-webhook/` é da tentativa com a Wiven e não é usado.

## Acesso ao painel (um acesso para cada cliente, com senha)

1. A pessoa paga na Kiwify. O `kiwify-webhook` põe o e-mail dela na lista de clientes e manda o e-mail de boas-vindas com o botão **Criar minha senha** (link de uso único, vale 7 dias).
2. O link abre `painel.html#senha=...`: ela escolhe a senha (8 caracteres ou mais) e já entra.
3. Depois, entra com e-mail e senha. "Esqueci minha senha" e "Primeiro acesso" mandam um link novo (vale 1 hora para trocar, 7 dias para criar). Depois de 8 senhas erradas, a conta espera 15 minutos.
4. "Minha conta", no topo do painel, mostra o plano e a validade, troca a senha e sai. Trocar a senha desconecta os outros aparelhos.
5. A chave de acesso fica no aparelho por 60 dias. Assinatura vencida, reembolsada ou estornada perde o acesso na hora.
6. O robô guarda os preços do painel e a memória dele (preço normal, avisos já mandados) no Supabase pelo serviço `servidor/robo/`, com o segredo `RASANTE_ROBO_TOKEN`. Sem esse segredo a coleta na nuvem para com erro, para não repetir alertas.
- Senhas ficam só como resumo PBKDF2 (com sal) na tabela `clientes`; links e chaves de acesso, só como resumo SHA-256.
- Os e-mails da conta (`servidor/_shared/email.ts`) e o alerta de passagens (`robo/modelo-email.mjs`) têm o mesmo visual: fundo azul, logo, título grande e card branco. Imagens em `email/`.
- Os e-mails da conta saem do Gmail rasante.gyn@gmail.com: precisam do segredo `GMAIL_SENHA` também nas Edge Functions do Supabase (Project Settings → Edge Functions → Secrets).
- O alerta por e-mail sai no máximo 3 vezes por dia, às 8h, 13h e 19h (`alertaHoras` no config.json), juntando as ofertas novas desde o anterior. O painel continua atualizando de hora em hora.
- O Gmail comum aceita cerca de 500 destinatários por dia (com 3 alertas por dia, uns 150 clientes). Com muitos clientes, troque o envio por um serviço de e-mail (Brevo, Resend).
