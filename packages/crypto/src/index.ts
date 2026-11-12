/**
 * @synapmsg/crypto — Signal Protocol (libsignal) for Synap Private chats.
 */

export {
  LEGACY_PQ_PROTOCOL,
  LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
  SIGNAL_CIPHERTEXT_TYPE,
  SIGNAL_PROTOCOL,
} from './signal/constants';

export { MemorySignalStore } from './signal/memoryStore';

export {
  installSignalIdentity,
  processPeerBundle,
  signalDecrypt,
  signalEncrypt,
  signalSafetyNumber,
  safetyQrPayload,
  toPublicBundle,
  type LocalInstall,
  type PublicPreKeyBundle,
  type SignalWireEnvelope,
} from './signal/protocol';

/** @deprecated Homemade PQ ratchet is disabled for new chats. */
export const LEGACY_STATUS = {
  protocol: 'synapmsg-pq-v1',
  enabledForNewChats: false,
  note: 'Use SIGNAL_PROTOCOL (libsignal) for new Private 1:1 sessions.',
} as const;
