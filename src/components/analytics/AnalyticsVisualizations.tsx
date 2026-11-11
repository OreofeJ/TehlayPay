import React, { useState } from 'react';
import type {
  CategorySummary,
  TimeSeriesBucket,
  BudgetUtilisationScope,
} from '../../shared/types.ts';
import {
  Layers,
  PieChart,
  Calendar,
  Gauge,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  categories: CategorySummary[];
  decisionDistribution: {
    pass: { count: number; percentage: number };
    blocked: { count: number; percentage: number };
    review: { count: number; percentage: number };
    total: number;
  };
  timeSeries: TimeSeriesBucket[];
  budgetUtilisations: BudgetUtilisationScope[];
  onSelectCategory?: (category: string) => void;
  onSelectDecision?: (decision: 'PASS' | 'BLOCKED' | 'REVIEW') => void;
}

export const AnalyticsVisualizations: React.FC<Props> = ({
  categories,
  decisionDistribution,
  timeSeries,
  budgetUtilisations,
  onSelectCategory,
  onSelectDecision,
}) => {
  const [selectedCurrencyTab, setSelectedCurrencyTab] = useState<'USD' | 'EUR' | string>('USD');

  // Filter categories that have activity or show standard 7 categories
  const maxEvaluations = Math.max(...categories.map((c) => c.totalEvaluations), 1);
  const maxSpend = Math.max(
    ...categories.map((c) => c.spendByCurrency[selectedCurrencyTab] || 0),
    1
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ------------------------------------------------------------------ */}
      {/* Visualisation A: Procurement Spending & Volume by Category */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Procurement Activity by Category</h3>
              <p className="text-xs text-slate-500">Evaluations, pass rates, and budget allocations across domains</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          {categories.map((cat) => {
            const pct = Math.round((cat.totalEvaluations / maxEvaluations) * 100);
            const hasActivity = cat.totalEvaluations > 0 || cat.totalRequests > 0;
            const spend = cat.spendByCurrency['USD'] || cat.spendByCurrency['EUR'] || 0;
            const currencyKey = cat.spendByCurrency['EUR'] ? 'EUR' : 'USD';

            return (
              <div
                key={cat.category}
                onClick={() => onSelectCategory?.(cat.category)}
                className={`p-2.5 rounded-xl border transition cursor-pointer group ${
                  hasActivity
                    ? 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20'
                    : 'border-slate-100 bg-slate-50/50 opacity-60'
                }`}
                title={`Click to filter recent activity for ${cat.categoryDisplayName}`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-800 group-hover:text-indigo-700">
                    {cat.categoryDisplayName}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-mono text-[11px]">
                      {cat.totalEvaluations} evaluated ({cat.totalRequests} reqs)
                    </span>
                    {spend > 0 && (
                      <span className="font-bold text-emerald-700 font-mono text-[11px]">
                        {currencyKey === 'USD' ? '$' : '€'}
                        {spend.toFixed(2)} captured
                      </span>
                    )}
                  </div>
                </div>

                {/* Segmented Bar for Category Status */}
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                  {cat.totalEvaluations > 0 ? (
                    <>
                      <div
                        style={{ width: `${(cat.passCount / cat.totalEvaluations) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title={`${cat.passCount} PASS (${cat.passRate}%)`}
                      />
                      <div
                        style={{ width: `${(cat.blockedCount / cat.totalEvaluations) * 100}%` }}
                        className="bg-rose-500 h-full"
                        title={`${cat.blockedCount} BLOCKED (${cat.blockedRate}%)`}
                      />
                      <div
                        style={{ width: `${(cat.reviewCount / cat.totalEvaluations) * 100}%` }}
                        className="bg-amber-400 h-full"
                        title={`${cat.reviewCount} REVIEW`}
                      />
                    </>
                  ) : (
                    <div className="w-full bg-slate-200 h-full" />
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-700 font-semibold">{cat.passCount} Pass</span>
                    <span>&bull;</span>
                    <span className="text-rose-700 font-semibold">{cat.blockedCount} Blocked</span>
                    <span>&bull;</span>
                    <span className="text-amber-700 font-semibold">{cat.reviewCount} Review</span>
                  </div>
                  <span className="text-slate-400 group-hover:text-indigo-600 font-medium">Inspect &rarr;</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Visualisation B: Procurement Decision Distribution */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Policy Decision Distribution</h3>
                <p className="text-xs text-slate-500">Deterministic compliance outcomes across candidate products</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              {decisionDistribution.total} Total Decisions
            </span>
          </div>

          {/* Large Segmented Visual Bar */}
          <div className="mt-4 mb-5">
            <div className="w-full h-5 rounded-xl overflow-hidden flex bg-slate-100 border border-slate-200">
              {decisionDistribution.total > 0 ? (
                <>
                  <div
                    style={{ width: `${decisionDistribution.pass.percentage}%` }}
                    className="bg-emerald-500 transition-all hover:opacity-90"
                    title={`PASS: ${decisionDistribution.pass.count} (${decisionDistribution.pass.percentage}%)`}
                  />
                  <div
                    style={{ width: `${decisionDistribution.blocked.percentage}%` }}
                    className="bg-rose-500 transition-all hover:opacity-90"
                    title={`BLOCKED: ${decisionDistribution.blocked.count} (${decisionDistribution.blocked.percentage}%)`}
                  />
                  <div
                    style={{ width: `${decisionDistribution.review.percentage}%` }}
                    className="bg-amber-400 transition-all hover:opacity-90"
                    title={`REVIEW: ${decisionDistribution.review.count} (${decisionDistribution.review.percentage}%)`}
                  />
                </>
              ) : (
                <div className="w-full flex items-center justify-center text-[10px] text-slate-400 font-medium">
                  No policy evaluations recorded
                </div>
              )}
            </div>
          </div>

          {/* Interactive Decision Outcome Cards */}
          <div className="grid grid-cols-3 gap-3">
            {/* PASS */}
            <div
              onClick={() => onSelectDecision?.('PASS')}
              className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 transition cursor-pointer text-center group"
              title="Click to view all PASS items"
            >
              <div className="flex items-center justify-center gap-1 text-emerald-700 font-bold text-xs mb-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>PASS</span>
              </div>
              <div className="text-2xl font-black text-emerald-900 font-mono">
                {decisionDistribution.pass.count}
              </div>
              <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                {decisionDistribution.pass.percentage}% of total
              </div>
              <div className="text-[9px] text-emerald-600 mt-1">Compliant with all rules</div>
            </div>

            {/* BLOCKED */}
            <div
              onClick={() => onSelectDecision?.('BLOCKED')}
              className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 transition cursor-pointer text-center group"
              title="Click to view all BLOCKED items"
            >
              <div className="flex items-center justify-center gap-1 text-rose-700 font-bold text-xs mb-1">
                <XCircle className="w-3.5 h-3.5" />
                <span>BLOCKED</span>
              </div>
              <div className="text-2xl font-black text-rose-900 font-mono">
                {decisionDistribution.blocked.count}
              </div>
              <div className="text-[11px] font-semibold text-rose-700 mt-0.5">
                {decisionDistribution.blocked.percentage}% of total
              </div>
              <div className="text-[9px] text-rose-600 mt-1">Hard constraint violations</div>
            </div>

            {/* REVIEW */}
            <div
              onClick={() => onSelectDecision?.('REVIEW')}
              className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-50 transition cursor-pointer text-center group"
              title="Click to view all REVIEW items"
            >
              <div className="flex items-center justify-center gap-1 text-amber-700 font-bold text-xs mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>REVIEW</span>
              </div>
              <div className="text-2xl font-black text-amber-900 font-mono">
                {decisionDistribution.review.count}
              </div>
              <div className="text-[11px] font-semibold text-amber-700 mt-0.5">
                {decisionDistribution.review.percentage}% of total
              </div>
              <div className="text-[9px] text-amber-600 mt-1">Ambiguous or unverified</div>
            </div>
          </div>
        </div>

        {/* Explanatory Policy Note */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Policy Rule Discipline: </strong>
            A <em>PASS</em> outcome certifies policy compliance against budget, condition, and specs. It does not imply automatic payment. Every purchase requires explicit buyer authorization prior to PayPal Sandbox checkout.
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Visualisation C: Procurement Activity Over Time */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Procurement Activity Over Time</h3>
              <p className="text-xs text-slate-500">Chronological timeline of requests and candidate evaluations</p>
            </div>
          </div>
        </div>

        {timeSeries.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
            <span>No activity recorded in the selected period.</span>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <div className="h-40 flex items-end gap-2 border-b border-slate-200 pb-2 px-1">
              {timeSeries.map((bucket) => {
                const totalActivity = bucket.requestsCount + bucket.evaluationsCount;
                const maxDayActivity = Math.max(
                  ...timeSeries.map((t) => t.requestsCount + t.evaluationsCount),
                  1
                );
                const heightPct = Math.max(15, Math.round((totalActivity / maxDayActivity) * 100));

                return (
                  <div
                    key={bucket.dateKey}
                    className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-2 rounded-lg shadow-lg z-20 whitespace-nowrap pointer-events-none">
                      <span className="font-bold border-b border-slate-700 pb-0.5 mb-1">{bucket.periodLabel}</span>
                      <span>Requests: {bucket.requestsCount}</span>
                      <span>Evaluations: {bucket.evaluationsCount}</span>
                      <span className="text-emerald-300">Pass: {bucket.passCount}</span>
                      <span className="text-rose-300">Blocked: {bucket.blockedCount}</span>
                      <span className="text-amber-300">Review: {bucket.reviewCount}</span>
                    </div>

                    <div className="w-full flex items-end justify-center h-28">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full max-w-[32px] rounded-t-md bg-blue-600 group-hover:bg-blue-500 transition-all flex flex-col justify-end overflow-hidden"
                      >
                        {bucket.blockedCount > 0 && (
                          <div
                            style={{
                              height: `${(bucket.blockedCount / (totalActivity || 1)) * 100}%`,
                            }}
                            className="w-full bg-rose-500"
                          />
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[48px]">
                      {bucket.periodLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block"></span>
                  <span>Evaluations / Requests</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
                  <span>Blocked items</span>
                </span>
              </div>
              <span>Based on authoritative UTC timestamps</span>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Visualisation D: Budget Utilisation Monitor */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Procurement Budget Headroom</h3>
              <p className="text-xs text-slate-500">Per-request budget ceiling vs. committed orders and headroom</p>
            </div>
          </div>
        </div>

        {budgetUtilisations.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
            <span>No active procurement requests in the selected period.</span>
          </div>
        ) : (
          <div className="space-y-3 pt-1 max-h-56 overflow-y-auto pr-1">
            {budgetUtilisations.map((b) => (
              <div
                key={b.requirementId}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 truncate max-w-[220px]" title={b.targetItem}>
                    {b.targetItem}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      b.status === 'EXCEEDED'
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : b.status === 'WARNING'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {b.status} ({b.utilisationPercentage}% Utilized)
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, b.utilisationPercentage)}%` }}
                    className={`h-full ${
                      b.status === 'EXCEEDED'
                        ? 'bg-rose-600'
                        : b.status === 'WARNING'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>
                    Committed: <strong>{b.currency} {b.committedSpend.toFixed(2)}</strong>
                  </span>
                  <span>
                    Headroom: <strong>{b.currency} {b.remainingHeadroom.toFixed(2)}</strong>
                  </span>
                  <span>
                    Ceiling: <strong>{b.currency} {b.budgetCeiling.toFixed(2)}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-[11px] text-slate-400 pt-1">
          <em>Note:</em> Budget ceilings are evaluated independently per procurement request. Unrelated budgets are not combined into a fictional company ceiling.
        </div>
      </div>
    </div>
  );
};
