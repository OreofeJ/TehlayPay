import React, { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
  themeAlpine,
} from 'ag-grid-community';
import type {
  EvaluatedProduct,
  PurchaseRequirements,
  ComparisonRecommendation,
} from '../../shared/types.ts';
import {
  isComputingCategory,
  isConsumableCategory,
  getCategoryDisplayName,
  resolveClassification,
} from '../../shared/categories.ts';
import {
  Scale,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Award,
  Sparkles,
  ArrowUpRight,
  X,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  Info,
  DollarSign,
  Cpu,
} from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

interface Props {
  products: EvaluatedProduct[];
  policy: PurchaseRequirements;
  onClose: () => void;
  onSelectForApproval: (product: EvaluatedProduct) => void;
  onInspectRules: (product: EvaluatedProduct) => void;
}

export const ProductComparisonModal: React.FC<Props> = ({
  products,
  policy,
  onClose,
  onSelectForApproval,
  onInspectRules,
}) => {
  const classification = useMemo(
    () =>
      resolveClassification({
        targetItem: policy.targetItem,
        extractedCategory: policy.category,
        buyerPrompt: policy.originalPrompt || policy.extractedReasoning,
      }),
    [policy]
  );

  const category = classification.category;
  const isComputing = isComputingCategory(category);
  const qty = policy.quantity && policy.quantity > 0 ? policy.quantity : 1;

  // Compute recommendation
  const recommendation = useMemo<ComparisonRecommendation>(() => {
    // Only products priced in the same currency as policy can be evaluated for price ranking
    const compliant = products.filter(
      (p) =>
        p.evaluation.overallStatus === 'PASS' &&
        p.price !== null &&
        p.currency?.toUpperCase() === policy.currency?.toUpperCase()
    );

    const reviewItems = products.filter((p) => p.evaluation.overallStatus === 'REVIEW');
    const blockedItems = products.filter((p) => p.evaluation.overallStatus === 'BLOCKED');

    let lowestPriced: EvaluatedProduct | null = null;
    let bestSpec: EvaluatedProduct | null = null;
    const explanations: Record<string, string> = {};

    if (compliant.length > 0) {
      // 1. Lowest priced compliant
      const sortedByPrice = [...compliant].sort((a, b) => (a.price || 0) - (b.price || 0));
      lowestPriced = sortedByPrice[0];
      explanations[lowestPriced.id] = `Lowest-priced compliant option (${lowestPriced.currency} ${lowestPriced.price?.toFixed(
        2
      )}). Fully satisfies all mandatory policy rules and budget ceiling.`;

      // 2. Best specification match among compliant
      if (isComputing) {
        const sortedBySpec = [...compliant].sort((a, b) => {
          const ramA = a.ramGb || 0;
          const ramB = b.ramGb || 0;
          if (ramB !== ramA) return ramB - ramA;
          const storageA = a.storageGb || 0;
          const storageB = b.storageGb || 0;
          return storageB - storageA;
        });
        bestSpec = sortedBySpec[0];
        if (bestSpec.id !== lowestPriced.id) {
          explanations[bestSpec.id] = `Best specification match among compliant products (${bestSpec.ramGb || 'N/A'} GB RAM). Compliant with budget and condition rules.`;
        }
      } else {
        // If not computing, best spec defaults to lowest priced or first compliant with verified attributes
        bestSpec = compliant[0];
      }
    }

    let summary = '';
    if (compliant.length === 0) {
      summary = 'No product currently satisfies all procurement requirements. Review blocked constraints or missing attributes.';
    } else if (lowestPriced && bestSpec && lowestPriced.id !== bestSpec.id) {
      summary = `Found ${compliant.length} compliant options. "${lowestPriced.title.slice(0, 35)}..." offers the best price (${lowestPriced.currency} ${lowestPriced.price?.toFixed(2)}), while "${bestSpec.title.slice(0, 35)}..." provides higher verified specifications.`;
    } else if (lowestPriced) {
      summary = `Found ${compliant.length} compliant option(s). "${lowestPriced.title.slice(0, 45)}..." is the optimal compliant choice within budget.`;
    }

    return {
      lowestPricedCompliant: lowestPriced,
      bestSpecCompliant: bestSpec,
      reviewProducts: reviewItems,
      blockedProducts: blockedItems,
      summary,
      explanations,
      hasCompliantOptions: compliant.length > 0,
    };
  }, [products, policy, isComputing]);

  // AG Grid column definitions for comparison
  const columnDefs = useMemo<ColDef<EvaluatedProduct>[]>(() => [
    {
      headerName: 'Status',
      field: 'evaluation.overallStatus',
      width: 130,
      pinned: 'left',
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const status = params.data?.evaluation.overallStatus;
        if (status === 'PASS') {
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> PASS
              </span>
            </div>
          );
        }
        if (status === 'BLOCKED') {
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-700" /> BLOCKED
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center h-full">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" /> REVIEW
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Product & Merchant',
      field: 'title',
      minWidth: 260,
      flex: 3,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        const isLowest = recommendation.lowestPricedCompliant?.id === p.id;
        const isBestSpec = recommendation.bestSpecCompliant?.id === p.id && !isLowest;

        return (
          <div className="flex flex-col justify-center h-full py-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-900 text-xs truncate" title={p.title}>
                {p.title}
              </span>
              {isLowest && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                  Best Value
                </span>
              )}
              {isBestSpec && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300 shrink-0">
                  Best Spec
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span className="font-medium text-slate-700">{p.merchant}</span>
              <span>&bull;</span>
              <span className="font-mono text-slate-400">SKU: {p.sku}</span>
            </div>
          </div>
        );
      },
    },
    {
      headerName: 'Unit & Total Price',
      field: 'price',
      width: 165,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        if (p.price === null) {
          return <span className="text-xs text-amber-600 font-semibold italic">Unspecified</span>;
        }
        const lineTotal = p.lineTotal ?? p.price * qty;
        const isWithinBudget = lineTotal <= policy.maxBudget;

        return (
          <div className="flex flex-col justify-center h-full">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900">
                {p.currency} {p.price.toFixed(2)}
              </span>
              {qty > 1 && (
                <span className="text-[11px] text-slate-500">
                  (&times;{qty} = {p.currency} {lineTotal.toFixed(2)})
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold ${
                isWithinBudget ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {isWithinBudget ? 'Within Budget' : 'Exceeds Ceiling'}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Condition',
      field: 'condition',
      width: 120,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const cond = params.value;
        const isAllowed = policy.allowedConditions.includes(cond);
        return (
          <div className="flex items-center h-full text-xs">
            <span
              className={`capitalize px-2 py-0.5 rounded text-[11px] font-medium ${
                isAllowed
                  ? 'bg-slate-100 text-slate-800 border border-slate-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 font-bold'
              }`}
            >
              {cond || 'Unverified'}
            </span>
          </div>
        );
      },
    },
    {
      headerName: isComputing ? 'RAM & Storage' : 'Attributes',
      width: 155,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        if (isComputing) {
          return (
            <div className="flex flex-col justify-center h-full text-xs">
              <span className="font-semibold text-slate-800">
                {p.ramGb !== null ? `${p.ramGb} GB RAM` : 'RAM Unverified'}
              </span>
              <span className="text-[11px] text-slate-500">
                {p.storageGb !== null ? `${p.storageGb} GB Storage` : 'Storage Unverified'}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center h-full text-xs text-slate-600">
            Standard Specifications
          </div>
        );
      },
    },
    {
      headerName: 'Policy Explanation',
      field: 'evaluation.summary',
      minWidth: 260,
      flex: 3,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const summary = params.value;
        const status = params.data?.evaluation.overallStatus;
        return (
          <div className="flex items-center h-full">
            <span
              className={`text-xs line-clamp-2 leading-relaxed ${
                status === 'PASS'
                  ? 'text-emerald-800'
                  : status === 'BLOCKED'
                  ? 'text-rose-800 font-medium'
                  : 'text-amber-800'
              }`}
            >
              {summary}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Action',
      width: 180,
      pinned: 'right',
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        const canBuy = p.evaluation.overallStatus === 'PASS';

        return (
          <div className="flex items-center gap-1.5 h-full">
            <button
              onClick={() => onInspectRules(p)}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer"
              title="Inspect rule details"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                onClose();
                onSelectForApproval(p);
              }}
              disabled={!canBuy}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 transition shadow-2xs ${
                canBuy
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
              title={canBuy ? 'Select for purchasing approval' : 'Product blocked by policy'}
            >
              <span>{canBuy ? 'Select for Purchase' : 'Blocked'}</span>
              {canBuy && <ArrowUpRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        );
      },
    },
  ], [recommendation, isComputing, qty, policy, onInspectRules, onClose, onSelectForApproval]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight text-white">Intelligent Product Comparison</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-blue-400/20 text-blue-300 border border-blue-400/40">
                  AG Grid &bull; Channel3 Inventory
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Transparent multi-product comparison against active procurement requirements. Strict policy guardrails enforced.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TehlayPay Recommendation Section */}
          <div className="bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-white border border-blue-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-sm text-slate-900 tracking-tight">
                  TehlayPay Recommendation
                </h4>
              </div>
              <span className="text-[11px] font-semibold text-blue-800 bg-blue-100/70 px-2.5 py-0.5 rounded-full border border-blue-200">
                Deterministic Policy Criteria
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed mb-4">
              {recommendation.summary}
            </p>

            {/* Recommendation Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* Card 1: Lowest Priced Compliant */}
              {recommendation.lowestPricedCompliant ? (
                <div className="bg-white border-2 border-emerald-300 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                        Lowest-Priced Compliant
                      </span>
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate" title={recommendation.lowestPricedCompliant.title}>
                      {recommendation.lowestPricedCompliant.title}
                    </div>
                    <div className="text-base font-black text-slate-900 mt-1">
                      {recommendation.lowestPricedCompliant.currency} {recommendation.lowestPricedCompliant.price?.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                      {recommendation.explanations[recommendation.lowestPricedCompliant.id]}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onSelectForApproval(recommendation.lowestPricedCompliant!);
                    }}
                    className="mt-3 w-full py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer"
                  >
                    <span>Select for Purchase</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="bg-white/60 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-center items-center text-center">
                  <ShieldAlert className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs font-semibold text-slate-500">No Compliant Product</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Budget or condition violations</span>
                </div>
              )}

              {/* Card 2: Best Specification Match */}
              {recommendation.bestSpecCompliant &&
              recommendation.bestSpecCompliant.id !== recommendation.lowestPricedCompliant?.id ? (
                <div className="bg-white border-2 border-blue-300 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                        Best Spec Match
                      </span>
                      <Sparkles className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate" title={recommendation.bestSpecCompliant.title}>
                      {recommendation.bestSpecCompliant.title}
                    </div>
                    <div className="text-base font-black text-slate-900 mt-1">
                      {recommendation.bestSpecCompliant.currency} {recommendation.bestSpecCompliant.price?.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                      {recommendation.explanations[recommendation.bestSpecCompliant.id]}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onSelectForApproval(recommendation.bestSpecCompliant!);
                    }}
                    className="mt-3 w-full py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer"
                  >
                    <span>Select for Purchase</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="bg-white/60 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-center items-center text-center">
                  <Cpu className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs font-semibold text-slate-500">Spec Leader Coincides</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Lowest priced item also leads specs</span>
                </div>
              )}

              {/* Card 3: Non-Compliant & Review Summary */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                    Excluded &amp; Flagged Items
                  </div>
                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Requires Review:
                      </span>
                      <span className="font-bold text-amber-700">{recommendation.reviewProducts.length} items</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        Blocked by Policy:
                      </span>
                      <span className="font-bold text-rose-700">{recommendation.blockedProducts.length} items</span>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 mt-2 leading-tight">
                  Blocked &amp; Review items are strictly prevented from checkout until rules are amended.
                </div>
              </div>
            </div>
          </div>

          {/* AG Grid Full Side-by-Side Comparison */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Full Product &amp; Specification Comparison Matrix
              </h4>
              <span className="text-xs text-slate-400">
                Comparing {products.length} products against policy ceiling {policy.currency} {policy.maxBudget.toFixed(2)}
              </span>
            </div>

            <div className="w-full h-[360px] rounded-xl shadow-xs border border-slate-200 overflow-hidden bg-white">
              <AgGridReact
                theme={themeAlpine}
                rowData={products}
                columnDefs={columnDefs}
                rowHeight={56}
                headerHeight={42}
                animateRows={true}
                suppressCellFocus={true}
                enableCellTextSelection={true}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Selecting a product routes to the authoritative buyer approval gate. AI never executes payment autonomously.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
