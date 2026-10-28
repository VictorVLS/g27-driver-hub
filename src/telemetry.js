// RPM lights from game telemetry, for games that do not drive the G27 LEDs
// themselves. Each source is a UDP listener for a documented telemetry format;
// the LED pattern copies Logitech's own driver (WmJoyFrc.dll): five steps
// between the first-LED RPM and the red line, then all LEDs blinking every
// 150 ms at or above the red line.
const dgram = require('dgram');
const { EventEmitter } = require('events');

const SOURCES = {
  // Forza Horizon 4/5, Forza Motorsport 7 and 2023 "Data Out" (Sled/Dash).
  forza: { port: 5300, name: 'Forza', parse: parseForza },
  // OutGauge: BeamNG.drive, Live for Speed.
  outgauge: { port: 4444, name: 'OutGauge', parse: parseOutGauge },
  // Codemasters "extradata = 3": DiRT Rally, DiRT Rally 2.0, DiRT 4, GRID.
  codemasters: { port: 20777, name: 'Codemasters', parse: parseCodemasters },
};

function parseForza(b) {
  if (b.length < 232) return null;
  const isRaceOn = b.readInt32LE(0);
  const max = b.readFloatLE(8);
  const rpm = b.readFloatLE(16);
  if (!isRaceOn || !(max > 0)) return { idle: true };
  return { rpm, max };
}

const outgaugeMax = new Map(); // car -> highest RPM seen (OutGauge has no max)
function parseOutGauge(b) {
  if (b.length < 92) return null;
  const car = b.toString('latin1', 4, 8);
  const rpm = b.readFloatLE(16);
  const shiftLight = (b.readUInt32LE(44) & 1) !== 0; // DL_SHIFT
  const max = Math.max(outgaugeMax.get(car) || 0, rpm, 3000);
  outgaugeMax.set(car, max);
  return { rpm, max, shiftLight };
}

function parseCodemasters(b) {
  if (b.length < 256) return null;
  const rpm = b.readFloatLE(37 * 4);
  const max = b.readFloatLE(63 * 4);
  if (!(max > 0)) return { idle: true };
  return { rpm, max };
}

// Logitech's mapping: masks 1, 3, 7, F, 1F, 1F across [first, red).
const STEPS = [0x01, 0x03, 0x07, 0x0f, 0x1f, 0x1f];
const LIMIT_HOLD_MS = 300; // how long the red-line blink outlives the last red-line packet
function ledMask(rpm, first, red, blinkOn) {
  if (rpm < first) return 0;
  if (rpm < red) return STEPS[Math.min(5, Math.floor(((rpm - first) / (red - first)) * 6))];
  return blinkOn ? 0x1f : 0;
}

class Telemetry extends EventEmitter {
  constructor() {
    super();
    this.sockets = new Map();
    this.ports = {};
    this.last = null; // { source, rpm, max, at }
    this.opts = { start: 75, red: 95 };
    this.mask = -1;
    this.blinkFrom = 0;
    this.limitUntil = 0;
    this.timer = null;
  }

  start(opts) {
    this.opts = { ...this.opts, ...opts };
    for (const [id, src] of Object.entries(SOURCES)) {
      if (this.sockets.has(id)) continue;
      // No reuseAddr: if another tool (e.g. SimHub) owns the port, report it.
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: false });
      sock.on('message', (msg) => this.onPacket(id, src, msg));
      sock.on('error', (e) => {
        this.ports[id] = { port: src.port, ok: false, error: e.code || e.message };
        try { sock.close(); } catch { /* already closed */ }
        this.sockets.delete(id);
      });
      sock.bind(src.port, '0.0.0.0', () => { this.ports[id] = { port: src.port, ok: true }; });
      this.sockets.set(id, sock);
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 20);
  }

  stop() {
    for (const s of this.sockets.values()) { try { s.close(); } catch { /* ignore */ } }
    this.sockets.clear();
    this.ports = {};
    clearInterval(this.timer);
    this.timer = null;
    this.last = null;
    this.setMask(0);
  }

  configure(opts) { this.opts = { ...this.opts, ...opts }; }

  onPacket(id, src, msg) {
    const r = src.parse(msg);
    if (!r) return;
    this.last = { source: src.name, at: Date.now(), ...(r.idle ? { rpm: 0, max: 0 } : r) };
  }

  tick() {
    const now = Date.now();
    const live = this.last && now - this.last.at < 1500 && this.last.max > 0;
    if (!live) {
      if (this.mask !== 0 && this.mask !== -1) this.setMask(0);
      return;
    }
    const { rpm, max, shiftLight } = this.last;
    const first = max * (this.opts.start / 100);
    const red = max * (this.opts.red / 100);
    // On the rev limiter the RPM bounces across the red line many times a
    // second; latch the blink for a moment so it keeps a steady rhythm instead
    // of flickering between "all on" and "blinking".
    if (shiftLight || rpm >= red) {
      if (now >= this.limitUntil) this.blinkFrom = now; // start each blink run lit
      this.limitUntil = now + LIMIT_HOLD_MS;
    }
    const limiting = now < this.limitUntil;
    // Phase from the clock, not a toggle per tick, so timer jitter cannot drift it.
    const blinkOn = Math.floor((now - this.blinkFrom) / 150) % 2 === 0;
    const mask = limiting ? (blinkOn ? 0x1f : 0) : ledMask(rpm, first, red, true);
    if (mask !== this.mask) this.setMask(mask);
  }

  setMask(mask) {
    this.mask = mask;
    this.emit('leds', mask);
  }

  status() {
    const l = this.last;
    const live = !!(l && Date.now() - l.at < 1500);
    return {
      ports: this.ports,
      live,
      source: live ? l.source : null,
      rpm: live ? Math.round(l.rpm) : 0,
      max: live ? Math.round(l.max) : 0,
      mask: Math.max(0, this.mask),
    };
  }
}

module.exports = { Telemetry, SOURCES, ledMask };
