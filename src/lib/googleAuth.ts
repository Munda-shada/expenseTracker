declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          revoke?: (token: string, done?: (response: GoogleRevokeResponse) => void) => void
          initTokenClient: (config: {
            client_id?: string
            scope: string
            callback: (res: GoogleTokenResponse) => void
            error_callback?: (error: GoogleIdentityError) => void
          }) => {
            requestAccessToken: (overrideConfig?: GoogleTokenRequestOptions) => void
          }
        }
      }
    }
  }
}

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_EXPIRY_BUFFER_MS = 2 * 60 * 1000
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600
export const GOOGLE_RECONNECT_MESSAGE = 'Reconnect Google Drive to resume sync.'

interface GoogleTokenRequestOptions {
  prompt?: '' | 'none' | 'consent' | 'select_account'
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
  error_uri?: string
}

interface GoogleIdentityError {
  type?: 'popup_failed_to_open' | 'popup_closed' | 'unknown'
  message?: string
}

interface GoogleRevokeResponse {
  successful?: boolean
  error?: string
  error_description?: string
}

interface CachedAccessToken {
  token: string
  expiresAt: number
}

interface GetGoogleAccessTokenOptions {
  interactive?: boolean
}

class GoogleAuthInteractionRequiredError extends Error {
  constructor(message = GOOGLE_RECONNECT_MESSAGE) {
    super(message)
    this.name = 'GoogleAuthInteractionRequiredError'
  }
}

let cachedAccessToken: CachedAccessToken | null = null
let pendingAccessTokenRequest: Promise<string> | null = null

function getCachedAccessToken(): string | null {
  if (!cachedAccessToken) return null
  if (Date.now() >= cachedAccessToken.expiresAt) {
    cachedAccessToken = null
    return null
  }
  return cachedAccessToken.token
}

export function clearGoogleAccessToken(): void {
  cachedAccessToken = null
}

export async function revokeGoogleAccessToken(): Promise<boolean> {
  const token = getCachedAccessToken()
  clearGoogleAccessToken()

  if (!token || typeof window === 'undefined' || !window.google?.accounts.oauth2.revoke) {
    return false
  }

  return new Promise((resolve) => {
    window.google?.accounts.oauth2.revoke?.(token, (response) => {
      resolve(response.successful === true)
    })
  })
}

function cacheAccessToken(response: GoogleTokenResponse): string {
  if (!response.access_token) throw new Error('No access token received')

  const lifetimeSeconds = Number.isFinite(response.expires_in)
    ? response.expires_in ?? DEFAULT_TOKEN_LIFETIME_SECONDS
    : DEFAULT_TOKEN_LIFETIME_SECONDS
  cachedAccessToken = {
    token: response.access_token,
    expiresAt: Date.now() + lifetimeSeconds * 1000 - TOKEN_EXPIRY_BUFFER_MS,
  }
  return response.access_token
}

function getTokenErrorMessage(response: GoogleTokenResponse): string {
  return response.error_description || response.error || 'No access token received'
}

function getGoogleAuthUnavailableMessage(): string {
  if (typeof window === 'undefined') return 'Google auth is only available in the browser.'
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return 'Google client id is not configured.'
  return 'Google auth script not loaded'
}

export function isGoogleAuthInteractionRequired(error: unknown): boolean {
  return error instanceof GoogleAuthInteractionRequiredError
}

export async function getGoogleAccessToken(
  options: GetGoogleAccessTokenOptions = {}
): Promise<string> {
  const interactive = options.interactive ?? true
  const cachedToken = getCachedAccessToken()
  if (cachedToken) return cachedToken
  if (pendingAccessTokenRequest) return pendingAccessTokenRequest

  pendingAccessTokenRequest = new Promise<string>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.google || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      reject(new Error(getGoogleAuthUnavailableMessage()))
      return
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      scope: DRIVE_FILE_SCOPE,
      callback: (res) => {
        if (res.access_token) {
          resolve(cacheAccessToken(res))
          return
        }

        if (!interactive) {
          reject(new GoogleAuthInteractionRequiredError())
          return
        }

        reject(new Error(getTokenErrorMessage(res)))
      },
      error_callback: (error) => {
        if (!interactive || error.type === 'popup_closed') {
          reject(new GoogleAuthInteractionRequiredError())
          return
        }

        reject(new Error(error.message || 'Google sign-in failed.'))
      },
    })

    client.requestAccessToken({ prompt: interactive ? '' : 'none' })
  }).finally(() => {
    pendingAccessTokenRequest = null
  })

  return pendingAccessTokenRequest
}
