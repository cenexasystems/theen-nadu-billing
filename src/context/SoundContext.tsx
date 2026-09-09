import React, { createContext, useContext, useState, useEffect } from 'react';

type SoundType = 'success' | 'error' | 'alert' | 'bell';

interface SoundContextType {
  play: (type: SoundType) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

// Shared across the whole app (SoundContext's play() and LowStockAlarmModal's siren both use
// this single instance) so there's only ever one AudioContext, and so unlocking it on the
// first tap benefits every sound cue, not just whichever component happened to create it.
let sharedAudioCtx: AudioContext | null = null;
export function getSharedAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContextCtor();
  }
  return sharedAudioCtx;
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('thenn_nadu_sounds');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('thenn_nadu_sounds', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  const getContext = getSharedAudioContext;

  // Mobile browsers (iOS Safari especially) only allow an AudioContext to start/resume
  // inside a direct user gesture, and most play() calls here happen after an `await`
  // (a Supabase save) by which point that gesture window has closed. Create the context
  // and resume it on the very first tap/click anywhere in the app so it's already running
  // by the time an async play() call needs it.
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getContext();
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        // ignore — Web Audio simply unsupported in this browser
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = (type: SoundType) => {
    if (!soundEnabled) return;

    try {
      const ctx = getContext();
      if (ctx.state === 'suspended') void ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'alert') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.1);
        osc.frequency.setValueAtTime(600, now + 0.2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'bell') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.setValueAtTime(0.3, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch (e) {
      console.warn('Audio API not supported or user not interacted yet.', e);
    }
  };

  return (
    <SoundContext.Provider value={{ play, soundEnabled, setSoundEnabled }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
}
