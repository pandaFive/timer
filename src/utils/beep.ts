/**
 * AudioContextを使用してビープ音を生成する。
 * シングルトンAudioContextを再利用し、ブラウザの上限到達を防止する。
 * AudioContext非対応のブラウザでは何もしない。
 */
let sharedCtx: AudioContext | null = null;

export function playBeep(frequency = 800, duration = 0.15): void {
  if (typeof AudioContext === 'undefined') return;

  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new AudioContext();
    }

    // 停止中のコンテキストを再開
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume();
    }

    const ctx = sharedCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('ビープ音の再生に失敗しました:', e);
  }
}
