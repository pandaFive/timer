/**
 * AudioContextを使用してビープ音を生成する。
 * AudioContext非対応のブラウザでは何もしない。
 */
export function playBeep(frequency = 800, duration = 0.15): void {
  if (typeof AudioContext === 'undefined') return;

  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.01,
    ctx.currentTime + duration,
  );

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}
