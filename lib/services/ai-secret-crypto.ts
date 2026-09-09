export type EncryptedAISecret = { ciphertext: string; iv: string; version: 1 };
const encoder = new TextEncoder();
const additionalData = encoder.encode('WOW_RIGHT_AI_SETTINGS_V1');
function toBase64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
export function validateAIEncryptionKey(value: string | undefined) {
  if (!value) return false;
  try {
    return fromBase64(value).byteLength === 32;
  } catch {
    return false;
  }
}
async function importMasterKey(value: string | undefined) {
  if (!validateAIEncryptionKey(value))
    throw new Error('AI_SECRET_STORAGE_NOT_CONFIGURED');
  return crypto.subtle.importKey(
    'raw',
    fromBase64(value!),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptAISecret(
  secret: string,
  masterKey: string | undefined,
): Promise<EncryptedAISecret> {
  const key = await importMasterKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    key,
    encoder.encode(secret),
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    version: 1,
  };
}
export async function decryptAISecret(
  envelope: EncryptedAISecret,
  masterKey: string | undefined,
) {
  if (envelope.version !== 1) throw new Error('AI_SECRET_VERSION_UNSUPPORTED');
  const key = await importMasterKey(masterKey);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData },
      key,
      fromBase64(envelope.ciphertext),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('AI_SECRET_DECRYPTION_FAILED');
  }
}
