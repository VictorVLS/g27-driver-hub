// Vector drawing of the G27 modelled on the real wheel: stitched leather rim,
// brushed-aluminium three-spoke plate with the red button columns, round hub
// with the six-button ring, shift paddles and the LED strip on the housing.
// Everything inside .w-rot turns with the real wheel; the light reflection on
// the rim stays put. LED pairs carry data-pair (0 = outer green ... 4 = centre
// red), matching the bit order of the LED command.
window.wheelSVG = function wheelSVG(id, { leds = true } = {}) {
  const ledColors = ['g', 'g', 'o', 'o', 'r', 'r', 'o', 'o', 'g', 'g'];
  const ledPair = [0, 1, 2, 3, 4, 4, 3, 2, 1, 0];
  const ledMarkup = leds
    ? ledColors.map((c, i) => `<rect class="w-led ${c}" data-pair="${ledPair[i]}" x="${(164 + i * 7.4).toFixed(1)}" y="160.5" width="6" height="8" rx="1.5"/>`).join('')
    : '';
  const u = (name) => `url(#${id}-${name})`;
  const redCol = (x) => [212, 229, 246].map((y) => `<rect x="${x + 4}" y="${y}" width="18" height="11" rx="2" fill="${u('red')}" stroke="#3a0609" stroke-width="1"/>`).join('');
  const ring = [[216, 194.3], [184, 194.3], [232, 222], [168, 222], [216, 249.7], [184, 249.7]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${u('knob')}" stroke="#1a1d21" stroke-width="1"/>`).join('');
  const seams = [125, 55, 200, -20].map((a) => {
    const r = (a * Math.PI) / 180, c = Math.cos(r), s = -Math.sin(r);
    return `<line x1="${(200 + 140 * c).toFixed(1)}" y1="${(200 + 140 * s).toFixed(1)}" x2="${(200 + 184 * c).toFixed(1)}" y2="${(200 + 184 * s).toFixed(1)}" stroke="#000" stroke-width="3" opacity="0.8"/>`;
  }).join('');
  return `
<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" id="${id}">
  <defs>
    <linearGradient id="${id}-leather" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#3a3d42"/><stop offset="0.3" stop-color="#1d1f22"/>
      <stop offset="0.7" stop-color="#121315"/><stop offset="1" stop-color="#0b0c0d"/>
    </linearGradient>
    <linearGradient id="${id}-alu" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="#8e969f"/><stop offset="0.18" stop-color="#e4e8ec"/><stop offset="0.35" stop-color="#a9b0b8"/>
      <stop offset="0.5" stop-color="#f0f2f4"/><stop offset="0.65" stop-color="#a3aab3"/><stop offset="0.82" stop-color="#dfe3e7"/><stop offset="1" stop-color="#858d96"/>
    </linearGradient>
    <pattern id="${id}-brush" width="6" height="3" patternUnits="userSpaceOnUse">
      <rect width="6" height="1" fill="#fff" opacity="0.10"/><rect y="2" width="6" height="1" fill="#000" opacity="0.06"/>
    </pattern>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2d32"/><stop offset="0.5" stop-color="#141619"/><stop offset="1" stop-color="#08090a"/>
    </linearGradient>
    <radialGradient id="${id}-hub" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#2c3036"/><stop offset="0.6" stop-color="#111316"/><stop offset="1" stop-color="#050506"/>
    </radialGradient>
    <linearGradient id="${id}-red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff6b6b"/><stop offset="0.5" stop-color="#e01f26"/><stop offset="1" stop-color="#8e0c12"/>
    </linearGradient>
    <radialGradient id="${id}-knob" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#f2f4f6"/><stop offset="0.6" stop-color="#9aa2ab"/><stop offset="1" stop-color="#5b626b"/>
    </radialGradient>
    <linearGradient id="${id}-aluDim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4f555c"/><stop offset="0.4" stop-color="#9aa1a9"/><stop offset="0.7" stop-color="#6c737b"/><stop offset="1" stop-color="#454a50"/>
    </linearGradient>
    <filter id="${id}-drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#000" flood-opacity="0.75"/></filter>
    <filter id="${id}-soft" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="${id}-hl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <ellipse cx="200" cy="386" rx="140" ry="7" fill="#000" opacity="0.5" filter="url(#${id}-soft)"/>
  <g class="w-rot">
    <path d="M160 200 L130 128 Q126 116 136 114 Q144 113 149 121 L182 196 Z" fill="${u('aluDim')}" stroke="#30353b" stroke-width="2"/>
    <path d="M240 200 L270 128 Q274 116 264 114 Q256 113 251 121 L218 196 Z" fill="${u('aluDim')}" stroke="#30353b" stroke-width="2"/>
    <path d="M132 126 Q129 118 136 116" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="2"/>
    <path d="M268 126 Q271 118 264 116" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="2"/>
    <path d="M106 210 Q110 166 152 153 L248 153 Q290 166 294 210 L288 272 Q200 292 112 272 Z" fill="${u('body')}" stroke="#2d3137" stroke-width="2"/>
    <rect x="160" y="157" width="80" height="15" rx="5" fill="#050607" stroke="#2a2e34" stroke-width="1.5"/>
    ${ledMarkup}
    <g filter="url(#${id}-drop)">
    <g stroke="#2c3036" stroke-width="2" stroke-linejoin="round">
      <path d="M30 212 L150 204 L156 262 L36 258 Z" fill="${u('alu')}"/>
      <path d="M370 212 L250 204 L244 262 L364 258 Z" fill="${u('alu')}"/>
      <path d="M162 250 L238 250 L256 372 Q200 384 144 372 Z" fill="${u('alu')}"/>
    </g>
    <g fill="${u('brush')}" stroke="none">
      <path d="M30 212 L150 204 L156 262 L36 258 Z"/>
      <path d="M370 212 L250 204 L244 262 L364 258 Z"/>
      <path d="M162 250 L238 250 L256 372 Q200 384 144 372 Z"/>
    </g>
    <rect x="72" y="207" width="26" height="54" rx="4" fill="#0b0c0e"/>
    <rect x="302" y="207" width="26" height="54" rx="4" fill="#0b0c0e"/>
    ${redCol(72)}${redCol(302)}
    <circle cx="200" cy="200" r="162" fill="none" stroke="#070708" stroke-width="50"/>
    <circle cx="200" cy="200" r="162" fill="none" stroke="${u('leather')}" stroke-width="44"/>
    <circle cx="200" cy="200" r="168" fill="none" stroke="#fff" stroke-opacity="0.05" stroke-width="12"/>
    <circle cx="200" cy="200" r="143" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="5"/>
    <circle cx="200" cy="200" r="176" fill="none" stroke="#5c6168" stroke-width="1.5" stroke-dasharray="4 5" opacity="0.5"/>
    <circle cx="200" cy="200" r="148" fill="none" stroke="#5c6168" stroke-width="1.5" stroke-dasharray="4 5" opacity="0.4"/>
    ${seams}
    </g>
    <rect class="w-marker" x="194" y="16" width="12" height="34" rx="4"/>
    <circle cx="200" cy="222" r="47" fill="${u('hub')}" stroke="${u('alu')}" stroke-width="4"/>
    <circle cx="200" cy="222" r="40" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="2"/>
    ${ring}
    <circle cx="200" cy="222" r="17" fill="#060607" stroke="#3a3f46" stroke-width="1.5"/>
    <text x="200" y="226" text-anchor="middle" fill="#c9cfd6" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="11" letter-spacing="0.5">G27</text>
  </g>
  <path d="M68 104 A162 162 0 0 1 332 104" fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="12" stroke-linecap="round" filter="url(#${id}-hl)" pointer-events="none"/>
</svg>`;
};
