import { Entry } from './types'

export type PendingLogStatus = NonNullable<Entry['pendingStatus']>

export function getPendingLogStatus(entry: Entry): PendingLogStatus {
  return entry.pendingStatus ?? 'pending'
}

export function getPendingLogStatusLabel(status: PendingLogStatus): string {
  if (status === 'retrying') return 'Retrying'
  if (status === 'failed') return 'Failed'
  if (status === 'parsed') return 'Parsed'
  return 'Pending'
}

export function canRetryPendingLog(entry: Entry): boolean {
  const status = getPendingLogStatus(entry)
  return entry.pending && status !== 'retrying' && status !== 'parsed'
}

