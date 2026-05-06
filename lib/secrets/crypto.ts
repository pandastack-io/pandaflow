import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const KEY_ID = 'v1';
const IV_LENGTH = 12;
const DEV_FALLBACK_KEY = 'dev-encryption-key-do-not-use-in-production';

function getKeyMaterial(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY?.trim();

  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  return createHash('sha256').update(envKey || DEV_FALLBACK_KEY).digest();
}

export async function encrypt(plaintext: string): Promise<{ ciphertext: string; keyId: string }> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getKeyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: JSON.stringify({
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      value: encrypted.toString('base64'),
    }),
    keyId: KEY_ID,
  };
}

export async function decrypt(ciphertext: string, keyId: string): Promise<string> {
  if (keyId !== KEY_ID) {
    throw new Error(`Unsupported encryption key version: ${keyId}`);
  }

  const payload = JSON.parse(ciphertext) as { iv: string; tag: string; value: string };
  const decipher = createDecipheriv('aes-256-gcm', getKeyMaterial(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
