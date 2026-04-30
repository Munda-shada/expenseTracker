import { exportEntriesCsv, exportEntriesPdf } from './backup'

export type ReportPeriod = 'this_month' | 'last_month'

export async function exportMonthlyCsv(period: ReportPeriod = 'this_month'): Promise<void> {
  await exportEntriesCsv({ period })
}

export async function exportMonthlyPdf(period: ReportPeriod = 'this_month'): Promise<'opened' | 'downloaded'> {
  return exportEntriesPdf({ period })
}

