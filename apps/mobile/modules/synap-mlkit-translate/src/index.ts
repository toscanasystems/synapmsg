export type MlkitEngineInfo = {
  name: string;
  platform: string;
  native: boolean;
};

export type MlkitTranslateResult = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  via: string;
  unchanged?: boolean;
};

type NativeMlkit = {
  engine(): MlkitEngineInfo;
  supportedLanguageCodes(): string[];
  isModelDownloaded(languageCode: string): Promise<boolean>;
  downloadModel(languageCode: string): Promise<boolean>;
  deleteModel(languageCode: string): Promise<boolean>;
  identifyLanguage(text: string): Promise<string | null>;
  translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<MlkitTranslateResult>;
};

function getNative(): NativeMlkit | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: <T>(name: string) => T;
    };
    return requireNativeModule<NativeMlkit>('SynapMlkitTranslate');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeModulesProxy } = require('expo-modules-core') as {
        NativeModulesProxy: Record<string, NativeMlkit | undefined>;
      };
      return NativeModulesProxy.SynapMlkitTranslate ?? null;
    } catch {
      return null;
    }
  }
}

export function mlkitAvailable(): boolean {
  return getNative() != null;
}

export function mlkitEngine(): MlkitEngineInfo {
  const n = getNative();
  if (!n?.engine) {
    return { name: 'missing', platform: 'none', native: false };
  }
  try {
    return { ...n.engine(), native: true };
  } catch {
    return { name: 'missing', platform: 'none', native: false };
  }
}

export function mlkitSupportedLanguageCodes(): string[] {
  const n = getNative();
  if (!n?.supportedLanguageCodes) return [];
  try {
    return n.supportedLanguageCodes() || [];
  } catch {
    return [];
  }
}

export async function mlkitIsModelDownloaded(code: string): Promise<boolean> {
  const n = getNative();
  if (!n?.isModelDownloaded) return false;
  return n.isModelDownloaded(code);
}

export async function mlkitDownloadModel(code: string): Promise<boolean> {
  const n = getNative();
  if (!n?.downloadModel) {
    throw new Error('ML Kit no está en este build (hace falta development build).');
  }
  return n.downloadModel(code);
}

export async function mlkitDeleteModel(code: string): Promise<boolean> {
  const n = getNative();
  if (!n?.deleteModel) return false;
  return n.deleteModel(code);
}

export async function mlkitIdentifyLanguage(text: string): Promise<string | null> {
  const n = getNative();
  if (!n?.identifyLanguage) return null;
  return n.identifyLanguage(text);
}

export async function mlkitTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<MlkitTranslateResult> {
  const n = getNative();
  if (!n?.translate) {
    throw new Error('ML Kit no está en este build (hace falta development build).');
  }
  return n.translate(text, sourceLang, targetLang);
}

export class MlkitModelMissingError extends Error {
  code = 'MODEL_MISSING' as const;
  languageCode: string;
  constructor(message: string, languageCode = '') {
    super(message);
    this.name = 'MlkitModelMissingError';
    this.languageCode = languageCode;
  }
}

export function isMlkitModelMissing(err: unknown): err is MlkitModelMissingError {
  if (err instanceof MlkitModelMissingError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /MODEL_MISSING|Falta el paquete/i.test(msg);
}

export default {
  mlkitAvailable,
  mlkitEngine,
  mlkitSupportedLanguageCodes,
  mlkitIsModelDownloaded,
  mlkitDownloadModel,
  mlkitDeleteModel,
  mlkitIdentifyLanguage,
  mlkitTranslate,
};
