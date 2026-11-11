# Confere.

Loja de ofertas conferidas: compara o mesmo produto em cinco lojas, mostra onde está mais barato e só indica loja com boa nota no Reclame Aqui.

## Como funciona

Toda noite, às 23:59, o robô:

1. lê a nota de cada loja no Reclame Aqui;
2. lê os anúncios de Magalu, Amazon, Mercado Livre, Casas Bahia e Americanas, em cada departamento;
3. junta o mesmo modelo entre as lojas e fica com o menor preço entre as lojas aprovadas;
4. escolhe as 50 melhores ofertas de cada departamento;
5. reescreve o `ofertas.js` e publica o site.

## O que você edita

Só o arquivo `robo/config.json`:

- `parceiroMagalu`, `associadoAmazon` e `afiliados`: seus códigos de afiliado. Sem eles, os links não geram comissão.
- `whatsapp` e `email`: seus contatos no site.
- `notaMinima`: nota mínima no Reclame Aqui para a loja entrar na vitrine (padrão 7). Lojas abaixo disso só aparecem na comparação de preço.
- `porCategoria`: quantas ofertas por departamento (padrão 50).
- `categorias`: os departamentos e as buscas feitas em cada loja.

Não edite o `ofertas.js`: ele é reescrito toda noite.

## Rodar na mão

```bash
node robo/coletar.mjs
```

Teste rápido, com uma busca por departamento e sem publicar:

```bash
node robo/coletar.mjs --teste
```

O que o robô fez fica anotado em `robo/robo.log`.

## Arquivos

- `index.html`, `styles.css`, `app.js`, `ilustracoes.js`: o site.
- `ofertas.js`: o catálogo do dia, escrito pelo robô.
- `robo/coletar.mjs`: o robô. `robo/lojas.mjs`: como ler cada loja. `robo/chrome.mjs`: abre o Chrome do robô.
- `robo/com.confere.robo.plist`: o agendamento das 23:59.

O robô usa um Chrome só dele, com perfil em `~/.confere-robo/chrome`, fora desta pasta.
