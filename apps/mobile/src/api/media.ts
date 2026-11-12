import * as FileSystem from 'expo-file-system';
import { apiClient, DIRECT_API_BASE_URL, getAuthToken } from './client';

export type UploadResult = {
  url: string;
  mediaType: 'image' | 'audio' | 'file';
  bytes?: number;
  usedBytes?: number;
  limitBytes?: number;
};

export type MediaQuota = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  maxFileBytes: number;
};

export async function fetchMediaQuota(): Promise<MediaQuota> {
  const { data } = await apiClient.get<MediaQuota>('/media/quota');
  return data;
}

/**
 * Upload always hits the direct API (not the CF tunnel).
 * Large base64 bodies through the Worker proxy often time out / 413.
 */
export async function uploadBase64(
  dataBase64: string,
  contentType: string,
): Promise<UploadResult> {
  if (!dataBase64 || dataBase64.length < 8) {
    throw new Error('No se pudo leer el archivo local');
  }
  const token = getAuthToken();
  const { data } = await apiClient.post<UploadResult>(
    '/media/upload',
    {
      contentType,
      dataBase64,
    },
    {
      baseURL: DIRECT_API_BASE_URL,
      timeout: 120_000,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      maxBodyLength: 50 * 1024 * 1024,
      maxContentLength: 50 * 1024 * 1024,
    },
  );
  if (!data?.url) {
    throw new Error('Upload sin URL de media');
  }
  return data;
}

export async function uploadLocalFile(
  uri: string,
  contentType: string,
): Promise<UploadResult> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uploadBase64(base64, contentType);
}
