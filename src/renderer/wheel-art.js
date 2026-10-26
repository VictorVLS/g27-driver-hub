// Vector drawing of a G27-style wheel. LED pairs carry data-pair (0 = outer
// green ... 4 = centre red), matching the bit order of the LED command.
window.wheelSVG = function wheelSVG(id, { leds = true } = {}) {
  const ledColors = ['g', 'g', 'o', 'o', 'r', 'r', 'o', 'o', 'g', 'g'];
  const ledPair = [0, 1, 2, 3, 4, 4, 3, 2, 1, 0];
  const ledMarkup = leds
    ? ledColors
        .map((c, i) => `<rect class="w-led ${c}" data-pair="${ledPair[i]}" x="${139 + i * 12.6}" y="150" width="9" height="13" rx="2.5"/>`)
        .join('')
    : '';
  return `
<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" id="${id}">
  <defs>
    <linearGradient id="${id}-leather" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b3037"/><stop offset=".5" stop-color="#16191e"/><stop offset="1" stop-color="#23272e"/>
    </linearGradient>
    <linearGradient id="${id}-metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a616c"/><stop offset=".45" stop-color="#9aa2ad"/><stop offset="1" stop-color="#3f454e"/>
    </linearGradient>
  </defs>
  <g class="w-rot">
    <path class="w-paddle" d="M58 168 q-14 32 0 64 l18 -6 q-8 -26 0 -52z"/>
    <path class="w-paddle" d="M342 168 q14 32 0 64 l-18 -6 q8 -26 0 -52z"/>
    <circle class="w-rim" cx="200" cy="200" r="183"/>
    <circle class="w-grip" cx="200" cy="200" r="166" style="stroke:url(#${id}-leather)"/>
    <circle class="w-stitch" cx="200" cy="200" r="181"/>
    <circle class="w-stitch" cx="200" cy="200" r="151"/>
    <circle cx="200" cy="200" r="149" fill="#0c0e11" stroke="none" opacity=".55"/>
    <path class="w-spoke" style="fill:url(#${id}-metal)" d="M42 190 Q90 176 132 178 L142 236 Q96 236 46 238 Z"/>
    <path class="w-spoke" style="fill:url(#${id}-metal)" d="M358 190 Q310 176 268 178 L258 236 Q304 236 354 238 Z"/>
    <path class="w-spoke" style="fill:url(#${id}-metal)" d="M168 262 L232 262 L222 352 Q200 360 178 352 Z"/>
    <path class="w-hub" d="M132 156 Q200 132 268 156 L276 244 Q262 282 200 288 Q138 282 124 244 Z"/>
    <rect x="132" y="146" width="136" height="21" rx="7" fill="#0b0d10" stroke="#2a2f37"/>
    ${ledMarkup}
    <circle class="w-btn red" cx="84" cy="196" r="9"/>
    <circle class="w-btn" cx="106" cy="214" r="8"/>
    <circle class="w-btn" cx="80" cy="222" r="8"/>
    <circle class="w-btn red" cx="316" cy="196" r="9"/>
    <circle class="w-btn" cx="294" cy="214" r="8"/>
    <circle class="w-btn" cx="320" cy="222" r="8"/>
    <rect class="w-badge" x="160" y="208" width="80" height="40" rx="10"/>
    <text class="w-text" x="200" y="236" text-anchor="middle">G27</text>
    <rect class="w-marker" x="194" y="14" width="12" height="30" rx="4"/>
  </g>
</svg>`;
};
