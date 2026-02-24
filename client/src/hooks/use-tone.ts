import { useCallback, useEffect, useRef } from "react";

type ToneShape = {
  type: OscillatorType;
  fromHz: number;
  toHz?: number;
  durationMs: number;
  peakGain: number;
};

export function useTone() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playTone = useCallback((tone: ToneShape): void => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const durationSec = tone.durationMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.fromHz, ctx.currentTime);
      if (tone.toHz && tone.toHz !== tone.fromHz) {
        osc.frequency.linearRampToValueAtTime(
          tone.toHz,
          ctx.currentTime + durationSec,
        );
      }
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        tone.peakGain,
        ctx.currentTime + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + durationSec,
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + durationSec);
    } catch {
      // Ignore tone errors due to autoplay restrictions.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  return { playTone };
}
