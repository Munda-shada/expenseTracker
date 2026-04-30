'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getEntriesInRange,
  getLatestReconciliationCheck,
  getLentBorrowed,
  getReconciliationChecks,
  saveReconciliationCheck,
} from '@/lib/db'
import { ReconciliationCheck } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  onBack: () => void
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const [year, monthNum] = month.split('-').map(Number)
  const endDate = new Date(year, monthNum, 0).getDate()
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDate).padStart(2, '0')}`,
  }
}

export default function ReconciliationScreen({ onBack }: Props) {
  const [month, setMonth] = useState(currentMonth())
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [note, setNote] = useState('')
  const [existing, setExisting] = useState<ReconciliationCheck | undefined>()
  const [history, setHistory] = useState<ReconciliationCheck[]>([])
  const [income, setIncome] = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [lentInfo, setLentInfo] = useState({ lent: 0, borrowed: 0 })
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { start, end } = monthBounds(month)
    const [entries, latest, allChecks, lentBorrowed] = await Promise.all([
      getEntriesInRange(start, end),
      getLatestReconciliationCheck(month),
      getReconciliationChecks(),
      getLentBorrowed(),
    ])
    setIncome(entries.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + entry.amount, 0))
    setExpenses(entries.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + entry.amount, 0))
    setExisting(latest)
    setHistory(allChecks)
    setLentInfo({
      lent: lentBorrowed
        .filter((record) => !record.settled && record.direction === 'lent')
        .reduce((sum, record) => sum + record.amount, 0),
      borrowed: lentBorrowed
        .filter((record) => !record.settled && record.direction === 'borrowed')
        .reduce((sum, record) => sum + record.amount, 0),
    })
    setOpeningBalance(latest ? String(latest.openingBalance) : '')
    setClosingBalance(latest ? String(latest.closingBalance) : '')
    setNote(latest?.note ?? '')
  }, [month])

  useEffect(() => {
    loadData()
  }, [loadData])

  const opening = Number(openingBalance || 0)
  const closing = Number(closingBalance || 0)
  const expectedBalance = useMemo(
    () => opening + income - expenses,
    [opening, income, expenses]
  )
  const difference = closing - expectedBalance

  const saveCheck = async () => {
    const saved = await saveReconciliationCheck({
      id: existing?.id,
      createdAt: existing?.createdAt,
      month,
      openingBalance: opening,
      closingBalance: closing,
      expectedBalance,
      difference,
      note,
    })
    setExisting(saved)
    await loadData()
    setToast('Reconciliation saved')
    window.setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-indigo-500 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Reconciliation</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800"
            />
          </label>
          <PaisaInput label="Opening balance" value={openingBalance} onChange={setOpeningBalance} />
          <PaisaInput label="Closing balance" value={closingBalance} onChange={setClosingBalance} />
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800"
              placeholder="Optional note"
            />
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-3">
          <SummaryRow label="Income" value={formatCurrency(income)} positive />
          <SummaryRow label="Expenses" value={formatCurrency(expenses)} />
          <SummaryRow label="Expected closing" value={formatCurrency(expectedBalance)} />
          <SummaryRow
            label="Difference"
            value={formatCurrency(difference)}
            positive={difference >= 0}
          />
          <div className="pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400">
              Unsettled lent: {formatCurrency(lentInfo.lent)} · borrowed: {formatCurrency(lentInfo.borrowed)}
            </p>
          </div>
          <button
            onClick={saveCheck}
            disabled={!openingBalance || !closingBalance}
            className="w-full py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40"
          >
            Save Check
          </button>
        </div>

        {history.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Recent Checks</p>
            <div className="space-y-2">
              {history.slice(0, 5).map((check) => (
                <button
                  key={check.id}
                  onClick={() => setMonth(check.month)}
                  className="w-full flex justify-between text-left py-2 border-b border-gray-50 last:border-b-0"
                >
                  <span className="text-sm text-gray-700">{check.month}</span>
                  <span className={`text-sm font-semibold ${check.difference >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatCurrency(check.difference)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

function PaisaInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800"
      />
    </label>
  )
}

function SummaryRow({
  label,
  value,
  positive = false,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${positive ? 'text-green-600' : 'text-gray-800'}`}>
        {value}
      </span>
    </div>
  )
}
