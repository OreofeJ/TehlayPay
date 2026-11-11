import React from 'react';
import {
  Shield,
  Lock,
  CreditCard,
  Sparkles,
  ShoppingBag,
  BarChart3,
  History,
} from 'lucide-react';
import type { SystemStatus } from '../shared/types.ts';

export type NavigationTab = 'procurement' | 'analytics' | 'audit';

interface HeaderProps {
  status: SystemStatus | null;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onRunTestScenario: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  activeTab,
  onSelectTab,
  onRunTestScenario,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Purpose */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-inner">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold tracking-tight text-white">TehlayPay</span>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-blue-950 text-blue-300 border border-blue-800 rounded">
                PayPal AI Hackathon
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Policy-Controlled Purchasing Agent for Small Businesses
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center rounded-xl bg-slate-800/90 border border-slate-700/80 p-1 text-xs">
          <button
            onClick={() => onSelectTab('procurement')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'procurement'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Procurement</span>
          </button>

          <button
            onClick={() => onSelectTab('analytics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => onSelectTab('audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History</span>
          </button>
        </nav>

        {/* Status Indicators & Demo Action */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3 text-xs">
          {/* Channel3 Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                status?.channel3Live ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
              }`}
            ></span>
            <span>Channel3:</span>
            <span
              className={`font-semibold ${
                status?.channel3Live ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {status?.channel3Live ? 'Live API' : 'Fixture Mode'}
            </span>
          </div>

          {/* PayPal Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
            <CreditCard className="w-3.5 h-3.5 text-blue-400" />
            <span>PayPal:</span>
            <span
              className={`font-semibold ${
                status?.paypalSandboxConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {status?.paypalSandboxConnected ? 'Sandbox Connected' : 'Sandbox Config'}
            </span>
          </div>

          {/* Policy Engine Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Policy:</span>
            <span className="font-semibold text-emerald-400">Deterministic</span>
          </div>

          {/* Quick Demo Scenario Trigger */}
          <button
            onClick={onRunTestScenario}
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition shadow-sm cursor-pointer"
            title="Load the hackathon laptop scenario ($800, 16GB RAM, new)"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-200" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>
    </header>
  );
};

