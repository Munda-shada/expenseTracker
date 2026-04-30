declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id?: string
            scope: string
            callback: (res: { access_token?: string }) => void
          }) => {
            requestAccessToken: () => void
          }
        }
      }
    }
  }
}

export async function getGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google auth script not loaded'))
      return
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (res) => {
        if (res.access_token) resolve(res.access_token)
        else reject(new Error('No access token received'))
      },
    })

    client.requestAccessToken()
  })
}
