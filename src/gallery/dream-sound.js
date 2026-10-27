// A soundtrack for the journey behind Lille stjerne (journey.js), made in the
// browser: no audio files. A soft pad glides from chord to chord with the
// chapters of dream.js, a little bell sparkles around the star, and filtered
// noise whooshes on the way in and out. Quiet by design; it fades in and out.
//
// Must be started from inside a tap (browsers only allow sound after one).

// One chord per chapter: [start in seconds, frequencies (Hz), filter cutoff]
const CHORDS = [
  [0, [146.83, 220, 329.63, 369.99], 700], // D add9: the star
  [6.6, [196, 293.66, 440, 493.88], 2400], // G add9: the journey, bright
  [19.6, [130.81, 196, 329.63, 493.88], 1500], // C maj7: the sun, warm
  [31, [110, 164.81, 261.63, 392], 520], // A m7: the blue hour, dark
  [40, [146.83, 220, 369.99, 554.37], 1800], // D maj7: the wheel, the star again
];
const VOLUME = 0.16;

export function createDreamSound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx;
  try {
    ctx = new AC();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // A slow echo, for space
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.42;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 0.7;
  filter.connect(master);
  filter.connect(delay);

  // The pad: two detuned voices per chord note, and a sine an octave below the root
  const voices = CHORDS[0][1].map((f, i) => {
    const g = ctx.createGain();
    g.gain.value = 0.11;
    g.connect(filter);
    const oscs = [-6, 6].map((cents) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(g);
      o.start();
      return o;
    });
    return oscs;
  });
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = CHORDS[0][1][0] / 2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.22;
  sub.connect(subGain).connect(master);
  sub.start();

  let noise = null;
  function noiseBuffer() {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  // A rushing sweep of filtered noise
  function whoosh(seconds = 2.2, up = true) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    const now = ctx.currentTime;
    bp.frequency.setValueAtTime(up ? 200 : 3200, now);
    bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 200, now + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + seconds * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    src.connect(bp).connect(g).connect(master);
    g.connect(delay);
    src.start(now);
    src.stop(now + seconds + 0.1);
  }

  // A small bell: a sine with a fast attack and a long tail
  function bell(freq, when = 0) {
    const now = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    o.connect(g).connect(master);
    g.connect(delay);
    o.start(now);
    o.stop(now + 1.7);
  }

  let chord = 0;
  let nextBell = 0;
  let stopped = false;

  return {
    // Fade in (the door opens)
    start() {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(VOLUME, now + 2.5);
      whoosh(3.6, true);
    },
    // Follow the journey's clock (seconds into dream.js)
    at(t) {
      if (stopped) return;
      let k = 0;
      while (k + 1 < CHORDS.length && t >= CHORDS[k + 1][0]) k++;
      if (k !== chord) {
        chord = k;
        const [, notes, cutoff] = CHORDS[k];
        const now = ctx.currentTime;
        voices.forEach((oscs, i) => oscs.forEach((o) => o.frequency.setTargetAtTime(notes[i], now, 0.5)));
        sub.frequency.setTargetAtTime(notes[0] / 2, now, 0.5);
        filter.frequency.setTargetAtTime(cutoff, now, 0.8);
      }
      // The star sparkles: bells from the chord, high up
      const starry = t < 6.4 || t > 44;
      if (starry && t >= nextBell) {
        const notes = CHORDS[chord][1];
        bell(notes[Math.floor(Math.random() * notes.length)] * 4);
        nextBell = t + 0.28 + Math.random() * 0.35;
      }
    },
    // The way out
    leave() {
      whoosh(2.4, false);
    },
    // Fade out and let go of the audio device
    stop(fade = 1.6) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => ctx.close().catch(() => {}), (fade + 0.3) * 1000);
    },
    pause() {
      if (!stopped) ctx.suspend().catch(() => {});
    },
    resume() {
      if (!stopped) ctx.resume().catch(() => {});
    },
  };
}
