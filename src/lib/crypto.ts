/**
 * Production Cryptographic Engine for CipherX E2EE Platform
 * Built on Web Crypto API (SubtleCrypto)
 * Standardized primitives: ECDH P-256, AES-256-GCM, PBKDF2-HMAC-SHA256, HKDF-SHA256
 */

// 1. Generate cryptographic hex salt
export function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// 2. Generate 12-character Security Key in "ABCD-EFGH-IJKL" format
export function generateSecurityKey(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const getBlock = () => {
    const bytes = new Uint8Array(4);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => charset[b % charset.length]).join('');
  };
  return `${getBlock()}-${getBlock()}-${getBlock()}`;
}

// Normalize security key input
export function normalizeSecurityKey(key: string): string {
  const cleaned = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length === 12) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
  }
  return key.trim().toUpperCase();
}

// 3. Salted Password / Key Hashing via PBKDF2 (100,000 iterations)
export async function hashWithSalt(value: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(value);
  const saltBytes = encoder.encode(saltHex);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 4. Client-side local key encryption/decryption (e.g. for Security Key)
export async function encryptTextLocal(plaintext: string, secret: string, saltHex: string): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(saltHex),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptTextLocal(ciphertextBase64: string, ivBase64: string, secret: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(saltHex),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const ciphertextBytes = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    ciphertextBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// ==========================================
// 5. ECDH P-256 END-TO-END ENCRYPTION ENGINE
// ==========================================

export interface ECDHKeyPairJWK {
  publicKeyJWK: string;
  privateKeyJWK: string;
}

// Generate new ECDH P-256 identity keypair
export async function generateIdentityKeyPair(): Promise<{
  keyPairJWK: ECDHKeyPairJWK;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const pubJWK = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privJWK = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    keyPairJWK: {
      publicKeyJWK: JSON.stringify(pubJWK),
      privateKeyJWK: JSON.stringify(privJWK),
    },
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

// Import Public Key JWK
export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// Import Private Key JWK
export async function importPrivateKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Derive AES-256-GCM Session Key via ECDH Agreement
export async function deriveECDHSessionKey(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
  saltBytes: Uint8Array
): Promise<CryptoKey> {
  // Derive raw shared secret bits
  const sharedBits = await window.crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePublicKey },
    localPrivateKey,
    256
  );

  // Import shared secret bits for PBKDF2 / HKDF derivation
  const hkdfKey = await window.crypto.subtle.importKey(
    'raw',
    sharedBits,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM 256 Key
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: 1000,
      hash: 'SHA-256',
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt payload with E2EE (ECDH + AES-256-GCM)
export async function encryptE2EEPayload(
  plaintext: string,
  senderPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const sessionKey = await deriveECDHSessionKey(senderPrivateKey, recipientPublicKey, salt);
  const encoder = new TextEncoder();

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

// Decrypt payload with E2EE (ECDH + AES-256-GCM)
export async function decryptE2EEPayload(
  ciphertextBase64: string,
  ivBase64: string,
  saltBase64: string,
  recipientPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<string> {
  const ciphertextBytes = new Uint8Array(Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0)));
  const ivBytes = new Uint8Array(Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0)));
  const saltBytes = new Uint8Array(Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0)));

  const sessionKey = await deriveECDHSessionKey(recipientPrivateKey, senderPublicKey, saltBytes);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    sessionKey,
    ciphertextBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
