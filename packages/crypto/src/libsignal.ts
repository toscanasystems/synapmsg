/**
 * Signal Protocol (libsignal) surface.
 * Android: org.signal:libsignal-client JNI via synap-libsignal Expo module.
 * TS path remains the wire-compatible Double Ratchet + PQ hybrid (synapmsg-pq-v1).
 */

export type SignalIdentityKeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

export type SignalPreKeyBundle = {
  registrationId: number;
  identityKey: Uint8Array;
  signedPreKeyId: number;
  signedPreKey: Uint8Array;
  signedPreKeySig: Uint8Array;
  oneTimePreKeyId?: number;
  oneTimePreKey?: Uint8Array;
  pqKemPub?: Uint8Array;
};

export const LIBSIGNAL = {
  protocol: 'libsignal',
  implementation: 'org.signal:libsignal-client@0.76.1 + synapmsg-pq-v1',
  nativeBinding: true,
  features: [
    'X3DH',
    'DoubleRatchet',
    'SignedPreKey',
    'OneTimePreKey',
    'ML-KEM768-hybrid',
    'JNI-Curve-HKDF-AESGCM',
  ],
} as const;

export function libsignalStatus() {
  return {
    ...LIBSIGNAL,
    ready: true,
    note:
      'Android loads official libsignal-client JNI (Rust). Session wire stays synapmsg-pq-v1 (DR+PQ).',
  };
}
