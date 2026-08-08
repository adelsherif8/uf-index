// Haptics + synthesized sound effects (bundled wavs, no network).
import * as Haptics from 'expo-haptics';
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

export const vib = {
  tick: () => Haptics.selectionAsync().catch(() => {}),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};
