// Chiptune sound effects synthesised with the Web Audio API: square/triangle oscillators
// and filtered noise. No audio files are needed.

export type SfxName =
  | 'cursor'
  | 'select'
  | 'confirm'
  | 'cancel'
  | 'error'
  | 'step'
  | 'attack'
  | 'hit'
  | 'death'
  | 'endTurn'
  | 'turnStart'
  | 'victory'
  | 'defeat'
  | 'capture'
  | 'build';

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private vol = 0.5;
  private lastPlayed: Partial<Record<SfxName, number>> = {};

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      // deterministic LFSR-style noise so the "8-bit" hiss sounds the same every time
      let r = 0x1234;
      for (let i = 0; i < len; i++) {
        r ^= r << 7;
        r ^= r >> 9;
        r ^= r << 8;
        r &= 0xffff;
        data[i] = (r / 0xffff) * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 0..1 */
  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.vol;
  }

  get volume(): number {
    return this.vol;
  }

  private tone(freq: number, dur: number, wave: Wave = 'square', vol = 0.25, at = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.2, at = 0, cutoff = 2000, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  private seq(notes: number[], step: number, wave: Wave = 'square', vol = 0.2, hold = step * 0.9): void {
    notes.forEach((f, i) => this.tone(f, hold, wave, vol, i * step));
  }

  play(name: SfxName): void {
    if (!this.ctx || this.vol <= 0) return;
    // avoid machine-gun repeats of the same sound in a single frame
    const now = performance.now();
    if (now - (this.lastPlayed[name] ?? 0) < 25) return;
    this.lastPlayed[name] = now;
    switch (name) {
      case 'cursor':
        this.tone(880, 0.025, 'square', 0.08);
        break;
      case 'select':
        this.tone(660, 0.05, 'square', 0.18, 0, 990);
        break;
      case 'confirm':
        this.seq([523, 784], 0.05);
        break;
      case 'cancel':
        this.tone(392, 0.09, 'square', 0.18, 0, 196);
        break;
      case 'error':
        this.seq([147, 110], 0.07, 'square', 0.2);
        break;
      case 'step':
        this.tone(160, 0.03, 'triangle', 0.25);
        break;
      case 'attack':
        this.noise(0.12, 0.25, 0, 3000, 'highpass');
        this.tone(330, 0.12, 'square', 0.15, 0, 110);
        break;
      case 'hit':
        this.noise(0.1, 0.35, 0, 900);
        this.tone(98, 0.08, 'square', 0.18);
        break;
      case 'death':
        this.tone(440, 0.45, 'square', 0.18, 0, 40);
        this.noise(0.4, 0.2, 0.05, 600);
        break;
      case 'endTurn':
        this.seq([392, 523, 659], 0.07, 'triangle', 0.3);
        break;
      case 'turnStart':
        this.seq([523, 659, 784, 1047], 0.06, 'square', 0.14);
        break;
      case 'victory':
        this.seq([523, 659, 784, 1047], 0.12, 'square', 0.18);
        this.seq([784, 1047], 0.2, 'square', 0.18, 0.4);
        this.seq([262, 330, 392, 523], 0.12, 'triangle', 0.25);
        break;
      case 'defeat':
        this.seq([392, 349, 311, 262], 0.2, 'triangle', 0.3);
        this.seq([196, 175, 156, 131], 0.2, 'square', 0.1);
        break;
      case 'capture':
        this.seq([659, 784, 988, 1319], 0.07, 'square', 0.16);
        break;
      case 'build':
        this.seq([330, 494, 659], 0.06, 'triangle', 0.3);
        break;
    }
  }
}

export const sfx = new Sfx();
