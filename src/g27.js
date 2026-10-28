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

  // Async enumeration: the sync HID.devices() blocks the main process for
  // ~400 ms on Windows, which stalled the telemetry LED blink once a second.
  static async find() {
    const list = (await HID.devicesAsync()).filter((d) => d.vendorId === VENDOR && MODELS[d.productId]);
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
  async poll() {
    if (this.polling) return false;
    this.polling = true;
    let found;
    try { found = await G27.find(); } catch { return false; } finally { this.polling = false; }
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
  // Measured on a G27: with a low slope (the hid-lg4ff mapping gives k=2 at
  // 30%) the wheel stops ~25° short of centre because gear friction beats the
  // weak spring. Slope saturates at 15, and a clip below ~55 cannot bring the
  // wheel back at all, so keep k at maximum and let strength drive the clip.
  async setAutocenter(percent) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    if (p === 0) {
      await this.send([0xf5, 0, 0, 0, 0, 0, 0]);
      return;
    }
    const clip = Math.round(60 + ((p - 1) / 99) * (0xff - 60));
    await this.send([0xfe, 0x0d, 0x0f, 0x0f, clip, 0, 0]);
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
