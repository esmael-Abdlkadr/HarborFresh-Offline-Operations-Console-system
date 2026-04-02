import { afterEach, describe, expect, it } from 'vitest'
import { decryptField, deriveEncryptionKey, encryptField, hashPassword } from './cryptoService.ts'

describe('cryptoService', () => {
  it('encrypt/decrypt round-trip works', async () => {
    const key = await deriveEncryptionKey('HarborAdmin#1!', '00112233445566778899aabbccddeeff')
    const cipher = await encryptField('secret', key)
    const plain = await decryptField(cipher, key)
    expect(plain).toBe('secret')
  })

  describe('fail-closed when SubtleCrypto unavailable', () => {
    const originalSubtle = crypto.subtle

    afterEach(() => {
      Object.defineProperty(crypto, 'subtle', { value: originalSubtle, writable: true })
    })

    it('hashPassword throws when SubtleCrypto is missing', async () => {
      Object.defineProperty(crypto, 'subtle', { value: undefined, writable: true })
      await expect(hashPassword('password')).rejects.toThrow('SubtleCrypto is not available')
    })

    it('deriveEncryptionKey throws when SubtleCrypto is missing', async () => {
      Object.defineProperty(crypto, 'subtle', { value: undefined, writable: true })
      await expect(
        deriveEncryptionKey('password', '00112233445566778899aabbccddeeff'),
      ).rejects.toThrow('SubtleCrypto is not available')
    })

    it('encryptField throws when SubtleCrypto is missing', async () => {
      // Derive a valid key first, then remove SubtleCrypto before encrypting
      const key = await deriveEncryptionKey('password', '00112233445566778899aabbccddeeff')
      Object.defineProperty(crypto, 'subtle', { value: undefined, writable: true })
      await expect(encryptField('secret', key)).rejects.toThrow('SubtleCrypto is not available')
    })

    it('decryptField throws when SubtleCrypto is missing', async () => {
      const key = await deriveEncryptionKey('password', '00112233445566778899aabbccddeeff')
      const cipher = await encryptField('secret', key)
      Object.defineProperty(crypto, 'subtle', { value: undefined, writable: true })
      await expect(decryptField(cipher, key)).rejects.toThrow('SubtleCrypto is not available')
    })
  })
})
