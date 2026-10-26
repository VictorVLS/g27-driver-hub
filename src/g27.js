// G27 HID protocol. Command bytes follow the Logitech "classic" FFB protocol
// as documented by the Linux hid-lg4ff driver (the reference open implementation
// for G25/G27/DFGT). Every output report is 7 bytes, no report ID.
const HID = require('node-hid');
const { EventEmitter } = require('events');

const VENDOR = 0x046d;
const MODELS = {
  0xc29b: { name: 'G27 Racing Wheel', native: true },
  0xc294: { name: 'G27 (modo compatibilidade)', native: false },
  0xc299: { name: 'G25 Racing Wheel', native: true },
  0xc29a: { name: 'Driving Force GT', native: true },
  0xc298: { name: 'Driving Force Pro', native: true },
};

const MIN_RANGE = 40;
const MAX_RANGE = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class G27 extends EventEmitter {
  constructor() {
    super();
    this.dev = null;
    this.info = null;
    this.queue = Promise.resolve();
  }

  static find() {
    const list = HID.devices().filter((d) => d.vendorId === VENDOR && MODELS[d.productId]);
    // Prefer the joystick top-level collection when the device exposes several.
    return list.find((d) => d.usagePage === 1 && d.usage === 4) || list[0] || null;
  }

  get connected() {
    return !!this.dev;
  }

  status() {
    if (!this.info) return { connected: false };
    const m = MODELS[this.info.productId];
    return {
      connected: true,
      model: m.name,
      native: m.native,
      productId: this.info.productId.toString(16).padStart(4, '0'),
      path: this.info.path,
    };
  }

  // Opens the wheel if present; returns true when the connection state changed.
  poll() {
    const found = G27.find();
    if (this.dev && (!found || found.path !== this.info.path)) {
      this.close();
      this.emit('change', this.status());
      return true;
    }
    if (!this.dev && found) {
      try {
        this.dev = new HID.HID(found.path);
        this.info = found;
        this.dev.on('error', () => {
          this.close();
          this.emit('change', this.status());
        });
        this.emit('change', this.status());
        return true;
      } catch (e) {
        this.dev = null;
        this.info = null;
        this.emit('error', `Falha ao abrir o volante: ${e.message}`);
      }
    }
    return false;
  }

  close() {
    try { this.dev && this.dev.close(); } catch { /* already gone */ }
    this.dev = null;
    this.info = null;
  }

  // Serialises writes; the wheel drops commands sent back-to-back too quickly.
  send(bytes) {
    this.queue = this.queue.then(async () => {
      if (!this.dev) throw new Error('Volante não conectado');
      const report = [0x00, ...bytes.slice(0, 7)];
      while (report.length < 8) report.push(0x00);
      this.dev.write(report);
      await sleep(8);
    });
    return this.queue;
  }

  // Leaves Driving Force EX compatibility mode (PID C294) and re-enumerates
  // as a native G27 (PID C29B) with 900° and separate pedals.
  async switchToNative() {
    await this.send([0xf8, 0x0a, 0, 0, 0, 0, 0]);
    await this.send([0xf8, 0x09, 0x04, 0x01, 0, 0, 0]);
  }

  async setRange(degrees) {
    const r = Math.max(MIN_RANGE, Math.min(MAX_RANGE, Math.round(degrees)));
    await this.send([0xf8, 0x81, r & 0xff, (r >> 8) & 0xff, 0, 0, 0]);
    return r;
  }

  // percent 0..100; 0 disables the firmware centering spring.
  async setAutocenter(percent) {
    const magnitude = Math.round((Math.max(0, Math.min(100, percent)) / 100) * 0xffff);
    if (magnitude === 0) {
      await this.send([0xf5, 0, 0, 0, 0, 0, 0]);
      return;
    }
    let a, b;
    if (magnitude <= 0xaaaa) {
      a = 0x0c * magnitude;
      b = 0x80 * magnitude;
    } else {
      a = 0x0c * 0xaaaa + 0x06 * (magnitude - 0xaaaa);
      b = 0x80 * 0xaaaa + 0xff * (magnitude - 0xaaaa);
    }
    a >>= 1; // non-MOMO wheels use half the spring coefficient
    const k = Math.floor(a / 0xaaaa);
    await this.send([0xfe, 0x0d, k, k, Math.min(0xff, Math.floor(b / 0xaaaa)), 0, 0]);
    await this.send([0x14, 0, 0, 0, 0, 0, 0]);
  }

  // mask: 5 bits, bit0 = outer green LEDs ... bit4 = centre red LED.
  async setLeds(mask) {
    await this.send([0xf8, 0x12, mask & 0x1f, 0, 0, 0, 0x01]);
  }

  // level -1..1 constant force in slot 1, for testing the motors.
  async constantForce(level) {
    const x = Math.max(0, Math.min(255, Math.round(0x80 + level * 127)));
    if (x === 0x80) return this.stopForce();
    await this.send([0x11, 0x08, x, 0x80, 0, 0, 0]);
  }

  async stopForce() {
    await this.send([0x13, 0x00, 0, 0, 0, 0, 0]);
  }
}

module.exports = { G27, MIN_RANGE, MAX_RANGE, VENDOR };
