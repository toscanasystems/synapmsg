/**
 * Looping ringtone for incoming/outgoing call UI (expo-av).
 * Media stays in WebRTC; this is UI only.
 */

import { Audio } from 'expo-av';

let sound: Audio.Sound | null = null;
let playing = false;

export async function startRingtone(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    const { sound: s } = await Audio.Sound.createAsync(
      require('../../assets/sounds/ringtone.wav'),
      { isLooping: true, volume: 1.0, shouldPlay: true },
    );
    sound = s;
  } catch {
    playing = false;
    sound = null;
  }
}

export async function stopRingtone(): Promise<void> {
  playing = false;
  const s = sound;
  sound = null;
  if (!s) return;
  try {
    await s.stopAsync();
  } catch {
    /* ignore */
  }
  try {
    await s.unloadAsync();
  } catch {
    /* ignore */
  }
}
