function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function randomChallenge(): Uint8Array {
  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  return challenge
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PublicKeyCredential' in window &&
    !!navigator.credentials
  )
}

export async function registerBiometricCredential(): Promise<string> {
  if (!isWebAuthnSupported()) {
    throw new Error('Device unlock is not supported in this browser.')
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: asBufferSource(randomChallenge()),
      rp: { name: 'Expense Tracker' },
      user: {
        id: asBufferSource(randomChallenge()),
        name: 'expense-tracker-local-user',
        displayName: 'Expense Tracker',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })

  if (!credential || credential.type !== 'public-key') {
    throw new Error('Device unlock setup was cancelled.')
  }

  return bytesToBase64Url(new Uint8Array((credential as PublicKeyCredential).rawId))
}

export async function verifyBiometricCredential(credentialId: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: asBufferSource(randomChallenge()),
        allowCredentials: [{
          id: asBufferSource(base64UrlToBytes(credentialId)),
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return assertion?.type === 'public-key'
  } catch {
    return false
  }
}
