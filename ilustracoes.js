/* Confere. · desenhos de produto, usados quando o produto ainda não tem `imagem`.
   Formas chapadas em três tons: preto do aparelho, branco do eletrodoméstico, inox. */
(function () {
  const K = "#151515", K2 = "#2b2b2b", W = "#fbfaf8", W2 = "#d9d6d0", S = "#b8bcbf", S2 = "#9da2a6", A = "#256f82", A2 = "#5fa3b4";
  const box = (inner) => `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;

  const D = {
    tv: `<rect x="40" y="90" width="320" height="190" fill="${K}"/><rect x="50" y="100" width="300" height="170" fill="${K2}"/>
         <path d="M50 270 L190 100 H250 L110 270Z" fill="${A}" opacity=".35"/><path d="M130 270 L270 100 H290 L150 270Z" fill="${A2}" opacity=".25"/>
         <rect x="190" y="280" width="20" height="26" fill="${K}"/><rect x="130" y="304" width="140" height="10" fill="${K}"/>`,
    ar: `<rect x="40" y="140" width="320" height="100" fill="${W}"/><rect x="40" y="208" width="320" height="32" fill="${W2}"/>
         <rect x="60" y="222" width="280" height="6" fill="${S2}"/><rect x="300" y="160" width="40" height="10" fill="${A}"/>
         <path d="M120 256 q10 22 0 44 M200 256 q10 22 0 44 M280 256 q10 22 0 44" fill="none" stroke="${A2}" stroke-width="6"/>`,
    arportatil: `<rect x="130" y="70" width="140" height="270" fill="${W}"/><rect x="130" y="70" width="140" height="40" fill="${W2}"/>
         <rect x="150" y="130" width="100" height="120" fill="${W2}"/><rect x="150" y="146" width="100" height="6" fill="${S2}"/><rect x="150" y="170" width="100" height="6" fill="${S2}"/><rect x="150" y="194" width="100" height="6" fill="${S2}"/><rect x="150" y="218" width="100" height="6" fill="${S2}"/>
         <rect x="220" y="84" width="34" height="12" fill="${A}"/><rect x="140" y="340" width="20" height="12" fill="${K}"/><rect x="240" y="340" width="20" height="12" fill="${K}"/>`,
    geladeira: `<rect x="120" y="40" width="160" height="320" fill="${S}"/><rect x="120" y="40" width="160" height="210" fill="#c7cbce"/>
         <rect x="120" y="250" width="160" height="4" fill="${S2}"/><rect x="256" y="70" width="8" height="70" fill="${S2}"/><rect x="256" y="272" width="8" height="50" fill="${S2}"/>
         <rect x="140" y="64" width="40" height="22" fill="${K}"/><rect x="146" y="70" width="14" height="10" fill="${A2}"/><rect x="130" y="360" width="20" height="8" fill="${K}"/><rect x="250" y="360" width="20" height="8" fill="${K}"/>`,
    lavadora: `<rect x="110" y="70" width="180" height="280" fill="${W}"/><rect x="110" y="70" width="180" height="50" fill="${W2}"/>
         <circle cx="160" cy="95" r="14" fill="${S}"/><rect x="200" y="86" width="70" height="18" fill="${K}"/><rect x="206" y="91" width="22" height="8" fill="${A2}"/>
         <rect x="130" y="140" width="140" height="190" fill="${W}"/><rect x="130" y="140" width="140" height="6" fill="${W2}"/>`,
    lavaseca: `<rect x="100" y="60" width="200" height="290" fill="${W}"/><rect x="100" y="60" width="200" height="44" fill="${W2}"/>
         <rect x="118" y="72" width="60" height="20" fill="${K}"/><rect x="124" y="77" width="20" height="10" fill="${A2}"/><circle cx="268" cy="82" r="12" fill="${S}"/>
         <circle cx="200" cy="220" r="78" fill="${S}"/><circle cx="200" cy="220" r="62" fill="${K2}"/><path d="M160 200 a50 50 0 0 1 60 -30" fill="none" stroke="${A2}" stroke-width="8"/>`,
    celular: `<rect x="135" y="40" width="130" height="320" fill="${K}"/><rect x="143" y="56" width="114" height="288" fill="${K2}"/>
         <path d="M143 344 L257 140 V56 L143 260Z" fill="${A}" opacity=".35"/><circle cx="200" cy="66" r="5" fill="${K}"/>`,
    relogio: `<rect x="165" y="40" width="70" height="80" fill="${K2}"/><rect x="165" y="280" width="70" height="80" fill="${K2}"/>
         <rect x="135" y="110" width="130" height="180" fill="${K}"/><rect x="147" y="124" width="106" height="152" fill="${K2}"/>
         <text x="200" y="196" text-anchor="middle" font-family="Albert Sans, sans-serif" font-size="40" font-weight="700" fill="${W}">10:08</text>
         <rect x="170" y="214" width="60" height="8" fill="${A2}"/><rect x="265" y="160" width="10" height="34" fill="${K}"/>`,
    notebook: `<rect x="90" y="80" width="220" height="150" fill="${S}"/><rect x="102" y="92" width="196" height="128" fill="${K2}"/>
         <path d="M102 220 L210 92 H250 L142 220Z" fill="${A}" opacity=".35"/>
         <path d="M60 240 H340 L320 290 H80Z" fill="#c7cbce"/><rect x="60" y="230" width="280" height="12" fill="${S2}"/><rect x="170" y="268" width="60" height="12" fill="${S2}"/>`,
    airfryer: `<rect x="120" y="70" width="160" height="270" fill="${K}"/><rect x="120" y="70" width="160" height="70" fill="${K2}"/>
         <rect x="160" y="90" width="80" height="30" fill="${A}"/><text x="200" y="112" text-anchor="middle" font-family="Albert Sans, sans-serif" font-size="18" font-weight="700" fill="${W}">180°</text>
         <rect x="136" y="170" width="128" height="150" fill="${K2}"/><rect x="170" y="240" width="60" height="18" fill="${W2}"/><rect x="130" y="340" width="24" height="12" fill="${K}"/><rect x="246" y="340" width="24" height="12" fill="${K}"/>`,
    microondas: `<rect x="50" y="110" width="300" height="190" fill="${W}"/><rect x="66" y="126" width="200" height="158" fill="${K2}"/>
         <path d="M66 284 L180 126 H220 L106 284Z" fill="${A}" opacity=".3"/><rect x="280" y="130" width="54" height="24" fill="${K}"/><rect x="286" y="136" width="30" height="12" fill="${A2}"/>
         <circle cx="307" cy="190" r="14" fill="${W2}"/><circle cx="307" cy="236" r="14" fill="${W2}"/><rect x="70" y="300" width="20" height="10" fill="${S2}"/><rect x="310" y="300" width="20" height="10" fill="${S2}"/>`,
    cafeteira: `<rect x="130" y="60" width="140" height="70" fill="${K}"/><rect x="130" y="130" width="40" height="190" fill="${K}"/>
         <rect x="130" y="320" width="160" height="30" fill="${K}"/><rect x="200" y="130" width="40" height="30" fill="${S}"/>
         <rect x="195" y="240" width="56" height="68" fill="${W}"/><rect x="251" y="256" width="16" height="30" fill="none" stroke="${W}" stroke-width="8"/><rect x="200" y="226" width="46" height="14" fill="#6b4a32"/><rect x="230" y="76" width="22" height="12" fill="${A2}"/>`,
    liquidificador: `<path d="M150 60 H270 L254 250 H166Z" fill="${A2}" opacity=".45"/><path d="M150 60 H270 L254 250 H166Z" fill="none" stroke="${S2}" stroke-width="6"/>
         <rect x="146" y="46" width="128" height="18" fill="${K}"/><rect x="266" y="90" width="26" height="110" fill="none" stroke="${S2}" stroke-width="8"/>
         <path d="M150 250 H270 L284 350 H136Z" fill="${K}"/><circle cx="210" cy="300" r="16" fill="${S}"/>`,
    fone: `<path d="M110 220 V190 a90 90 0 0 1 180 0 V220" fill="none" stroke="${K}" stroke-width="18"/>
         <rect x="86" y="210" width="62" height="110" fill="${K}"/><rect x="252" y="210" width="62" height="110" fill="${K}"/>
         <rect x="98" y="226" width="40" height="78" fill="${K2}"/><rect x="262" y="226" width="40" height="78" fill="${K2}"/><rect x="278" y="240" width="8" height="8" fill="${A2}"/>`,
    soundbar: `<rect x="30" y="170" width="300" height="56" fill="${K}"/><rect x="40" y="182" width="280" height="32" fill="${K2}"/>
         <rect x="290" y="150" width="80" height="190" fill="${K}"/><circle cx="330" cy="260" r="28" fill="${K2}"/><circle cx="330" cy="260" r="10" fill="${S2}"/><rect x="50" y="194" width="10" height="8" fill="${A2}"/>`,
    caixa: `<rect x="110" y="120" width="180" height="200" fill="${A}"/><rect x="110" y="120" width="180" height="30" fill="#1d5a6a"/>
         <circle cx="200" cy="240" r="58" fill="#1d5a6a"/><circle cx="200" cy="240" r="24" fill="${K2}"/><rect x="140" y="130" width="24" height="10" fill="${W}"/><rect x="236" y="130" width="24" height="10" fill="${W}"/>`,
    robo: `<ellipse cx="200" cy="230" rx="150" ry="70" fill="${K2}"/><ellipse cx="200" cy="214" rx="150" ry="70" fill="${K}"/>
         <ellipse cx="200" cy="200" rx="60" ry="26" fill="${K2}"/><rect x="186" y="150" width="28" height="12" fill="${A2}"/>`,
    ventilador: `<circle cx="200" cy="140" r="100" fill="${W2}"/><circle cx="200" cy="140" r="86" fill="${W}"/>
         <path d="M200 140 C150 120 150 70 190 60Z M200 140 C250 120 270 160 250 190Z M200 140 C190 190 150 210 130 180Z" fill="${A2}"/><circle cx="200" cy="140" r="16" fill="${K}"/>
         <rect x="192" y="240" width="16" height="100" fill="${S2}"/><rect x="140" y="336" width="120" height="16" fill="${K}"/>`
  };

  window.ilustra = (tipo, alt) => {
    const svg = box(D[tipo] || D.tv);
    return alt ? svg.replace('aria-hidden="true" focusable="false"', `role="img" aria-label="${alt}"`) : svg;
  };
})();
