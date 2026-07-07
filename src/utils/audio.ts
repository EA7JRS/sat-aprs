/**
 * Web Audio API synthesizer for customizable safety alerts and alarms.
 * Self-contained, lightweight, and iframe-friendly.
 */

export type AlertSoundStyle = 'beep' | 'siren' | 'chime' | 'pulse' | 'warble';

export interface AudioProfile {
  oscillatorType: 'sine' | 'square' | 'sawtooth' | 'triangle';
  frequency: number;
  duration: number;
  modulationEnabled: boolean;
  modulationFreq: number;
  modulationGain: number;
}

export interface GuardSilenceConfig {
  enabled: boolean;
  profile: 'standard' | 'loud' | 'minimal' | 'silent';
  startTime: string; // e.g. "22:00"
  endTime: string;   // e.g. "08:00"
  days: number[];    // 0=Sun, 1=Mon, ..., 6=Sat
}

export const DEFAULT_PROFILES: Record<'seismic' | 'weather' | 'civil', AudioProfile> = {
  seismic: {
    oscillatorType: 'triangle',
    frequency: 110, // rumble-like frequency for seismic
    duration: 1.8,
    modulationEnabled: true,
    modulationFreq: 4,
    modulationGain: 25,
  },
  weather: {
    oscillatorType: 'sine',
    frequency: 680, // mid/high whistling sound for meteorology
    duration: 1.2,
    modulationEnabled: true,
    modulationFreq: 12,
    modulationGain: 80,
  },
  civil: {
    oscillatorType: 'sawtooth', // sharp piercing frequency for sirens
    frequency: 440,
    duration: 2.2,
    modulationEnabled: true,
    modulationFreq: 2,
    modulationGain: 150,
  },
};

export function getGuardSilenceConfig(): GuardSilenceConfig {
  if (typeof window === 'undefined') {
    return { enabled: false, profile: 'standard', startTime: '22:00', endTime: '08:00', days: [1, 2, 3, 4, 5] };
  }
  try {
    const saved = localStorage.getItem('guard_silence_config');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading guard silence config', e);
  }
  return { enabled: false, profile: 'standard', startTime: '22:00', endTime: '08:00', days: [1, 2, 3, 4, 5] };
}

export function saveGuardSilenceConfig(config: GuardSilenceConfig) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('guard_silence_config', JSON.stringify(config));
    window.dispatchEvent(new Event('guard_silence_config_changed'));
  } catch (e) {
    console.error('Error saving guard silence config', e);
  }
}

export function isGuardSilentModeActive(): boolean {
  const config = getGuardSilenceConfig();
  if (!config.enabled) return false;
  
  const now = new Date();
  const currentDay = now.getDay();
  
  if (!config.days.includes(currentDay)) {
    return false;
  }

  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  const [startH, startM] = config.startTime.split(':').map(Number);
  const [endH, endM] = config.endTime.split(':').map(Number);

  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;

  if (startTotalMinutes <= endTotalMinutes) {
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes <= endTotalMinutes;
  } else {
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes <= endTotalMinutes;
  }
}

export function getAudioProfile(category: 'seismic' | 'weather' | 'civil'): AudioProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILES[category];
  try {
    const saved = localStorage.getItem(`audio_profile_${category}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading audio profile', e);
  }
  return DEFAULT_PROFILES[category];
}

export function saveAudioProfile(category: 'seismic' | 'weather' | 'civil', profile: AudioProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`audio_profile_${category}`, JSON.stringify(profile));
  } catch (e) {
    console.error('Error saving audio profile', e);
  }
}

export function playEmergencyAlertSound(category: 'seismic' | 'weather' | 'civil', force: boolean = false) {
  if (typeof window === 'undefined') return;

  const guardConfig = getGuardSilenceConfig();
  
  // Respect guard silence config if not forced
  if (!force && isGuardSilentModeActive()) {
    if (guardConfig.profile === 'silent') {
      console.log('playEmergencyAlertSound muted: Guard silent mode is active.');
      return;
    }
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const profile = getAudioProfile(category);
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = profile.oscillatorType;
    osc.frequency.setValueAtTime(profile.frequency, ctx.currentTime);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    // Scale volume (gain) and duration based on the active guard profile
    let gainMultiplier = 1.0;
    let durationMultiplier = 1.0;

    if (guardConfig.enabled && isGuardSilentModeActive()) {
      if (guardConfig.profile === 'minimal') {
        gainMultiplier = 0.3;
        durationMultiplier = 0.4;
      } else if (guardConfig.profile === 'loud') {
        gainMultiplier = 2.0;
        durationMultiplier = 1.5;
      }
    }

    const finalGain = Math.max(0.01, 0.15 * gainMultiplier);
    const finalDuration = Math.max(0.1, profile.duration * durationMultiplier);

    gainNode.gain.setValueAtTime(finalGain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + finalDuration);

    if (profile.modulationEnabled && profile.modulationFreq > 0) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      
      lfo.frequency.setValueAtTime(profile.modulationFreq, now);
      lfoGain.gain.setValueAtTime(profile.modulationGain, now);
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      lfo.start(now);
      lfo.stop(now + finalDuration);
    }

    osc.start(now);
    osc.stop(now + finalDuration);
  } catch (err) {
    console.warn('Playback of emergency profile failed', err);
  }
}

export function playAlertSound(style: AlertSoundStyle, force: boolean = false) {
  if (typeof window === 'undefined') return;

  const guardConfig = getGuardSilenceConfig();

  // Respect guard silence config if not forced
  if (!force && isGuardSilentModeActive()) {
    if (guardConfig.profile === 'silent') {
      console.log('playAlertSound muted: Guard silent mode is active.');
      return;
    }
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    
    // Check if context is suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      // Attempt to resume, though it might fail without user interaction.
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    // Scale volume (gain) and duration based on the active guard profile
    let gainMultiplier = 1.0;
    let durationMultiplier = 1.0;

    if (guardConfig.enabled && isGuardSilentModeActive()) {
      if (guardConfig.profile === 'minimal') {
        gainMultiplier = 0.3;
        durationMultiplier = 0.4;
      } else if (guardConfig.profile === 'loud') {
        gainMultiplier = 2.0;
        durationMultiplier = 1.5;
      }
    }

    switch (style) {
      case 'beep': {
        // High-pitched clear electronic warning beep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); // A5
        gainNode.gain.setValueAtTime(0.12 * gainMultiplier, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (0.25 * durationMultiplier));
        osc.start(now);
        osc.stop(now + (0.25 * durationMultiplier));
        break;
      }
      case 'siren': {
        // Sweep pitch upward then downward (emergency siren effect)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.linearRampToValueAtTime(760, now + (0.3 * durationMultiplier));
        osc.frequency.linearRampToValueAtTime(380, now + (0.6 * durationMultiplier));
        osc.frequency.linearRampToValueAtTime(760, now + (0.9 * durationMultiplier));
        osc.frequency.linearRampToValueAtTime(380, now + (1.2 * durationMultiplier));

        gainNode.gain.setValueAtTime(0.08 * gainMultiplier, now);
        gainNode.gain.setValueAtTime(0.08 * gainMultiplier, now + (1.0 * durationMultiplier));
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (1.25 * durationMultiplier));

        osc.start(now);
        osc.stop(now + (1.25 * durationMultiplier));
        break;
      }
      case 'chime': {
        // Elegant ambient bell chime with overtone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5 fundamental
        gainNode.gain.setValueAtTime(0.12 * gainMultiplier, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (1.5 * durationMultiplier));
        osc.start(now);
        osc.stop(now + (1.5 * durationMultiplier));

        // Overtone generator (harmonic fifth G5)
        const osc2 = ctx.createOscillator();
        const gainNode2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(783.99, now); // G5
        osc2.connect(gainNode2);
        gainNode2.connect(ctx.destination);
        gainNode2.gain.setValueAtTime(0.06 * gainMultiplier, now);
        gainNode2.gain.exponentialRampToValueAtTime(0.001, now + (1.1 * durationMultiplier));
        osc2.start(now);
        osc2.stop(now + (1.1 * durationMultiplier));
        break;
      }
      case 'pulse': {
        // Pulsing radar danger warning
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(293.66, now); // D4
        osc.frequency.setValueAtTime(293.66, now + 0.1);
        
        gainNode.gain.setValueAtTime(0.15 * gainMultiplier, now);
        gainNode.gain.linearRampToValueAtTime(0.15 * gainMultiplier, now + (0.15 * durationMultiplier));
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (0.4 * durationMultiplier));
        
        osc.start(now);
        osc.stop(now + (0.4 * durationMultiplier));

        // Second pulse shortly after
        const osc2 = ctx.createOscillator();
        const gainNode2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(293.66, now + (0.2 * durationMultiplier));
        osc2.connect(gainNode2);
        gainNode2.connect(ctx.destination);
        gainNode2.gain.setValueAtTime(0, now);
        gainNode2.gain.setValueAtTime(0.15 * gainMultiplier, now + (0.2 * durationMultiplier));
        gainNode2.gain.exponentialRampToValueAtTime(0.001, now + (0.5 * durationMultiplier));
        osc2.start(now + (0.2 * durationMultiplier));
        osc2.stop(now + (0.5 * durationMultiplier));
        break;
      }
      case 'warble': {
        // Rapid frequency oscillation (warbling whistle)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        
        // Use an LFO to modulate the main oscillator frequency
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        
        lfo.frequency.setValueAtTime(15, now); // 15Hz frequency modulation
        lfoGain.gain.setValueAtTime(150, now); // Warble range: +/- 150Hz
        
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        
        gainNode.gain.setValueAtTime(0.1 * gainMultiplier, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (0.65 * durationMultiplier));
        
        lfo.start(now);
        osc.start(now);
        
        lfo.stop(now + (0.65 * durationMultiplier));
        osc.stop(now + (0.65 * durationMultiplier));
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.warn('Fallback: Audio playback failed/blocked by sandbox permissions:', err);
  }
}
