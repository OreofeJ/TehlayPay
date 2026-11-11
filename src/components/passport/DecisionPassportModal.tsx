import React, { useState, useEffect } from 'react';
import type {
  ProcurementPassport,
  EvaluatedProduct,
  PurchaseRequirements,
  AuditRecord,
  PassportVerificationResult,
} from '../../shared/types.ts';
import {
  FileText,
  Printer,
  Download,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  CreditCard,
  Hash,
  Clock,
  Layers,
  Building,
  KeyRound,
  BadgeCheck,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  product: EvaluatedProduct;
  policy: PurchaseRequirements;
  auditRecord?: AuditRecord;
  onClose: () => void;
}

export const DecisionPassportModal: React.FC<Props> = ({
  product,
  policy,
  auditRecord,
  onClose,
}) => {
  const [passport, setPassport] = useState<ProcurementPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<PassportVerificationResult | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPassport = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/passport/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requirementId: policy.id,
            activePolicy: policy,
            productId: product.id,
            product,
            auditId: auditRecord?.id,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to generate passport.');
        }

        const data: ProcurementPassport = await res.json();
        if (isMounted) {
          setPassport(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Error creating passport.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPassport();
    return () => {
      isMounted = false;
    };
  }, [product, policy, auditRecord]);

  const handleVerifyIntegrity = async () => {
    if (!passport) return;
    setVerifying(true);
    try {
      const ref = passport.audit.auditReference || passport.paymentRecord.paypalCaptureId || passport.paymentRecord.paypalOrderId || passport.passportReference;
      const res = await fetch(`/api/passport/verify/${encodeURIComponent(ref)}?hash=${encodeURIComponent(passport.audit.verificationHash || '')}`);
      const data: PassportVerificationResult = await res.json();
      setVerificationResult(data);
    } catch (err: any) {
      setVerificationResult({
        passportReference: passport.passportReference,
        recordExists: false,
        recordMatches: false,
        captureConfirmedByPayPal: false,
        message: 'Network verification failed.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    if (!passport) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(passport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${passport.passportReference}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Top Control Bar (Non-printable) */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight text-white">
                TehlayPay Procurement Decision Passport
              </h3>
              <p className="text-[11px] text-slate-400">
                Official Traceable Purchase Evaluation &amp; Transaction Record
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleVerifyIntegrity}
              disabled={verifying || !passport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700 cursor-pointer disabled:opacity-50"
            >
              {verifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Verify Integrity</span>
            </button>

            <button
              onClick={handleDownloadJson}
              disabled={!passport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700 cursor-pointer disabled:opacity-50"
              title="Export passport JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={!passport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-white/10 ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Verification Alert Banner if active */}
        {verificationResult && (
          <div
            className={`p-3 text-xs border-b flex items-center justify-between print:hidden ${
              verificationResult.recordMatches
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <BadgeCheck
                className={`w-4 h-4 ${
                  verificationResult.recordMatches ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <span>{verificationResult.message}</span>
            </div>
            <button
              onClick={() => setVerificationResult(null)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Passport Printable Document Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white text-slate-900 print:p-0 print:m-0 print:overflow-visible">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm">Assembling verifiable procurement passport...</p>
            </div>
          ) : error || !passport ? (
            <div className="py-12 text-center text-rose-600 space-y-2">
              <AlertTriangle className="w-8 h-8 mx-auto text-rose-500" />
              <p className="text-sm font-semibold">{error || 'Could not load passport data.'}</p>
            </div>
          ) : (
            <div className="space-y-6 font-sans">
              {/* SECTION A: Document Identity Header */}
              <div className="border-b-2 border-slate-900 pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-xs">
                      T
                    </div>
                    <div>
                      <h1 className="text-xl font-black tracking-tight text-slate-950">
                        TEHLAYPAY PROCUREMENT DECISION PASSPORT
                      </h1>
                      <div className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
                        AI-Assisted Policy Governance &bull; PayPal AI Hackathon 2026
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Passport Reference
                  </div>
                  <div className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                    {passport.passportReference}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Generated: {new Date(passport.generatedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  passport.policyEvaluation.overallStatus === 'PASS'
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                    : passport.policyEvaluation.overallStatus === 'BLOCKED'
                    ? 'bg-rose-50/80 border-rose-300 text-rose-950'
                    : 'bg-amber-50/80 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  {passport.policyEvaluation.overallStatus === 'PASS' && (
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  )}
                  {passport.policyEvaluation.overallStatus === 'BLOCKED' && (
                    <ShieldAlert className="w-6 h-6 text-rose-600" />
                  )}
                  {passport.policyEvaluation.overallStatus === 'REVIEW' && (
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  )}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">
                      Authoritative Policy Evaluation Outcome
                    </div>
                    <div className="text-lg font-black tracking-tight">
                      {passport.policyEvaluation.overallStatus === 'PASS'
                        ? 'POLICY COMPLIANT — PASS'
                        : passport.policyEvaluation.overallStatus === 'BLOCKED'
                        ? 'PURCHASE BLOCKED BY POLICY'
                        : 'PURCHASE HELD FOR OWNER REVIEW'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Payment Gateway Status
                  </div>
                  <div className="text-xs font-black text-slate-900 mt-0.5">
                    {passport.paymentRecord.paymentCaptureStatus === 'CAPTURED'
                      ? 'VERIFIED PAYMENT CAPTURED'
                      : passport.paymentRecord.paymentCaptureStatus === 'PENDING'
                      ? 'ORDER CREATED (UNCAPTURED)'
                      : 'NOT CHECKED OUT'}
                  </div>
                </div>
              </div>

              {/* SECTION B & C: Request & Product Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SECTION B: Original Procurement Request */}
                <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
                    B. Original Procurement Request
                  </h3>

                  {passport.request.originalPrompt && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">
                        Original Buyer Prompt (Natural Language)
                      </div>
                      <div className="text-xs italic text-slate-700 bg-white p-2 rounded border border-slate-200 mt-1">
                        "{passport.request.originalPrompt}"
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Target Item</span>
                      <span className="font-bold text-slate-900">{passport.request.targetItem}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Category / Sub</span>
                      <span className="font-bold text-slate-900">
                        {passport.request.category} {passport.request.subcategory ? `(${passport.request.subcategory})` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Budget Ceiling</span>
                      <span className="font-bold text-slate-900">
                        {passport.request.currency} {passport.request.maxBudget.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Requested Quantity</span>
                      <span className="font-bold text-slate-900">{passport.request.quantity} unit(s)</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Permitted Conditions</span>
                      <span className="font-bold text-slate-900 capitalize">
                        {passport.request.allowedConditions.join(', ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Request Reference</span>
                      <span className="font-mono text-[11px] text-slate-600">{passport.requestReference}</span>
                    </div>
                  </div>

                  {Object.keys(passport.request.mandatorySpecs).length > 0 && (
                    <div className="border-t border-slate-200 pt-2 text-xs">
                      <span className="text-[10px] text-slate-400 block font-semibold mb-1">
                        Mandatory Specification Constraints
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(passport.request.mandatorySpecs).map(([k, v]) => (
                          <span
                            key={k}
                            className="bg-slate-200/70 text-slate-800 text-[11px] px-2 py-0.5 rounded font-medium"
                          >
                            {k}: <strong>{String(v)}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION C: Product Information */}
                <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
                    C. Channel3 Product Information
                  </h3>

                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Product Title</div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">{passport.product.title}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Merchant / Retailer</span>
                      <span className="font-bold text-slate-900">{passport.product.merchant}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">SKU Reference</span>
                      <span className="font-mono text-[11px] text-slate-700">{passport.product.sku}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Unit Price</span>
                      <span className="font-bold text-slate-900">
                        {passport.product.currency} {passport.product.price?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Line Total</span>
                      <span className="font-black text-slate-900">
                        {passport.product.currency} {passport.product.lineTotal?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Condition</span>
                      <span className="font-bold text-slate-900 capitalize">{passport.product.condition}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">RAM / Storage</span>
                      <span className="font-bold text-slate-900">
                        {passport.product.ramGb !== null ? `${passport.product.ramGb} GB` : 'N/A'} /{' '}
                        {passport.product.storageGb !== null ? `${passport.product.storageGb} GB` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {passport.product.productUrl && (
                    <div className="border-t border-slate-200 pt-2 text-xs truncate">
                      <span className="text-[10px] text-slate-400 block font-semibold">Catalog URL</span>
                      <span className="font-mono text-[10px] text-blue-600 truncate block">
                        {passport.product.productUrl}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION D: Policy Evaluation Checks Breakdown */}
              <div className="border border-slate-200 rounded-xl p-4.5 space-y-3 bg-white">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2 flex items-center justify-between">
                  <span>D. Deterministic Policy Rules Evaluation</span>
                  <span className="text-[10px] font-normal text-slate-500 lowercase">
                    {passport.policyEvaluation.checks.length} rules checked
                  </span>
                </h3>

                <div className="space-y-2">
                  {passport.policyEvaluation.checks.map((check, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        {check.status === 'PASS' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        )}
                        {check.status === 'FAIL' && (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        {check.status === 'UNKNOWN' && (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{check.ruleName}</span>
                            {check.mandatory && (
                              <span className="text-[9px] font-extrabold uppercase text-slate-400 bg-slate-200 px-1.5 py-0.2 rounded">
                                Mandatory
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 mt-0.5 leading-snug">{check.evidence}</p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${
                          check.status === 'PASS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : check.status === 'FAIL'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {check.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION E: Decision Explanation */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50 space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  E. Procurement Decision Rationale
                </h3>
                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {passport.decisionExplanation}
                </p>
              </div>

              {/* SECTION F & G: Buyer Decision & Payment Record */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SECTION F: Buyer Decision */}
                <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50 space-y-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
                    F. Buyer Authorization
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Approval Status</span>
                      <span className="font-bold text-slate-900">{passport.buyerDecision.status}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Approver Identity</span>
                      <span className="font-bold text-slate-900">
                        {passport.buyerDecision.approver || 'Pending Buyer Review'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Authorization Timestamp</span>
                      <span className="text-slate-700">
                        {passport.buyerDecision.timestamp
                          ? new Date(passport.buyerDecision.timestamp).toLocaleString()
                          : 'Not yet authorized'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Approval Reference</span>
                      <span className="font-mono text-[11px] text-slate-700">
                        {passport.buyerDecision.approvalReference || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTION G: Payment Record */}
                <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50 space-y-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
                    G. PayPal Gateway Transaction Record
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Capture Status</span>
                      <span className="font-bold text-slate-900">
                        {passport.paymentRecord.paymentCaptureStatus}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">PayPal Order ID</span>
                      <span className="font-mono text-[11px] text-slate-700">
                        {passport.paymentRecord.paypalOrderId || 'No order created'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Verified Capture ID</span>
                      <span className="font-mono text-[11px] text-slate-700 font-bold">
                        {passport.paymentRecord.paypalCaptureId || 'Uncaptured'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Captured Amount</span>
                      <span className="font-bold text-slate-900">
                        {passport.paymentRecord.capturedAmount !== undefined
                          ? `${passport.paymentRecord.capturedCurrency} ${passport.paymentRecord.capturedAmount.toFixed(2)}`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 italic mt-1 border-t border-slate-200 pt-1.5">
                    {passport.paymentRecord.notes}
                  </div>
                </div>
              </div>

              {/* SECTION H: Audit & Cryptographic Integrity Seal */}
              <div className="border border-slate-900 rounded-xl p-4.5 bg-slate-950 text-white space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    H. Audit Verification &amp; Tamper-Proof Integrity
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">SHA-256 Checksum</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                      Audit Record Reference
                    </span>
                    <span className="font-mono text-slate-200">
                      {passport.audit.auditReference || 'Pre-transaction evaluation snapshot'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                      Verification Hash
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 break-all select-all">
                      {passport.audit.verificationHash || 'Hash unavailable'}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
                  <span>TehlayPay Deterministic Governance Protocol</span>
                  <span>Issued for audit trail compliance &bull; Non-repudiation copy</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer (Non-printable) */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-500">
            Official TehlayPay Procurement Decision Passport &bull; Immutable record of requirements, evaluations &amp; transactions
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
          >
            Close Passport
          </button>
        </div>
      </div>
    </div>
  );
};
