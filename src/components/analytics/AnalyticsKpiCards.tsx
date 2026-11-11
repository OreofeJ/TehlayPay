import React from 'react';
import type { AnalyticsOverview } from '../../shared/types.ts';
import {
  FileText,
  DollarSign,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

interface Props {
  kpis: AnalyticsOverview['kpis'];
  onSelectDecisionFilter?: (decision: 'PASS' | 'BLOCKED' | 'REVIEW' | 'ALL') => void;
}

export const AnalyticsKpiCards: React.FC<Props> = ({ kpis, onSelectDecisionFilter }) => {
  const renderComparison = (metric: {
    previousValue: number | null;
    changePercentage: number | null;
    hasSufficientHistory: boolean;
  }) => {
    if (!metric.hasSufficientHistory || metric.changePercentage === null) {
      return (
        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
          <Minus className="w-3 h-3 text-slate-400" />
          <span>No prior period baseline</span>
        </span>
      );
    }

    const isPositive = metric.changePercentage > 0;
    const isZero = metric.changePercentage === 0;

    return (
      <span
        className={`text-[11px] font-semibold flex items-center gap-0.5 ${
          isZero
            ? 'text-slate-500'
            : isPositive
            ? 'text-emerald-700'
            : 'text-rose-700'
        }`}
      >
        {isPositive ? (
          <TrendingUp className="w-3 h-3 text-emerald-600" />
        ) : isZero ? (
          <Minus className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3 text-rose-600" />
        )}
        <span>
          {isPositive ? `+${metric.changePercentage}%` : `${metric.changePercentage}%`} vs prior period
        </span>
      </span>
    );
  };

  const renderCurrencyList = (
    metrics: { currency: string; amount: number; recordCount: number }[],
    emptyLabel: string = '0.00'
  ) => {
    if (metrics.length === 0) {
      return <div className="text-xl font-bold text-slate-400 font-mono">{emptyLabel}</div>;
    }

    return (
      <div className="space-y-1">
        {metrics.map((m) => (
          <div key={m.currency} className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-mono">
              {m.currency === 'USD' ? '$' : m.currency === 'EUR' ? '€' : `${m.currency} `}
              {m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {m.currency} &bull; {m.recordCount} {m.recordCount === 1 ? 'record' : 'records'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
      {/* 1. Total Requests */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-xs font-semibold text-slate-500">Procurement Requests</span>
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
            <FileText className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
            {kpis.totalRequests.value}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Distinct buyer requirements</div>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          {renderComparison(kpis.totalRequests)}
        </div>
      </div>

      {/* 2. Total Estimated Value */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-xs font-semibold text-slate-500">Estimated Value</span>
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div>
          {renderCurrencyList(kpis.estimatedValueByCurrency, '0.00')}
          <div className="text-[10px] text-slate-500 mt-0.5">Authorized budget ceilings</div>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
            Pre-purchase ceiling
          </span>
        </div>
      </div>

      {/* 3. Approved Value */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-xs font-semibold text-slate-500">Approved Value</span>
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div>
          {renderCurrencyList(kpis.approvedValueByCurrency, '0.00')}
          <div className="text-[10px] text-slate-500 mt-0.5">Explicit buyer approvals</div>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
            Authorized for checkout
          </span>
        </div>
      </div>

      {/* 4. Captured Payment Value */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-xs font-semibold text-slate-500">Captured Spend</span>
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>
        <div>
          {renderCurrencyList(kpis.capturedValueByCurrency, '0.00')}
          <div className="text-[10px] text-slate-500 mt-0.5">Verified PayPal Sandbox captures</div>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          <span className="text-[10px] text-blue-800 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
            Actual completed spend
          </span>
        </div>
      </div>

      {/* 5. Blocked Requests / Evaluations */}
      <div
        onClick={() => onSelectDecisionFilter?.('BLOCKED')}
        className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between hover:border-rose-300 hover:shadow-xs transition cursor-pointer group"
        title="Click to filter recent activity by BLOCKED items"
      >
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-xs font-semibold text-slate-500 group-hover:text-rose-700">Blocked Items</span>
          <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-100">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-rose-700 tracking-tight font-mono">
            {kpis.blockedEvaluationsCount.value}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Policy violations stopped</div>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between">
          {renderComparison(kpis.blockedEvaluationsCount)}
          <span className="text-[10px] text-rose-600 font-medium group-hover:underline">View &rarr;</span>
        </div>
      </div>

      {/* 6. Review Requests */}
      <div
        onClick={() => onSelectDecisionFilter?.('REVIEW')}
        className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between hover:border-amber-300 hover:shadow-xs transition cursor-pointer group"
        title="Click to filter recent activity by REVIEW items"
      >
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-xs font-semibold text-slate-500 group-hover:text-amber-700">Awaiting Review</span>
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100">
            <HelpCircle className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-amber-700 tracking-tight font-mono">
            {kpis.reviewEvaluationsCount.value}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Missing or ambiguous specs</div>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between">
          {renderComparison(kpis.reviewEvaluationsCount)}
          <span className="text-[10px] text-amber-600 font-medium group-hover:underline">Inspect &rarr;</span>
        </div>
      </div>
    </div>
  );
};
