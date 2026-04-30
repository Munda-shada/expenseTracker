import { v4 as uuidv4 } from 'uuid'
import { getGoogleAccessToken } from './googleAuth'
import {
  SYNCABLE_STORE_NAMES,
  SyncableStoreName,
  getAllFromSyncStore,
  getSetting,
  getSyncConflicts,
  getSyncTombstones,
  putIntoSyncStore,
  putSyncConflict,
  putSyncTombstone,
  setMutationNotifySuppressed,
  setSetting,
  setSyncMutationSuppressed,
  deleteFromSyncStore,
} from './db'
import { Settings, SyncConflict, SyncTombstone } from './types'

const SYNC_FILE_NAME = 'expense-tracker-sync.json'
const SYNC_SCHEMA_VERSION = 1

type StoreData = Record<SyncableStoreName, unknown[]>
type RevisionMap = Record<string, Record<string, number>>

interface SettingRecord {
  key: keyof Settings
  value: Settings[keyof Settings]
  updatedAt?: number
}

export interface SyncFile {
  metadata: {
    appName: 'Expense Tracker'
    syncSchemaVersion: number
    databaseVersion: number
    deviceId: string
    deviceName: string
    lastSyncedAt: number
    recordRevisions: RevisionMap
  }
  data: StoreData
  tombstones: SyncTombstone[]
  conflicts: SyncConflict[]
}

export interface SyncStatus {
  enabled: boolean
  autoSyncEnabled: boolean
  provider: 'googleDrive'
  deviceId: string
  deviceName: string
  lastSyncAt: number
  lastSyncStatus: Settings['lastSyncStatus']
  lastSyncError: string
  conflictCount: number
  driveFileId: string | null
  inProgress: boolean
}

const LOCAL_ONLY_SETTINGS = new Set<keyof Settings>([
  'syncEnabled',
  'syncProvider',
  'syncDriveFileId',
  'syncDeviceId',
  'syncDeviceName',
  'lastSyncAt',
  'lastSyncStatus',
  'lastSyncError',
  'autoSyncEnabled',
  'autoSyncIntervalMinutes',
  'syncConflictCount',
  'syncInProgress',
])

function emptyStoreData(): StoreData {
  return Object.fromEntries(SYNCABLE_STORE_NAMES.map((store) => [store, []])) as unknown as StoreData
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getRecordKey(storeName: SyncableStoreName, record: unknown): string {
  if (!isObject(record)) return ''
  if (storeName === 'settings') return String(record.key ?? '')
  if (storeName === 'tags') return String(record.name ?? '')
  return String(record.id ?? '')
}

function getRecordUpdatedAt(record: unknown): number {
  if (!isObject(record)) return 0
  const candidates = [
    record.updatedAt,
    record.createdAt,
    record.lastUsedAt,
    record.firstUsedAt,
  ]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function buildRevisionMap(data: StoreData): RevisionMap {
  const revisions: RevisionMap = {}
  for (const storeName of SYNCABLE_STORE_NAMES) {
    revisions[storeName] = {}
    for (const record of data[storeName]) {
      const key = getRecordKey(storeName, record)
      if (key) revisions[storeName][key] = getRecordUpdatedAt(record)
    }
  }
  return revisions
}

function normalizeSyncFile(value: unknown): SyncFile {
  if (!isObject(value) || !isObject(value.metadata) || !isObject(value.data)) {
    throw new Error('Drive sync file has an invalid shape.')
  }

  const data = emptyStoreData()
  for (const storeName of SYNCABLE_STORE_NAMES) {
    const records = value.data[storeName]
    data[storeName] = Array.isArray(records) ? records : []
  }

  return {
    metadata: {
      appName: 'Expense Tracker',
      syncSchemaVersion: Number(value.metadata.syncSchemaVersion ?? SYNC_SCHEMA_VERSION),
      databaseVersion: Number(value.metadata.databaseVersion ?? 6),
      deviceId: String(value.metadata.deviceId ?? ''),
      deviceName: String(value.metadata.deviceName ?? 'Unknown device'),
      lastSyncedAt: Number(value.metadata.lastSyncedAt ?? 0),
      recordRevisions: isObject(value.metadata.recordRevisions)
        ? value.metadata.recordRevisions as RevisionMap
        : buildRevisionMap(data),
    },
    data,
    tombstones: Array.isArray(value.tombstones) ? value.tombstones as SyncTombstone[] : [],
    conflicts: Array.isArray(value.conflicts) ? value.conflicts as SyncConflict[] : [],
  }
}

async function ensureDeviceIdentity(): Promise<{ deviceId: string; deviceName: string }> {
  const [storedDeviceId, storedDeviceName] = await Promise.all([
    getSetting('syncDeviceId'),
    getSetting('syncDeviceName'),
  ])
  const deviceId = storedDeviceId || uuidv4()
  const deviceName =
    storedDeviceName ||
    (typeof navigator !== 'undefined'
      ? `${navigator.platform || 'Web'} device`
      : 'Web device')

  if (!storedDeviceId) await setSetting('syncDeviceId', deviceId)
  if (!storedDeviceName) await setSetting('syncDeviceName', deviceName)
  return { deviceId, deviceName }
}

async function buildLocalSyncFile(): Promise<SyncFile> {
  const { deviceId, deviceName } = await ensureDeviceIdentity()
  const lastSyncedAt = (await getSetting('lastSyncAt')) ?? 0
  const data = emptyStoreData()

  await Promise.all(SYNCABLE_STORE_NAMES.map(async (storeName) => {
    const records = await getAllFromSyncStore(storeName)
    data[storeName] = storeName === 'settings'
      ? (records as SettingRecord[]).filter((record) => !LOCAL_ONLY_SETTINGS.has(record.key))
      : records
  }))

  return {
    metadata: {
      appName: 'Expense Tracker',
      syncSchemaVersion: SYNC_SCHEMA_VERSION,
      databaseVersion: 6,
      deviceId,
      deviceName,
      lastSyncedAt,
      recordRevisions: buildRevisionMap(data),
    },
    data,
    tombstones: await getSyncTombstones(),
    conflicts: await getSyncConflicts(100),
  }
}

async function findSyncFile(accessToken: string): Promise<string | null> {
  const cachedFileId = await getSetting('syncDriveFileId')
  if (cachedFileId) return cachedFileId

  const query = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  const fileId = data.files?.[0]?.id ?? null
  if (fileId) await setSetting('syncDriveFileId', fileId)
  return fileId
}

async function createDriveSyncFile(accessToken: string, content: string): Promise<string> {
  const metadata = { name: SYNC_FILE_NAME, mimeType: 'application/json' }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', new Blob([content], { type: 'application/json' }))

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  )
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  if (!data.id) throw new Error('Google Drive did not return a file id.')
  await setSetting('syncDriveFileId', data.id)
  return data.id
}

async function updateDriveSyncFile(accessToken: string, fileId: string, content: string): Promise<void> {
  const res = await fetch(
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
  if (!res.ok) throw new Error(await res.text())
}

export async function pullRemoteSyncFile(accessToken?: string): Promise<SyncFile | null> {
  const token = accessToken ?? await getGoogleAccessToken()
  const fileId = await findSyncFile(token)
  if (!fileId) return null

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 404) {
    await setSetting('syncDriveFileId', null)
    return null
  }
  if (!res.ok) throw new Error(await res.text())

  try {
    return normalizeSyncFile(await res.json())
  } catch {
    throw new Error('Could not read the Google Drive sync file.')
  }
}

export async function pushRemoteSyncFile(syncFile: SyncFile, accessToken?: string): Promise<void> {
  const token = accessToken ?? await getGoogleAccessToken()
  const content = JSON.stringify(syncFile, null, 2)
  const fileId = await findSyncFile(token)
  if (fileId) await updateDriveSyncFile(token, fileId, content)
  else await createDriveSyncFile(token, content)
}

function mergeTombstones(local: SyncTombstone[], remote: SyncTombstone[]): SyncTombstone[] {
  const byId = new Map<string, SyncTombstone>()
  for (const tombstone of [...remote, ...local]) {
    const existing = byId.get(tombstone.id)
    if (!existing || tombstone.deletedAt > existing.deletedAt) byId.set(tombstone.id, tombstone)
  }
  return [...byId.values()]
}

function mergeConflicts(local: SyncConflict[], remote: SyncConflict[], generated: SyncConflict[]): SyncConflict[] {
  const byId = new Map<string, SyncConflict>()
  for (const conflict of [...remote, ...local, ...generated]) {
    byId.set(conflict.id, conflict)
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
}

export function mergeSyncState(local: SyncFile, remote: SyncFile | null): SyncFile {
  if (!remote) {
    return {
      ...local,
      metadata: {
        ...local.metadata,
        lastSyncedAt: Date.now(),
        recordRevisions: buildRevisionMap(local.data),
      },
    }
  }

  const mergedData = emptyStoreData()
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones)
  const tombstoneByRecord = new Map(tombstones.map((item) => [item.id, item]))
  const generatedConflicts: SyncConflict[] = []
  const baseline = local.metadata.lastSyncedAt

  for (const storeName of SYNCABLE_STORE_NAMES) {
    const localByKey = new Map(local.data[storeName].map((record) => [getRecordKey(storeName, record), record]))
    const remoteByKey = new Map(remote.data[storeName].map((record) => [getRecordKey(storeName, record), record]))
    const keys = new Set([...localByKey.keys(), ...remoteByKey.keys()])

    for (const key of keys) {
      if (!key) continue
      const localRecord = localByKey.get(key)
      const remoteRecord = remoteByKey.get(key)
      const localUpdatedAt = getRecordUpdatedAt(localRecord)
      const remoteUpdatedAt = getRecordUpdatedAt(remoteRecord)
      const tombstone = tombstoneByRecord.get(`${storeName}:${key}`)

      if (tombstone && tombstone.deletedAt >= Math.max(localUpdatedAt, remoteUpdatedAt)) {
        continue
      }

      if (localRecord && remoteRecord) {
        const winner = localUpdatedAt >= remoteUpdatedAt ? 'local' : 'remote'
        if (
          localUpdatedAt !== remoteUpdatedAt &&
          localUpdatedAt > baseline &&
          remoteUpdatedAt > baseline
        ) {
          generatedConflicts.push({
            id: uuidv4(),
            storeName,
            recordKey: key,
            localUpdatedAt,
            remoteUpdatedAt,
            winner,
            createdAt: Date.now(),
          })
        }
        mergedData[storeName].push(winner === 'local' ? localRecord : remoteRecord)
      } else if (localRecord) {
        mergedData[storeName].push(localRecord)
      } else if (remoteRecord) {
        mergedData[storeName].push(remoteRecord)
      }
    }
  }

  return {
    metadata: {
      appName: 'Expense Tracker',
      syncSchemaVersion: SYNC_SCHEMA_VERSION,
      databaseVersion: 6,
      deviceId: local.metadata.deviceId,
      deviceName: local.metadata.deviceName,
      lastSyncedAt: Date.now(),
      recordRevisions: buildRevisionMap(mergedData),
    },
    data: mergedData,
    tombstones,
    conflicts: mergeConflicts(local.conflicts, remote.conflicts, generatedConflicts),
  }
}

async function applyMergedSyncFile(merged: SyncFile): Promise<void> {
  setSyncMutationSuppressed(true)
  setMutationNotifySuppressed(true)
  try {
    for (const storeName of SYNCABLE_STORE_NAMES) {
      if (storeName === 'settings') continue
      const localRecords = await getAllFromSyncStore(storeName)
      const mergedKeys = new Set(merged.data[storeName].map((record) => getRecordKey(storeName, record)))
      for (const record of localRecords) {
        const key = getRecordKey(storeName, record)
        if (key && !mergedKeys.has(key)) await deleteFromSyncStore(storeName, key)
      }
      for (const record of merged.data[storeName]) {
        await putIntoSyncStore(storeName, record)
      }
    }

    const mergedSettings = merged.data.settings as SettingRecord[]
    for (const record of mergedSettings) {
      if (!LOCAL_ONLY_SETTINGS.has(record.key)) await putIntoSyncStore('settings', record)
    }

    for (const tombstone of merged.tombstones) {
      await putSyncTombstone(tombstone)
    }
    for (const conflict of merged.conflicts) {
      await putSyncConflict(conflict)
    }
  } finally {
    setMutationNotifySuppressed(false)
    setSyncMutationSuppressed(false)
  }
}

export async function runCloudSync(): Promise<SyncStatus> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Cloud sync needs an internet connection.')
  }

  const alreadyRunning = await getSetting('syncInProgress')
  if (alreadyRunning) return getSyncStatus()

  await setSetting('syncInProgress', true)
  await setSetting('lastSyncStatus', 'syncing')
  await setSetting('lastSyncError', '')

  try {
    const token = await getGoogleAccessToken()
    const local = await buildLocalSyncFile()
    const remote = await pullRemoteSyncFile(token)
    const merged = mergeSyncState(local, remote)
    await applyMergedSyncFile(merged)
    await pushRemoteSyncFile(merged, token)
    await setSetting('syncEnabled', true)
    await setSetting('lastSyncAt', merged.metadata.lastSyncedAt)
    await setSetting('lastSyncStatus', 'success')
    await setSetting('syncConflictCount', merged.conflicts.length)
    await setSetting('lastSyncError', '')
    return getSyncStatus()
  } catch (error) {
    await setSetting('lastSyncStatus', 'error')
    await setSetting('lastSyncError', error instanceof Error ? error.message : 'Cloud sync failed.')
    throw error
  } finally {
    await setSetting('syncInProgress', false)
  }
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [
    enabled,
    autoSyncEnabled,
    deviceId,
    deviceName,
    lastSyncAt,
    lastSyncStatus,
    lastSyncError,
    conflictCount,
    driveFileId,
    inProgress,
  ] = await Promise.all([
    getSetting('syncEnabled'),
    getSetting('autoSyncEnabled'),
    getSetting('syncDeviceId'),
    getSetting('syncDeviceName'),
    getSetting('lastSyncAt'),
    getSetting('lastSyncStatus'),
    getSetting('lastSyncError'),
    getSetting('syncConflictCount'),
    getSetting('syncDriveFileId'),
    getSetting('syncInProgress'),
  ])

  return {
    enabled: enabled ?? false,
    autoSyncEnabled: autoSyncEnabled ?? true,
    provider: 'googleDrive',
    deviceId: deviceId ?? '',
    deviceName: deviceName ?? '',
    lastSyncAt: lastSyncAt ?? 0,
    lastSyncStatus: lastSyncStatus ?? 'idle',
    lastSyncError: lastSyncError ?? '',
    conflictCount: conflictCount ?? 0,
    driveFileId: driveFileId ?? null,
    inProgress: inProgress ?? false,
  }
}

export async function scheduleCloudSync(reason = 'scheduled'): Promise<void> {
  const [enabled, autoEnabled, inProgress, lastSyncAt, intervalMinutes] = await Promise.all([
    getSetting('syncEnabled'),
    getSetting('autoSyncEnabled'),
    getSetting('syncInProgress'),
    getSetting('lastSyncAt'),
    getSetting('autoSyncIntervalMinutes'),
  ])
  if (!enabled || autoEnabled === false || inProgress) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const intervalMs = Math.max(1, intervalMinutes ?? 15) * 60 * 1000
  if (reason !== 'mutation' && lastSyncAt && Date.now() - lastSyncAt < intervalMs) return

  window.setTimeout(() => {
    runCloudSync().catch((error: Error) => console.error('Cloud sync failed:', error))
  }, reason === 'mutation' ? 1500 : 100)
}
