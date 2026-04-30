'use client'

import { BarChart3, HandCoins, Home, Settings } from 'lucide-react'

type Tab = 'home' | 'stats' | 'lent' | 'settings'

interface Props {
  activeTab: Tab
  onChange: (tab: Tab) => void
}

const tabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'stats', icon: BarChart3, label: 'Stats' },
  { id: 'lent', icon: HandCoins, label: 'Lent' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export default function BottomNav({ activeTab, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-120 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex px-2 py-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative flex-1 rounded-2xl py-2 transition-colors duration-150 ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400'
              }`}
              aria-label={tab.label}
            >
              <Icon className="mx-auto h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
              <span className="mt-0.5 block text-[10px] font-semibold">
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
