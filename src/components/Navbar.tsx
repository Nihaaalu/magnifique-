import React from 'react';
import { TabType } from '../types';
import { ArrowDownLeft, ArrowUpRight, Users, BarChart3 } from 'lucide-react';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const tabs: {
    id: TabType;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'income',
      label: 'Income',
      icon: <ArrowDownLeft className="w-3.5 h-3.5" />,
    },
    {
      id: 'expense',
      label: 'Expense',
      icon: <ArrowUpRight className="w-3.5 h-3.5" />,
    },
    {
      id: 'partner',
      label: 'Partner',
      icon: <Users className="w-3.5 h-3.5" />,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: <BarChart3 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <header className="bg-[#0A0A0A] border-b border-[#2A2A2A] sticky top-0 z-30 shadow-md">
      <div className="max-w-3xl mx-auto px-3 py-2.5 sm:py-3">
        {/* Header Branding */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            {/* Gold Brand Crest */}
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-[#171717] border border-[#D4AF37] p-1 shadow-xs">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#D4AF37]"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20V4l8 8 8-8v16" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black tracking-widest text-[#D4AF37] uppercase">
                  MAGNIFIQUE 2.0
                </span>
              </div>
              <span className="text-[10px] text-[#777777] font-medium tracking-tight block">
                Restaurant Accounts
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#171717] border border-[#2A2A2A] rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
            <span className="text-[10px] font-bold text-[#D4AF37] tracking-wider uppercase">
              THE MAGNIFIQUE
            </span>
          </div>
        </div>

        {/* 4-Tab Navigation */}
        <nav
          className="grid grid-cols-4 gap-1 bg-[#111111] p-1 rounded-lg border border-[#2A2A2A]"
          id="main-nav-tabs"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-md text-xs transition-all select-none cursor-pointer min-h-[38px] ${
                  isActive
                    ? 'bg-[#D4AF37] text-[#0A0A0A] font-black shadow-xs'
                    : 'text-[#B8B8B8] hover:text-[#F5F5F5] hover:bg-[#171717] font-semibold'
                }`}
              >
                <span className={isActive ? 'text-[#0A0A0A] font-bold' : 'text-[#777777]'}>
                  {tab.icon}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

