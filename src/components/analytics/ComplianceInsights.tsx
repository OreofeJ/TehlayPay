import React from 'react';
import type { AnalyticsOverview } from '../../shared/types.ts';
import {
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  AlertOctagon,
  FileSearch,
  CheckCircle2,
  Tag,
} from 'lucide-react';

interface Props {
  insights: AnalyticsOverview['complianceInsights'];
  totalEvaluations: number;
}

export const ComplianceInsights: React.FC<Props> = ({ insights, totalEvaluations }) => {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <FileSearch className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Procurement Policy Insights</h3>
            <p className="text-xs text-slate-500">
              Explainable compliance intelligence derived from deterministic rule evaluation and supplier catalog attributes
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
          Sample: {totalEvaluations} evaluated candidate item(s)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Column 1: Most Frequently Violated Rules */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Top Policy Violations (Hard Blockers)</span>
          </div>

          {insights.topBlockingRules.length === 0 ? (
            <div className="p-4 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 text-center">
              No policy rule violations recorded in this period.
            </div>
          ) : (
            <div className="space-y-2">
              {insights.topBlockingRules.map((rule, idx) => (
                <div
                  key={rule.ruleName}
                  className="p-3 rounded-xl border border-rose-100 bg-rose-50/30 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      {idx + 1}. {rule.ruleName}
                    </span>
                    <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                      {rule.violationCount} {rule.violationCount === 1 ? 'hit' : 'hits'}
                    </span>
                  </div>
                  {rule.sampleEvidence.length > 0 && (
                    <div className="text-[11px] text-slate-600 bg-white/70 p-2 rounded border border-rose-100 font-mono">
                      &ldquo;{rule.sampleEvidence[0]}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Most Common Reasons for REVIEW */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <span>Top Review Triggers (Ambiguity / Missing Specs)</span>
          </div>

          {insights.topReviewReasons.length === 0 ? (
            <div className="p-4 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 text-center">
              No items held for review in this period.
            </div>
          ) : (
            <div className="space-y-2">
              {insights.topReviewReasons.map((rev, idx) => (
                <div
                  key={rev.reason}
                  className="p-3 rounded-xl border border-amber-100 bg-amber-50/30 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      {idx + 1}. {rev.reason}
                    </span>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      {rev.count} {rev.count === 1 ? 'case' : 'cases'}
                    </span>
                  </div>
                  {rev.sampleEvidence.length > 0 && (
                    <div className="text-[11px] text-slate-600 bg-white/70 p-2 rounded border border-amber-100 font-mono">
                      &ldquo;{rev.sampleEvidence[0]}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 3: Category Compliance Observations & Missing Supplier Attributes */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-800">
            <Tag className="w-4 h-4 text-indigo-600" />
            <span>Category Performance &amp; Data Gaps</span>
          </div>

          <div className="space-y-2.5">
            {/* Category with Highest Blocked Rate */}
            {insights.categoryWithHighestBlockedRate ? (
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-rose-700 tracking-wider">
                  Highest Blocked Rate Domain
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {insights.categoryWithHighestBlockedRate.categoryName}
                  </span>
                  <span className="font-mono font-bold text-rose-700">
                    {insights.categoryWithHighestBlockedRate.blockedRate}% blocked
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Sample size: {insights.categoryWithHighestBlockedRate.sampleSize} candidate listings
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                Insufficient category history for blocked domain trends (minimum sample size: 2).
              </div>
            )}

            {/* Category with Highest Pass Rate */}
            {insights.categoryWithHighestPassRate && (
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">
                  Highest Compliance Domain
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {insights.categoryWithHighestPassRate.categoryName}
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    {insights.categoryWithHighestPassRate.passRate}% pass
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Sample size: {insights.categoryWithHighestPassRate.sampleSize} candidate listings
                </div>
              </div>
            )}

            {/* Frequent Missing Attributes */}
            {insights.frequentMissingAttributes.length > 0 && (
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">
                  Most Frequently Omitted Listing Specs
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {insights.frequentMissingAttributes.map((attr) => (
                    <span
                      key={attr.attribute}
                      className="px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700 text-[11px] font-medium"
                    >
                      {attr.attribute} ({attr.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
