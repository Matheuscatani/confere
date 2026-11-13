# Rasante.

Passagens baratas saindo de Goiânia para todo o Brasil. Mostra o menor preço de cada dia nos próximos 6 meses e avisa por e-mail quando aparece passagem muito abaixo do preço normal.

## Como funciona

Duas vezes por dia, às 07:00 e às 19:00, o robô roda na nuvem do GitHub (GitHub Actions, gratuito), sem usar o seu Mac:

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
- `../.github/workflows/passagens.yml`: o agendamento das 07:00 e 19:00 na nuvem do GitHub.
