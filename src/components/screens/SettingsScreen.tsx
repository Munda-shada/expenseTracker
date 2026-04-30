'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Bot,
  Brain,
  CalendarClock,
  ChevronRight,
  Cloud,
  DatabaseBackup,
  Activity,
  Download,
  Gauge,
  History,
  LifeBuoy,
  Lock,
  ReceiptText,
  Repeat,
  Shapes,
  Tags,
  WalletCards,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import BudgetsScreen from './settings/BudgetsScreen'
import CategoriesScreen from './settings/CategoriesScreen'
import TagsScreen from './settings/TagsScreen'
import QuickAddSettingsScreen from './settings/QuickAddSettingsScreen'
import CorrectionsScreen from './settings/CorrectionsScreen'
import BackupScreen from './settings/BackupScreen'
import RemindersScreen from './settings/RemindersScreen'
import PinLockScreen from './settings/PinLockScreen'
import ReconciliationScreen from './settings/ReconciliationScreen'
import YearReviewScreen from './settings/YearReviewScreen'
import PreferencesScreen from './settings/PreferencesScreen'
import ChatHistoryScreen from './settings/ChatHistoryScreen'
import RecurringScreen from './settings/RecurringScreen'
import QuickQuestionsScreen from './settings/QuickQuestionsScreen'
import DataHealthScreen from './settings/DataHealthScreen'
import CloudSyncScreen from './settings/CloudSyncScreen'


type SubScreen = null | 'budgets' | 'categories' | 'tags' | 'quickadd' | 'corrections' | 'backup' | 'reminders' | 'pin' | 'reconciliation' | 'yearReview' | 'preferences' | 'chatHistory' | 'recurring' | 'quickQuestions' | 'dataHealth' | 'cloudSync'

interface Props {
  canInstallPwa?: boolean
  onInstallPwa?: () => Promise<void>
}

export default function SettingsScreen({ canInstallPwa = false, onInstallPwa }: Props) {
  const [subScreen, setSubScreen] = useState<SubScreen>(null)

  useEffect(() => {
    console.log('[Settings] SettingsScreen mounted. PWA installation available:', canInstallPwa)
  }, [canInstallPwa])

  if (subScreen === 'budgets') {
    return <BudgetsScreen onBack={() => setSubScreen(null)} />
  }

  if (subScreen === 'categories') {
    return <CategoriesScreen onBack={() => setSubScreen(null)} />
  }
  if (subScreen === 'tags') {
    return <TagsScreen onBack={() => setSubScreen(null)} />
  }
  if (subScreen === 'quickadd') {
  return <QuickAddSettingsScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'corrections') {
  return <CorrectionsScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'backup') {
  return <BackupScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'reminders') {
  return <RemindersScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'pin') {
  return <PinLockScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'reconciliation') {
  return <ReconciliationScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'yearReview') {
  return <YearReviewScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'preferences') {
  return <PreferencesScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'chatHistory') {
  return <ChatHistoryScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'recurring') {
  return <RecurringScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'quickQuestions') {
  return <QuickQuestionsScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'dataHealth') {
  return <DataHealthScreen onBack={() => setSubScreen(null)} />
}
if (subScreen === 'cloudSync') {
  return <CloudSyncScreen onBack={() => setSubScreen(null)} />
}

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-slate-200 bg-white px-4 pb-4 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Control center</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Tune money tracking, automation, privacy, and AI behavior.</p>
      </div>

      <div className="px-4 py-4 space-y-5">
        <SettingsGroup title="Money">
            <SettingsRow
              icon={Shapes}
              label="Manage Categories"
              description="Edit, archive, and organize category labels."
              onPress={() => setSubScreen('categories')}
            />
            <SettingsRow
              icon={WalletCards}
              label="Monthly budgets"
              description="Set overall and category limits."
              onPress={() => setSubScreen('budgets')}
            />
            <SettingsRow
              icon={Tags}
              label="Manage Tags"
              description="Rename or remove reusable tags."
              onPress={() => setSubScreen('tags')}
            />
            <SettingsRow
              icon={Gauge}
              label="Quick Actions"
              description="Pin fast actions for frequent spends."
              onPress={() => setSubScreen('quickadd')}
              last
            />
        </SettingsGroup>

        <SettingsGroup title="Automation">
            <SettingsRow
              icon={Repeat}
              label="Recurring Expenses"
              description="Review scheduled entries before saving."
              onPress={() => setSubScreen('recurring')}
            />
            <SettingsRow
              icon={CalendarClock}
              label="Reminders"
              description="Daily nudge to log missing expenses."
              onPress={() => setSubScreen('reminders')}
            />
            <SettingsRow
              icon={Download}
              label="Export and backup"
              description="CSV, PDF, JSON restore, and email backup."
              onPress={() => setSubScreen('backup')}
            />
            <SettingsRow
              icon={Cloud}
              label="Cloud sync"
              description="Sync all app data across devices with Google Drive."
              onPress={() => setSubScreen('cloudSync')}
              last
            />
        </SettingsGroup>

        <SettingsGroup title="Privacy and data">
            <SettingsRow
              icon={Lock}
              label="PIN lock"
              description="Protect the app with PIN or device unlock."
              onPress={() => setSubScreen('pin')}
            />
            <SettingsRow
              icon={ReceiptText}
              label="Reconciliation"
              description="Compare expected and actual balances."
              onPress={() => setSubScreen('reconciliation')}
            />
            <SettingsRow
              icon={DatabaseBackup}
              label="Year review"
              description="Annual summary and export-friendly review."
              onPress={() => setSubScreen('yearReview')}
            />
            <SettingsRow
              icon={Activity}
              label="Data health"
              description="Storage, pending logs, backups, and app update status."
              onPress={() => setSubScreen('dataHealth')}
            />
            {canInstallPwa && onInstallPwa && (
              <SettingsRow
                icon={Download}
                label="Install app"
                description="Faster offline access from your home screen."
                onPress={() => void onInstallPwa()}
              />
            )}
            <SettingsRow
              icon={LifeBuoy}
              label="Preferences and safety"
              description="Bulk detect, chat memory, reset, and safety controls."
              onPress={() => setSubScreen('preferences')}
              last
            />
        </SettingsGroup>

        <SettingsGroup title="AI">
            <SettingsRow
              icon={Bot}
              label="Quick questions"
              description="Create Ask shortcuts that refresh from current data."
              onPress={() => setSubScreen('quickQuestions')}
            />
            <SettingsRow
              icon={History}
              label="Chat history"
              description="Inspect or clear Ask mode memory."
              onPress={() => setSubScreen('chatHistory')}
            />
            <SettingsRow
              icon={Brain}
              label="AI corrections"
              description="Review learned corrections for parsing."
              onPress={() => setSubScreen('corrections')}
            />
            <SettingsRow
              icon={Bot}
              label="Multi-category mode"
              description="Choose full-count or split allocation."
              onPress={() => setSubScreen('preferences')}
              last
            />
        </SettingsGroup>

        <p className="text-center text-xs text-slate-400 pt-1">
          Expense Tracker v2.0
        </p>
      </div>
    </div>
  )
}

function SettingsGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        {title}
      </p>
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
        {children}
      </div>
    </section>
  )
}

function SettingsRow({
  icon: Icon,
  label,
  description,
  onPress,
  last = false,
  disabled = false,
}: {
  icon: LucideIcon
  label: string
  description: string
  onPress?: () => void
  last?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`w-full flex items-center justify-between gap-3 px-4 py-4 text-left transition-colors ${
        !last ? 'border-b border-slate-100' : ''
      } ${disabled ? 'opacity-40' : 'active:bg-slate-50'}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">{label}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
        </span>
      </div>
      {!disabled && (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      )}
    </button>
    
  )
}
