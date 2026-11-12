/** Wire protocol id for Signal / libsignal sessions (new Private chats). */
export const SIGNAL_PROTOCOL = 'libsignal' as const;

/**
 * Legacy homemade ratchet. Disabled for NEW sessions / NEW encrypts.
 * Decrypt of old synapmsg-pq-v1 envelopes may still be attempted by callers
 * that opt in — never used to start a new chat.
 */
export const LEGACY_PQ_PROTOCOL = 'synapmsg-pq-v1' as const;
export const LEGACY_PQ_RATCHET_DISABLED_FOR_NEW = true;

/** ciphertextType stored on API messages for Signal envelopes. */
export const SIGNAL_CIPHERTEXT_TYPE = 3;
