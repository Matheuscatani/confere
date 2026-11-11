/* Confere. · abre o Chrome do robô na página de login das lojas que pedem conta.
   Você entra com a sua conta uma vez; o robô guarda a sessão e usa nas coletas.
   node robo/entrar.mjs */
import { abrirChrome, novaAba } from "./chrome.mjs";

const PAGINAS = [
  "https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fwww.mercadolivre.com.br%2F"
];
await abrirChrome();
for (const p of PAGINAS) await novaAba(p);
console.log("O Chrome do robô está aberto. Entre na sua conta do Mercado Livre nessa janela; pode fechar quando terminar.");
process.exit(0);
