/* global hub, wheelSVG */
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let S = null; // state from main process
let drv = null; // last driver status
let ledMask = 0;
const COLORS = ['#00b8fc', '#34d17c', '#ffb22e', '#ff5468', '#a46bff', '#ff7ad9', '#2ee6d6', '#e9edf2'];

const profile = () => S.config.profiles.find((p) => p.id === S.activeId) || S.config.profiles[0];
const settings = () => profile().settings;

// ---------- i18n ----------
// Portuguese strings are the keys; window.I18N_EN maps them to English.
let lang = 'pt';
const EN = window.I18N_EN || {};
function t(s, ...args) {
  let r = lang === 'en' && EN[s] ? EN[s] : s;
  args.forEach((a, i) => { r = r.replace(`{${i}}`, a); });
  return r;
}
const sourceText = new WeakMap();
// Translates the static markup in place, remembering each node's Portuguese text.
function translateStatic() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!sourceText.has(n)) {
      const key = n.nodeValue.trim();
      if (!key || !(key in EN)) continue;
      sourceText.set(n, n.nodeValue);
    }
    const src = sourceText.get(n);
    const key = src.trim();
    n.nodeValue = src.replace(key, t(key));
  }
  for (const attr of ['title', 'placeholder']) {
    $$(`[${attr}]`).forEach((el) => {
      const store = `i18n${attr}`;
      if (!el.dataset[store]) {
        if (!(el.getAttribute(attr) in EN)) return;
        el.dataset[store] = el.getAttribute(attr);
      }
      el.setAttribute(attr, t(el.dataset[store]));
    });
  }
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
}

// ---------- toasts ----------
function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3200);
}
hub.onToast(({ text, kind }) => toast(text, kind));

// ---------- navigation ----------
function showView(name) {
  $$('.rail button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  if (name === 'system') refreshDriver();
}
$$('.rail button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)));
$('#heroWheel').addEventListener('click', () => showView('wheel'));
$$('[data-win]').forEach((b) => b.addEventListener('click', () => hub.win(b.dataset.win)));

// ---------- profile switcher ----------
const menu = $('#profileMenu');
$('#profileBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
  if (!menu.hidden) renderMenu();
});
document.addEventListener('click', () => { menu.hidden = true; });
function renderMenu() {
  menu.innerHTML = S.config.profiles.map((p) => `
    <button data-id="${p.id}" class="${p.id === S.activeId ? 'on' : ''}">
      <span class="m-dot" style="background:${p.color}"></span>${esc(p.name)}<span class="m-exe">${p.exe ? esc(p.exe) : t('padrão')}</span>
    </button>`).join('') + `<hr><button data-manage="1">${t('Gerenciar perfis…')}</button>`;
  $$('button', menu).forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.manage) return showView('profiles');
    applyState(await hub.activateProfile(b.dataset.id));
  }));
}

// ---------- state rendering ----------
function applyState(st) {
  S = st;
  if (S.config.prefs.lang !== lang) {
    lang = S.config.prefs.lang === 'en' ? 'en' : 'pt';
    translateStatic();
    btnCount = -1; // force re-render of labelled lists
    axesCount = -1;
  }
  const p = profile();
  $('#profileName').textContent = p.name;
  $('#profileDot').style.background = p.color;
  $('#profileDot').style.boxShadow = `0 0 10px ${p.color}`;
  $('#profileAuto').hidden = !S.autoProfileId;
  $$('.js-profile-name').forEach((e) => { e.textContent = p.name; });
  renderSettings();
  renderTiles();
  renderDevice(S.device);
  renderProfiles();
  renderPrefs();
  if (drv) refreshDriverView();
  if (upd.status) renderUpdate(upd); // re-translate
  $('#aboutVer').textContent = t('Versão {0} · Electron {1}', S.versions.app, S.versions.electron);
}
hub.onState(applyState);
hub.onDevice((d) => { S.device = d; renderDevice(d); refreshDriver(); });

function renderTiles() {
  const s = settings();
  $('#tRange').textContent = `${s.range}°`;
  $('#tCenter').textContent = s.autocenter ? `${s.autocenter}%` : t('Desligada');
  $('#tOverall').textContent = `${s.overall}%`;
  $('#tProfile').textContent = profile().name;
}

function renderDevice(d) {
  const chip = $('#deviceChip');
  chip.className = 'device-chip ' + (d.connected ? (d.native ? 'ok' : 'warn') : (drv && drv.present ? 'bad' : ''));
  $('.txt', chip).textContent = d.connected
    ? `${t(d.model)}${d.native ? '' : ' — 200°'}`
    : drv && drv.present ? t('Volante com problema no driver') : t('Volante desconectado');
  $('#heroModel').textContent = d.connected ? t(d.model) : 'G27 Racing Wheel';
  $('#heroSub').textContent = d.connected
    ? t(d.native ? 'Conectado · modo nativo (900°, pedais separados)' : 'Conectado · modo de compatibilidade')
    : t(drv && drv.present ? 'Detectado na USB, mas o Windows não carregou o driver' : 'Conecte o volante na USB');
  $('#modePill').className = 'status-pill ' + (d.connected ? (d.native ? 'ok' : 'warn') : '');
  $('#modePill').textContent = d.connected
    ? t(d.native ? 'Nativo · PID {0}' : 'Compatibilidade · PID {0}', d.productId)
    : t('desconectado');
  $('#btnNative').disabled = !d.connected || d.native;
  renderAlert();
}

function renderAlert() {
  const a = $('#homeAlert');
  const d = S.device;
  let cfg = null;
  if (drv && drv.present && !drv.healthy) {
    cfg = {
      cls: 'bad',
      title: t('O driver do volante está quebrado'),
      text: t('O Windows não consegue carregar o driver do G27{0}. Sem ele não há Force Feedback nos jogos.', drv.problem ? t(' (código {0})', drv.problem) : ''),
      btn: t('Reparar agora'),
      act: () => { showView('system'); repairDriver(); },
    };
  } else if (d.connected && !d.native) {
    cfg = {
      cls: '',
      title: t('Volante em modo de compatibilidade'),
      text: t('Limitado a 200° e pedais combinados. Ative o modo nativo para liberar 900°.'),
      btn: t('Ativar modo nativo'),
      act: () => hub.switchNative(),
    };
  }
  a.hidden = !cfg;
  $('#sysBadge').hidden = !((drv && drv.present && !drv.healthy) || ['available', 'ready'].includes(upd.status));
  if (!cfg) return;
  a.className = 'alert ' + cfg.cls;
  $('#homeAlertTitle').textContent = cfg.title;
  $('#homeAlertText').textContent = cfg.text;
  $('#homeAlertBtn').textContent = cfg.btn;
  $('#homeAlertBtn').onclick = cfg.act;
}

// ---------- settings ----------
let lastAngle = null; // last wheel angle drawn; null forces a redraw
let pending = {};
let flushQueued = false;
function update(patch) {
  Object.assign(settings(), patch);
  Object.assign(pending, patch);
  renderTiles();
  if (flushQueued) return;
  flushQueued = true;
  setTimeout(() => { flushQueued = false; const p = pending; pending = {}; hub.updateSettings(p); }, 50);
}

function paintSlider(input) {
  const min = +input.min, max = +input.max;
  input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
}

function renderSettings() {
  const s = settings();
  $$('.field[data-key]').forEach((f) => {
    const input = $('input', f);
    input.value = s[f.dataset.key];
    $('output', f).textContent = `${s[f.dataset.key]}%`;
    paintSlider(input);
  });
  $$('input[type=checkbox][data-key]').forEach((c) => { c.checked = !!s[c.dataset.key]; });
  $('#centerStrengthField').classList.toggle('disabled', !s.centeringSpring);
  setRangeUI(s.range);
}

$$('.field[data-key]').forEach((f) => {
  const input = $('input', f);
  input.addEventListener('input', () => {
    const v = +input.value;
    $('output', f).textContent = `${v}%`;
    paintSlider(input);
    update({ [f.dataset.key]: v });
  });
});

$$('input[type=checkbox][data-key]').forEach((c) => c.addEventListener('change', async () => {
  const key = c.dataset.key;
  if (key === 'combinedPedals') {
    c.disabled = true;
    const r = await hub.setCombinedPedals(c.checked);
    c.disabled = false;
    if (!r.ok) { c.checked = !c.checked; toast(r.message || t('Não foi possível alterar os pedais'), 'error'); return; }
    toast(t(c.checked ? 'Pedais combinados ativados' : 'Pedais separados ativados'), 'ok');
  }
  update({ [key]: c.checked });
  $('#centerStrengthField').classList.toggle('disabled', !settings().centeringSpring);
}));

$('#resetSettings').addEventListener('click', () => {
  update({
    range: 900, autocenter: 30, overall: 100, spring: 100, damper: 100, centeringSpring: false, centeringStrength: 100, allowGame: true,
    dz_accel_start: 0, dz_accel_end: 0, dz_brake_start: 0, dz_brake_end: 0, dz_clutch_start: 0, dz_clutch_end: 0,
  });
  renderSettings();
  toast(t('Padrões restaurados'), 'ok');
});

// range gauge: the semicircle spans ±450° (the G27 maximum); the blue arc
// covers ±range/2 around the top and the needle shows the wheel inside it.
const ARC = Math.PI * 100;
function setRangeUI(r) {
  $('#rangeVal').textContent = r;
  $('#rangeSlider').value = r;
  paintSlider($('#rangeSlider'));
  const len = (ARC * r) / 900;
  $('#gaugeFill').style.strokeDasharray = `0 ${(ARC - len) / 2} ${len} ${ARC}`;
  $$('#rangePresets button').forEach((b) => b.classList.toggle('on', +b.dataset.v === r));
  lastAngle = null; // re-place the needle for the new range
}
function setNeedle(angle, range) {
  const half = range / 2;
  const a = Math.max(-half, Math.min(half, angle));
  $('#gaugeNeedle').style.transform = `rotate(${(a / 450) * 90}deg)`;
}
$('#rangeSlider').addEventListener('input', (e) => { setRangeUI(+e.target.value); update({ range: +e.target.value }); });
$$('#rangePresets button').forEach((b) => b.addEventListener('click', () => { setRangeUI(+b.dataset.v); update({ range: +b.dataset.v }); }));

// motor test: hold to push
$$('[data-force]').forEach((b) => {
  const stop = () => hub.stopForce();
  b.addEventListener('mousedown', () => hub.testForce(+b.dataset.force));
  b.addEventListener('mouseup', stop);
  b.addEventListener('mouseleave', stop);
});

// ---------- wheel art ----------
$('#heroWheel').innerHTML = wheelSVG('hw');
$('#liveWheel').innerHTML = wheelSVG('lw', { leds: false });
function paintLeds() {
  $$('#hw .w-led').forEach((l) => l.classList.toggle('on', !!(ledMask & (1 << +l.dataset.pair))));
  $$('#ledBar .led').forEach((l) => l.classList.toggle('on', !!(ledMask & (1 << +l.dataset.pair))));
}

// ---------- LEDs ----------
const ledDefs = [['g', 0], ['g', 1], ['o', 2], ['o', 3], ['r', 4], ['r', 4], ['o', 3], ['o', 2], ['g', 1], ['g', 0]];
$('#ledBar').innerHTML = ledDefs.map(([c, p]) => `<button class="led ${c}" data-pair="${p}"></button>`).join('');
function setLeds(mask) {
  ledMask = mask & 0x1f;
  paintLeds();
  if (S.device.connected) hub.setLeds(ledMask).catch(() => {});
}
$$('#ledBar .led').forEach((l) => l.addEventListener('click', () => { stopSweep(); setLeds(ledMask ^ (1 << +l.dataset.pair)); }));
const rpmToMask = (pct) => (1 << Math.round((pct / 100) * 5)) - 1;
$('#rpmSlider').addEventListener('input', (e) => {
  stopSweep();
  $('#rpmOut').textContent = `${e.target.value}%`;
  paintSlider(e.target);
  setLeds(rpmToMask(+e.target.value));
});
paintSlider($('#rpmSlider'));
let sweepTimer = null;
function stopSweep() { clearInterval(sweepTimer); sweepTimer = null; }
$('#ledSweep').addEventListener('click', () => {
  stopSweep();
  let step = 0;
  sweepTimer = setInterval(() => {
    step += 1;
    const pct = (Math.sin(step / 7 - Math.PI / 2) + 1) * 50;
    const blink = pct > 96 && step % 2;
    setLeds(blink ? 0 : rpmToMask(pct));
    if (step > 140) { stopSweep(); setLeds(0); }
  }, 45);
});
$('#ledAll').addEventListener('click', () => { stopSweep(); setLeds(0x1f); });
$('#ledOff').addEventListener('click', () => { stopSweep(); setLeds(0); });

// ---------- live inputs (Gamepad API) ----------
const MAP_KEY = 'g27.axisMap';
const DEFAULT_MAP = { wheel: 0, accel: 2, brake: 5, clutch: 6, rest: {} };
let axisMap = (() => { try { return { ...DEFAULT_MAP, ...JSON.parse(localStorage.getItem(MAP_KEY)) }; } catch { return { ...DEFAULT_MAP }; } })();
const saveMap = () => { try { localStorage.setItem(MAP_KEY, JSON.stringify(axisMap)); } catch { /* ignore */ } };
const GEARS = { 8: '1', 9: '2', 10: '3', 11: '4', 12: '5', 13: '6', 14: 'R' };
// Neutral sits in the middle column (between 3rd and 4th), like the real G27 shifter.
const GEAR_POS = { N: [90, 80], 1: [30, 30], 2: [30, 130], 3: [90, 30], 4: [90, 130], 5: [150, 30], 6: [150, 130], R: [200, 130] };
$('#gears').innerHTML = Object.entries(GEAR_POS).filter(([k]) => k !== 'N')
  .map(([k, [x, y]]) => `<text data-g="${k}" x="${x}" y="${y < 80 ? y - 12 : y + 24}">${k}</text>`).join('');

function findPad() {
  const pads = [...navigator.getGamepads()].filter(Boolean);
  return pads.find((p) => /046d/i.test(p.id) && /c29[4-9ab]|g27|g25|driving force/i.test(p.id))
    || pads.find((p) => /wheel|racing/i.test(p.id)) || null;
}

function pedalPct(gp, key) {
  const i = axisMap[key];
  if (i == null || i >= gp.axes.length) return null;
  const v = gp.axes[i];
  let rest = axisMap.rest[i];
  if (rest == null) rest = v >= 0 ? 1 : -1;
  return Math.max(0, Math.min(1, Math.abs(v - rest) / 2));
}

let learning = null;
let btnCount = -1;
function renderButtons(n) {
  btnCount = n;
  $('#btnGrid').innerHTML = Array.from({ length: n }, (_, i) =>
    `<i>${i + 1}${GEARS[i] ? `<small>${t('marcha {0}', GEARS[i])}</small>` : ''}</i>`).join('');
  $('#btnCount').textContent = t('{0} botões', n);
}

let axesCount = -1;
function renderAxes(n) {
  axesCount = n;
  const names = { wheel: 'volante', accel: 'acelerador', brake: 'freio', clutch: 'embreagem' };
  $('#axesList').innerHTML = Array.from({ length: n }, (_, i) => {
    const role = Object.keys(names).find((k) => axisMap[k] === i);
    return `<div class="axis"><span>${t('Eixo {0}', i)}${role ? `<br><small>${t(names[role])}</small>` : ''}</span><div class="bar"><div></div></div><b>0.00</b></div>`;
  }).join('');
}

function tick() {
  const gp = findPad();
  const s = S && settings();
  if (gp && s) {
    $('#padInfo').textContent = t('Lendo: {0}', gp.id);
    const v = gp.axes[axisMap.wheel] || 0;
    const angle = Math.round((v * s.range) / 2);
    if (angle !== lastAngle) {
      lastAngle = angle;
      $('#inAngle').textContent = angle;
      $('#liveAngle').textContent = `${angle > 0 ? '+' : ''}${angle}°`;
      $('#lw .w-rot').style.transform = `rotate(${angle}deg)`;
      $('#hw .w-rot').style.transform = `rotate(${angle}deg)`;
      setNeedle(angle, s.range);
    }
    const bar = $('#inWheelBar');
    bar.style.left = `${50 + Math.min(0, v) * 50}%`;
    bar.style.width = `${Math.abs(v) * 50}%`;

    for (const key of ['accel', 'brake', 'clutch']) {
      const el = $(`.pedal[data-pedal="${key}"]`);
      const pct = pedalPct(gp, key);
      const start = (s[`dz_${key}_start`] || 0) / 100;
      const end = (s[`dz_${key}_end`] || 0) / 100;
      $('.pbar .fill', el).style.height = `${(pct || 0) * 100}%`;
      $('.dz.start', el).style.height = `${start * 100}%`;
      $('.dz.end', el).style.height = `${end * 100}%`;
      $('.pv', el).textContent = pct == null ? '—' : `${Math.round(pct * 100)}%`;
      // What a DirectInput game reads once the calibration dead zones apply.
      const game = pct == null ? null : Math.max(0, Math.min(1, (pct - start) / Math.max(0.01, 1 - start - end)));
      $('.pg', el).textContent = (start || end) && game != null ? t('jogo {0}%', Math.round(game * 100)) : '';
    }

    if (gp.buttons.length !== btnCount) renderButtons(gp.buttons.length);
    const cells = $$('#btnGrid i');
    let gear = 'N';
    gp.buttons.forEach((b, i) => {
      cells[i].classList.toggle('on', b.pressed);
      if (b.pressed && GEARS[i]) gear = GEARS[i];
    });
    $('#gearTxt').textContent = gear;
    const [kx, ky] = GEAR_POS[gear];
    $('#knob').setAttribute('cx', kx);
    $('#knob').setAttribute('cy', ky);
    $$('#gears text').forEach((g) => g.classList.toggle('on', g.dataset.g === gear));

    // Chromium exposes the POV hat as axis 9: -1..1 in 8 steps, >1 when centred.
    const hat = gp.axes[9];
    const dir = hat != null && hat <= 1.01 ? Math.round(((hat + 1) * 7) / 2) : -1;
    const on = { up: [7, 0, 1], right: [1, 2, 3], down: [3, 4, 5], left: [5, 6, 7] };
    $$('#dpad i').forEach((i) => i.classList.toggle('on', on[i.dataset.d].includes(dir)));

    if (gp.axes.length !== axesCount) renderAxes(gp.axes.length);
    $$('#axesList .axis').forEach((row, i) => {
      const a = gp.axes[i];
      $('.bar div', row).style.left = `calc(${((Math.max(-1, Math.min(1, a)) + 1) / 2) * 100}% - 2px)`;
      $('b', row).textContent = a.toFixed(2);
    });

    if (learning) stepLearning(gp);
  } else {
    $('#padInfo').textContent = t('Nenhum volante lendo ainda — mexa no volante ou aperte um botão para o Windows liberar a leitura.');
  }
  requestAnimationFrame(tick);
}

// Pedal mapping. The rest position of every axis is captured once, with all
// pedals released. For each pedal we wait for one axis (not the wheel, the hat
// or an axis already taken) to move far from rest, then for that axis to come
// back to rest, and only then move on, so releasing a pedal is never read as
// the next pedal being pressed.
const LEARN_ORDER = [['accel', 'ACELERADOR'], ['brake', 'FREIO'], ['clutch', 'EMBREAGEM']];
const PRESS_DELTA = 1.2; // a full press moves a pedal axis by ~2.0
const RELEASE_DELTA = 0.25;
const CLUTCH_TIMEOUT_MS = 8000;
function startLearning() {
  const gp = findPad();
  if (!gp) return toast(t('Volante não encontrado na leitura de entradas'), 'error');
  learning = { step: 0, rest: [...gp.axes], taken: new Set(), pressed: null, map: {}, t0: performance.now() };
  showLearnStep();
}
function showLearnStep() {
  $$('.pedal').forEach((p) => p.classList.remove('learn'));
  const [key, label] = LEARN_ORDER[learning.step];
  $(`.pedal[data-pedal="${key}"]`).classList.add('learn');
  $('#calibMsg').textContent = t('Pise até o fundo no {0} e solte. {1}', t(label), key === 'clutch' ? t('(Sem embreagem? espere 8 s.)') : '');
}
function stepLearning(gp) {
  const L = learning;
  const [key, label] = LEARN_ORDER[L.step];
  if (L.pressed == null) {
    let best = -1, delta = 0;
    gp.axes.forEach((a, i) => {
      if (i === axisMap.wheel || i === 9 || L.taken.has(i)) return;
      const d = Math.abs(a - L.rest[i]);
      if (d > delta) { delta = d; best = i; }
    });
    if (delta > PRESS_DELTA) {
      L.pressed = best;
      $('#calibMsg').textContent = t('{0} detectado — agora solte o pedal.', t(label));
    } else if (key === 'clutch' && performance.now() - L.t0 > CLUTCH_TIMEOUT_MS) {
      L.map.clutch = null;
      next();
    }
    return;
  }
  // wait until the pressed pedal is back at rest before the next one
  if (Math.abs(gp.axes[L.pressed] - L.rest[L.pressed]) < RELEASE_DELTA) {
    L.map[key] = L.pressed;
    L.taken.add(L.pressed);
    next();
  }
  function next() {
    L.step += 1;
    L.pressed = null;
    L.t0 = performance.now();
    if (L.step < LEARN_ORDER.length) return showLearnStep();
    for (const [k, axis] of Object.entries(L.map)) {
      axisMap[k] = axis;
      if (axis != null) axisMap.rest[axis] = L.rest[axis] >= 0 ? 1 : -1;
    }
    learning = null;
    saveMap();
    axesCount = -1; // refresh the axis labels
    $$('.pedal').forEach((p) => p.classList.remove('learn'));
    $('#calibMsg').textContent = t('Pedais mapeados.');
    toast(t('Pedais mapeados'), 'ok');
  }
}
$('#calibPedals').addEventListener('click', startLearning);

// ---------- profiles ----------
function renderProfiles() {
  const grid = $('#profileGrid');
  grid.innerHTML = S.config.profiles.map((p) => `
    <div class="pcard ${p.id === S.activeId ? 'active' : ''}" data-id="${p.id}" style="--c:${p.color}55" role="button">
      <div class="art"></div>
      <div class="initial">${esc(p.name.slice(0, 1).toUpperCase())}</div>
      ${p.id === S.activeId ? `<span class="tag">${S.autoProfileId ? 'AUTO' : t('ATIVO')}</span>` : ''}
      ${p.id !== 'desktop' ? `<div class="tools">
        <button data-edit="${p.id}" title="${t('Editar')}"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
        <button data-del="${p.id}" title="${t('Excluir')}"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg></button>
      </div>` : ''}
      <div class="pname">${esc(p.name)}</div>
      <div class="pexe">${p.exe ? esc(p.exe) : t('Perfil padrão (fora dos jogos)')}</div>
      <div class="pmeta"><span>${p.settings.range}°</span><span>FFB ${p.settings.overall}%</span></div>
    </div>`).join('') + `
    <button class="pcard add" id="addProfile"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>${t('Adicionar jogo')}</button>`;

  $$('.pcard[data-id]', grid).forEach((c) => c.addEventListener('click', async (e) => {
    if (e.target.closest('.tools')) return;
    applyState(await hub.activateProfile(c.dataset.id));
  }));
  $$('[data-edit]', grid).forEach((b) => b.addEventListener('click', () => openModal(S.config.profiles.find((p) => p.id === b.dataset.edit))));
  $$('[data-del]', grid).forEach((b) => b.addEventListener('click', async () => {
    const p = S.config.profiles.find((x) => x.id === b.dataset.del);
    if (confirm(t('Excluir o perfil "{0}"?', p.name))) applyState(await hub.deleteProfile(p.id));
  }));
  $('#addProfile').addEventListener('click', () => openModal(null));
}

let editing = null;
let pickedColor = COLORS[0];
async function openModal(p) {
  editing = p;
  pickedColor = p ? p.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  $('#modalTitle').textContent = t(p ? 'Editar perfil' : 'Adicionar jogo');
  $('#mName').value = p ? p.name : '';
  $('#mExe').value = p ? p.exe || '' : '';
  $('#mColors').innerHTML = COLORS.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === pickedColor ? 'on' : ''}"></button>`).join('');
  $$('#mColors button').forEach((b) => b.addEventListener('click', () => {
    pickedColor = b.dataset.c;
    $$('#mColors button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#modal').hidden = false;
  $('#mName').focus();
  const procs = await hub.listProcesses();
  const skip = /^(svchost|system|registry|smss|csrss|wininit|services|lsass|winlogon|dwm|explorer|conhost|runtimebroker|searchhost|sihost|taskhostw|ctfmon|fontdrvhost|dllhost|backgroundtaskhost|startmenuexperiencehost|textinputhost|shellexperiencehost|applicationframehost|smartscreen|securityhealth.*|msmpeng|nissrv|memory compression|idle|audiodg|spoolsv|wmiprvse|tasklist|powershell|cmd|electron|g27 driver hub)\.?(exe)?$/i;
  $('#mProcs').innerHTML = procs.filter((x) => !skip.test(x)).slice(0, 80)
    .map((x) => `<button data-p="${esc(x)}">${esc(x)}</button>`).join('');
  $$('#mProcs button').forEach((b) => b.addEventListener('click', () => {
    $('#mExe').value = b.dataset.p;
    if (!$('#mName').value) $('#mName').value = b.dataset.p.replace(/\.exe$/i, '');
  }));
}
$('#mPick').addEventListener('click', async () => {
  const r = await hub.pickExe();
  if (!r) return;
  $('#mExe').value = r.exe;
  if (!$('#mName').value) $('#mName').value = r.name;
});
$('#mCancel').addEventListener('click', () => { $('#modal').hidden = true; });
$('#mSave').addEventListener('click', async () => {
  const name = $('#mName').value.trim();
  const exe = $('#mExe').value.trim();
  if (!name) return $('#mName').focus();
  if (!exe && !(editing && editing.id === 'desktop')) return $('#mExe').focus();
  applyState(await hub.saveProfile({ ...(editing ? { id: editing.id } : {}), name, exe: exe || null, color: pickedColor }));
  $('#modal').hidden = true;
  toast(editing ? t('Perfil atualizado') : t('Perfil "{0}" criado — ajuste-o em Volante', name), 'ok');
});

// ---------- prefs ----------
function renderPrefs() {
  $$('input[data-pref]').forEach((c) => { c.checked = !!S.config.prefs[c.dataset.pref]; });
  $$('.field[data-pref-key]').forEach((f) => {
    const input = $('input', f);
    input.value = S.config.prefs[f.dataset.prefKey];
    $('output', f).textContent = `${input.value}%`;
    paintSlider(input);
  });
  $('#langSelect').value = lang;
}
$$('input[data-pref]').forEach((c) => c.addEventListener('change', () => hub.setPrefs({ [c.dataset.pref]: c.checked })));
$('#langSelect').addEventListener('change', (e) => hub.setPrefs({ lang: e.target.value }));
$$('.field[data-pref-key]').forEach((f) => {
  const input = $('input', f);
  let timer = null;
  input.addEventListener('input', () => {
    $('output', f).textContent = `${input.value}%`;
    paintSlider(input);
    clearTimeout(timer);
    timer = setTimeout(() => hub.setPrefs({ [f.dataset.prefKey]: +input.value }), 120);
  });
});

// ---------- telemetry LEDs ----------
async function refreshTelemetry() {
  if (!$('.view[data-view="leds"]').classList.contains('active') || !S) return;
  const st = await hub.telemetryStatus();
  const on = S.config.prefs.ledTelemetry;
  $('#teleStatus').classList.toggle('live', on && st.live);
  $('#teleText').textContent = !on ? t('Telemetria desligada')
    : st.live ? t('Recebendo de {0} — {1} / {2} RPM', st.source, st.rpm.toLocaleString(), st.max.toLocaleString())
    : t('Aguardando telemetria');
  $$('.tele-games .port').forEach((el) => {
    const p = st.ports[el.dataset.src];
    el.className = 'port' + (p ? (p.ok ? ' ok' : ' bad') : '');
    el.textContent = !on || !p ? '' : p.ok ? t('porta {0}', p.port) : t('porta {0} em uso', p.port);
    el.hidden = !el.textContent;
  });
}
setInterval(refreshTelemetry, 250);
// Telemetry LED changes arrive as events so the on-screen blink matches the wheel.
hub.onLeds((mask) => { ledMask = mask; paintLeds(); });

// ---------- updates ----------
let upd = { status: 'idle' };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
function renderUpdate(st) {
  upd = st;
  const pill = $('#updPill');
  const btn = $('#updAction');
  const pills = { latest: ['ok', 'atualizado'], available: ['warn', 'disponível'], downloading: ['warn', 'baixando'], ready: ['ok', 'pronto'], error: ['bad', 'erro'] };
  const [cls, label] = pills[st.status] || ['', '—'];
  pill.className = 'status-pill ' + cls;
  pill.textContent = label === '—' ? '—' : t(label);
  const base = t('Versão instalada: {0}', S ? S.versions.app : '');
  const lines = {
    dev: t('Atualizações só funcionam no app instalado.'),
    idle: base,
    checking: t('Procurando atualizações…'),
    latest: `${base} — ${t('Você está na versão mais recente.')}`,
    available: `${base} — ${t('Versão {0} disponível.', st.version)}`,
    downloading: t('Baixando… {0}% ({1} de {2})', st.percent, mb(st.transferred || 0), mb(st.total || 0)),
    ready: t('Pronto para instalar a versão {0}. O app fecha, instala (o Windows pede permissão) e abre de novo.', st.version),
    error: st.error === 'offline' ? t('Sem conexão com o GitHub. Verifique a internet e tente de novo.') : t('Erro ao atualizar: {0}', st.error),
  };
  $('#updText').textContent = lines[st.status] || base;
  $('#updBar').hidden = st.status !== 'downloading';
  $('#updBar div').style.width = `${st.percent || 0}%`;
  $('#updNotes').hidden = !(st.notes && ['available', 'downloading', 'ready'].includes(st.status));
  $('#updNotes').textContent = st.notes || '';
  const actions = { available: 'Baixar e instalar', ready: 'Reiniciar e instalar', error: 'Tentar de novo' };
  btn.textContent = t(actions[st.status] || 'Verificar atualizações');
  btn.disabled = ['checking', 'downloading', 'dev'].includes(st.status);
  renderAlert();
}
$('#updAction').addEventListener('click', () => {
  if (upd.status === 'available') hub.downloadUpdate();
  else if (upd.status === 'ready') hub.installUpdate();
  else hub.checkUpdate();
});
hub.onUpdate(renderUpdate);

// ---------- system / driver ----------
async function refreshDriver() {
  drv = await hub.driverStatus();
  refreshDriverView();
  if (S) renderDevice(S.device);
}
function refreshDriverView() {
  const pill = $('#drvPill');
  pill.className = 'status-pill ' + (drv.healthy ? 'ok' : drv.present ? 'bad' : '');
  pill.textContent = t(drv.healthy ? 'funcionando' : drv.present ? 'com problema' : 'volante não detectado');
  const rows = [];
  for (const d of drv.devices) {
    rows.push([d.status === 'OK', d.name, d.status === 'OK' ? 'OK' : t('erro{0}', d.problem ? ` ${d.problem}` : '')]);
  }
  rows.push([drv.files.wmfilter, t('WmFilter.sys (filtro do volante)'), t(drv.files.wmfilter ? 'instalado' : 'faltando')]);
  rows.push([drv.files.wmhidlo, t('WmHidLo.sys (filtro HID)'), t(drv.files.wmhidlo ? 'instalado' : 'faltando')]);
  rows.push([drv.files.ffbDll, t('WmJoyFrc.dll (Force Feedback)'), t(drv.files.ffbDll ? 'instalado' : 'faltando')]);
  $('#drvList').innerHTML = rows.map(([ok, label, st]) => `<li class="${ok ? '' : 'no'}">${esc(label)}<small>${esc(st)}</small></li>`).join('');
}
async function repairDriver(fromFile = false) {
  const btn = $('#drvRepair');
  btn.disabled = true;
  $('#drvLocal').disabled = true;
  btn.textContent = t('Instalando… (aceite o aviso do Windows)');
  const r = await hub.repairDriver({ fromFile });
  btn.disabled = false;
  $('#drvLocal').disabled = false;
  btn.textContent = t('Instalar / reparar driver');
  if (r.cancelled && !r.log) return toast(t('Instalação cancelada'), 'error');
  $('#drvLog').hidden = !r.log;
  $('#drvLog').textContent = r.log;
  await refreshDriver();
  if (!r.ok) return toast(t('A instalação falhou — veja o log'), 'error');
  toast(t(drv.healthy ? 'Driver instalado!' : 'Concluído — conecte o volante para verificar'), drv.healthy ? 'ok' : 'info');
}
$('#drvRepair').addEventListener('click', () => repairDriver(false));
$('#drvLocal').addEventListener('click', () => repairDriver(true));
$('#drvRefresh').addEventListener('click', refreshDriver);
$('#btnNative').addEventListener('click', () => hub.switchNative().catch((e) => toast(e.message, 'error')));
$('#btnReapply').addEventListener('click', () => hub.reapply());

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- boot ----------
(async () => {
  applyState(await hub.getState());
  renderUpdate(await hub.updateState());
  paintLeds();
  refreshDriver();
  requestAnimationFrame(tick);
})();
