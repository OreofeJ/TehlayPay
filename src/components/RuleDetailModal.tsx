import React from 'react';
import type { EvaluatedProduct } from '../shared/types.ts';
import { ShieldCheck, ShieldAlert, AlertTriangle, X, CheckCircle, XCircle, HelpCircle, FileText } from 'lucide-react';

interface Props {
  product: EvaluatedProduct | null;
  onClose: () => void;
  onSelectForApproval?: (product: EvaluatedProduct) => void;
  onViewPassport?: (product: EvaluatedProduct) => void;
}

export const RuleDetailModal: React.FC<Props> = ({
  product,
  onClose,
  onSelectForApproval,
  onViewPassport,
}) => {
  if (!product) return null;

  const { evaluation } = product;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {evaluation.overallStatus === 'PASS' && (
              <span className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </span>
            )}
            {evaluation.overallStatus === 'BLOCKED' && (
              <span className="p-1 rounded bg-rose-500/20 text-rose-400">
                <ShieldAlert className="w-5 h-5" />
              </span>
            )}
            {evaluation.overallStatus === 'REVIEW' && (
              <span className="p-1 rounded bg-amber-500/20 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </span>
            )}
            <div>
              <h3 className="font-semibold text-sm">Policy Engine Decision Audit</h3>
              <p className="text-xs text-slate-400">
                Deterministic Server-Side Rule Evaluation Breakdown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Overview Bar */}
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 truncate" title={product.title}>
              {product.title}
            </h4>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{product.merchant}</span>
              <span>&bull;</span>
              <span>SKU: {product.sku}</span>
              <span>&bull;</span>
              <span className="capitalize">{product.condition}</span>
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="text-lg font-black text-slate-900">
              {product.currency || 'USD'} {product.price !== null ? product.price.toFixed(2) : 'N/A'}
            </div>
            <div className={`text-[11px] font-bold ${
              evaluation.overallStatus === 'PASS' ? 'text-emerald-700' :
              evaluation.overallStatus === 'BLOCKED' ? 'text-rose-700' : 'text-amber-700'
            }`}>
              {evaluation.overallStatus}
            </div>
          </div>
        </div>

        {/* Rule Checks Detail Body */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1">
          <div className="text-xs text-slate-500">
            Summary: <span className="font-medium text-slate-700">{evaluation.summary}</span>
          </div>

          <div className="space-y-2.5">
            {evaluation.checks.map((check, idx) => {
              const isPass = check.status === 'PASS';
              const isFail = check.status === 'FAIL';
              const isUnknown = check.status === 'UNKNOWN';

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-xs transition-colors ${
                    isPass
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : isFail
                      ? 'bg-rose-50/50 border-rose-200'
                      : 'bg-amber-50/50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                      {isPass && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {isFail && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                      {isUnknown && <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />}
                      <span>{check.ruleName}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {check.mandatory && (
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          Mandatory
                        </span>
                      )}
                      <span
                        className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                          isPass
                            ? 'bg-emerald-100 text-emerald-800'
                            : isFail
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {check.status}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-600 mt-1 pl-5.5 leading-relaxed">
                    {check.evidence}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded transition cursor-pointer"
            >
              Close
            </button>
            {onViewPassport && (
              <button
                onClick={() => {
                  onClose();
                  onViewPassport(product);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition shadow-2xs cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Decision Passport</span>
              </button>
            )}
          </div>

          {evaluation.overallStatus === 'PASS' && onSelectForApproval && (
            <button
              onClick={() => {
                onClose();
                onSelectForApproval(product);
              }}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition shadow-sm cursor-pointer"
            >
              Proceed to Authoritative Purchase Gate &rarr;
            </button>
          )}

          {evaluation.overallStatus !== 'PASS' && (
            <span className="text-xs text-rose-600 font-medium">
              Item cannot be approved under current policy
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
