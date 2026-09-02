let context: AudioContext | undefined;
let hiss: AudioBuffer | undefined;
let level = 0.35;

export function setVolume(value: number): void {
  level = Math.max(0, Math.min(1, value));
}

function audio(): AudioContext | undefined {
  if (level <= 0) return undefined;
  if (!context) {
    context = new AudioContext();
    const frames = Math.floor(context.sampleRate * 0.25);
    hiss = context.createBuffer(1, frames, context.sampleRate);
    const channel = hiss.getChannelData(0);
    for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function noise(gain: number, from: number, q: number, decay: number, to?: number): void {
  const ac = audio();
  if (!ac || !hiss) return;
  const at = ac.currentTime;
  const source = ac.createBufferSource();
  source.buffer = hiss;
  source.loop = true;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(from, at);
  if (to) band.frequency.exponentialRampToValueAtTime(to, at + decay);
  band.Q.value = q;
  const volume = ac.createGain();
  volume.gain.setValueAtTime(gain * level, at);
  volume.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(band).connect(volume).connect(ac.destination);
  source.start(at);
  source.stop(at + decay + 0.02);
}

export function shot(): void {
  noise(0.5, 1500, 0.7, 0.09, 600);
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime;
  const tone = ac.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(190, at);
  tone.frequency.exponentialRampToValueAtTime(58, at + 0.09);
  const volume = ac.createGain();
  volume.gain.setValueAtTime(0.5 * level, at);
  volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  tone.connect(volume).connect(ac.destination);
  tone.start(at);
  tone.stop(at + 0.13);
}

export function hit(height: number): void {
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime;
  const root = 700 * Math.pow(2, -(height - 0.8) * 1.1);
  for (const [ratio, gain, decay] of [
    [1, 0.34, 0.3],
    [2.02, 0.16, 0.19],
    [3.01, 0.07, 0.12],
  ] as const) {
    const partial = ac.createOscillator();
    partial.type = 'triangle';
    partial.frequency.value = root * ratio;
    const volume = ac.createGain();
    volume.gain.setValueAtTime(gain * level, at);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    partial.connect(volume).connect(ac.destination);
    partial.start(at);
    partial.stop(at + decay + 0.02);
  }
}

export function reel(): void {
  noise(0.28, 320, 1.4, 0.45, 1500);
}

export function release(): void {
  noise(0.3, 1800, 1.1, 0.25, 300);
}
