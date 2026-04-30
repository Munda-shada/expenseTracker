import { createJsonBackup } from './backup'
import { getGoogleAccessToken } from './googleAuth'
import { setSetting } from './db'

const BACKUP_FILE_NAME = 'expense-tracker-backup.json'

async function findBackupFile(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(
    `name='${BACKUP_FILE_NAME}' and trashed=false`
  )

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

async function createDriveFile(accessToken: string, content: string) {
  const metadata = {
    name: BACKUP_FILE_NAME,
    mimeType: 'application/json',
  }

  const form = new FormData()
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  )
  form.append(
    'file',
    new Blob([content], { type: 'application/json' })
  )

  return fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  )
}

async function updateDriveFile(
  accessToken: string,
  fileId: string,
  content: string
) {
  return fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    }
  )
}

export async function backupToGoogleDrive(): Promise<void> {
  const accessToken = await getGoogleAccessToken()
  const backup = await createJsonBackup()
  const content = JSON.stringify(backup, null, 2)

  const existingFileId = await findBackupFile(accessToken)

  const res = existingFileId
    ? await updateDriveFile(accessToken, existingFileId, content)
    : await createDriveFile(accessToken, content)

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }

  await setSetting('lastBackupAt', Date.now())
}