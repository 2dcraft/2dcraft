import { Howl } from 'howler';

let ready = false;
const sounds: Record<string, Howl> = {};

export function initAudio() {
  if (ready) return;
  ready = true;
  sounds.step = new Howl({ src: ['/sfx/step.ogg'], volume: 0.4 });
  sounds.break = new Howl({ src: ['/sfx/break.ogg'], volume: 0.6 });
  sounds.click = new Howl({ src: ['/sfx/click.wav'], volume: 0.5 });
  sounds.pickup = new Howl({ src: ['/sfx/pickup.ogg'], volume: 0.5 });
  sounds.hover = new Howl({ src: ['/sfx/hover.wav'], volume: 0.25 });
}

export function sfx(name: keyof typeof sounds | string, rate = 1) {
  if (!ready) return;
  const s = sounds[name];
  if (s) { s.rate(rate); s.play(); }
}
