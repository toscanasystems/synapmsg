/**
 * Whisper.cpp on-device path — neural ASR for voice notes → text → local MT.
 * Model is downloaded lazily to documentDirectory (not bundled in APK).
 */

import * as FileSystem from 'expo-file-system';
import { translateOnDevice, OnDeviceLang } from './onDeviceTranslate';

const MODEL_DIR = `${FileSystem.documentDirectory ?? ''}whisper/`;
const MODEL_FILE = `${MODEL_DIR}ggml-tiny.bin`;
/** Host a tiny ggml on R2 when ready; override via env. */
const MODEL_URL =
  String(process.env.EXPO_PUBLIC_WHISPER_MODEL_URL ?? '').replace(/['"]/g, '') ||
  'https://media.synapmsg.ai/models/ggml-tiny.bin';

export type WhisperStatus = {
  available: boolean;
  modelReady: boolean;
  engine: 'whisper.cpp' | 'unavailable';
  note: string;
};

let nativeTranscribe:
  | ((audioUri: string) => Promise<string | null>)
  | null = null;

/** Native module can register a real whisper.cpp binder later. */
export function registerWhisperNative(
  fn: (audioUri: string) => Promise<string | null>,
): void {
  nativeTranscribe = fn;
}

export async function getWhisperStatus(): Promise<WhisperStatus> {
  const info = await FileSystem.getInfoAsync(MODEL_FILE);
  return {
    available: Boolean(nativeTranscribe),
    modelReady: info.exists === true,
    engine: nativeTranscribe ? 'whisper.cpp' : 'unavailable',
    note: nativeTranscribe
      ? 'Native whisper.cpp binder registered'
      : 'Binder pending — download model + use dictionary MT fallback',
  };
}

export async function ensureWhisperModel(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(MODEL_FILE);
  if (info.exists) return true;
  try {
    const dir = await FileSystem.getInfoAsync(MODEL_DIR);
    if (!dir.exists) {
      await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    }
    const result = await FileSystem.downloadAsync(MODEL_URL, MODEL_FILE);
    return result.status === 200;
  } catch {
    return false;
  }
}

/**
 * Transcribe audio on-device then optionally translate with local dictionary.
 * Never uploads audio/plaintext to cloud.
 */
export async function whisperTranscribeAndTranslate(
  audioUri: string,
  targetLang: OnDeviceLang,
): Promise<{ text: string; translated: string; via: string } | null> {
  await ensureWhisperModel();
  if (!nativeTranscribe) {
    return null;
  }
  const text = await nativeTranscribe(audioUri);
  if (!text) return null;
  const translated = translateOnDevice(text, targetLang);
  return { text, translated, via: 'whisper.cpp+on-device-mt' };
}

export const WHISPER_STATUS = {
  protocol: 'whisper.cpp-tiny',
  cloudUpload: false,
  bundledModel: false,
  lazyDownload: true,
} as const;
