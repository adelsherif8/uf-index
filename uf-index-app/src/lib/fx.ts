// Haptics + synthesized sound effects (bundled wavs, no network).
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { Audio, AVPlaybackSource } from 'expo-av';

const FILES: Record<string, AVPlaybackSource> = {
  tick: require('../../assets/sfx/tick.wav'),
  print: require('../../assets/sfx/print.wav'),
  coin: require('../../assets/sfx/coin.wav'),
  stamp: require('../../assets/sfx/stamp.wav'),
  ding: require('../../assets/sfx/ding.wav'),
  rip: require('../../assets/sfx/rip.wav'),
};

const pool: Record<string, Audio.Sound | undefined> = {};
let soundOn = true;

export async function initFx(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
    await Promise.all(
      Object.entries(FILES).map(async ([k, src]) => {
        const { sound } = await Audio.Sound.createAsync(src, { volume: 0.5 });
        pool[k] = sound;
        // warm the decoder: one silent play so the first real tick is instant
        try {
          await sound.setVolumeAsync(0);
          await sound.replayAsync();
          await sound.stopAsync();
          await sound.setVolumeAsync(0.5);
        } catch {}
      }),
    );
  } catch {
    // sounds are decoration — never block the app on them
  }
}

export function setSound(on: boolean): void { soundOn = on; }
export function getSound(): boolean { return soundOn; }

export function play(name: keyof typeof FILES): void {
  if (!soundOn) return;
  pool[name]?.replayAsync().catch(() => {});
}

// There is no haptic engine in a browser, and the module can throw
// synchronously there rather than rejecting — which would take a button press
// down with it. Guard once, here, instead of at every call site.
const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  try { fn().catch(() => {}); } catch { /* no haptics on this device */ }
};

export const vib = {
  tick: () => haptic(() => Haptics.selectionAsync()),
  light: () => haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
