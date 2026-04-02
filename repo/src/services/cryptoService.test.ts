import { describe, expect, it } from 'vitest'
import { decryptField, deriveEncryptionKey, encryptField } from './cryptoService.ts'

describe('cryptoService', () => {
  it('encrypt/decrypt round-trip works', async () => {
    const key = await deriveEncryptionKey('HarborAdmin#1!', '00112233445566778899aabbccddeeff')
    const cipher = await encryptField('secret', key)
    const plain = await decryptField(cipher, key)
    expect(plain).toBe('secret')
  })
})
