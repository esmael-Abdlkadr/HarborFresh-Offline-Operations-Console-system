const PBKDF2_ITERATIONS = 100_000

function requireSubtleCrypto(): SubtleCrypto {
  if (!crypto.subtle) {
    throw new Error(
      'SubtleCrypto is not available. A secure context (HTTPS or localhost) is required for login and finance operations.',
    )
  }
  return crypto.subtle
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex value.')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deriveBits(password: string, saltBytes: Uint8Array): Promise<ArrayBuffer> {
  const subtle = requireSubtleCrypto()

  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  )

  return subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBytes),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256,
  )
}

export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const saltBytes = salt ? fromHex(salt) : crypto.getRandomValues(new Uint8Array(16))
  const bits = await deriveBits(password, saltBytes)
  return { hash: toHex(new Uint8Array(bits)), salt: toHex(saltBytes) }
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const derived = await hashPassword(password, salt)
  if (derived.hash.length !== hash.length) {
    return false
  }

  let mismatch = 0
  for (let i = 0; i < hash.length; i += 1) {
    mismatch |= derived.hash.charCodeAt(i) ^ hash.charCodeAt(i)
  }
  return mismatch === 0
}

export async function deriveEncryptionKey(password: string, keySalt: string): Promise<CryptoKey> {
  const subtle = requireSubtleCrypto()

  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(fromHex(keySalt)),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptField(value: string, key: CryptoKey): Promise<string> {
  const subtle = requireSubtleCrypto()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plainBytes = new TextEncoder().encode(value)

  const cipherBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plainBytes,
  )

  const cipherBytes = new Uint8Array(cipherBuffer)
  const payload = new Uint8Array(iv.length + cipherBytes.length)
  payload.set(iv, 0)
  payload.set(cipherBytes, iv.length)
  return bytesToBase64(payload)
}

export async function decryptField(cipher: string, key: CryptoKey): Promise<string> {
  const subtle = requireSubtleCrypto()
  const payload = base64ToBytes(cipher)
  const iv = payload.slice(0, 12)
  const encrypted = payload.slice(12)

  const plainBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encrypted,
  )

  return new TextDecoder().decode(plainBuffer)
}
