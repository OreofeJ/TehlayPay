import React, { useState } from 'react';
import type { EvaluatedProduct, PurchaseRequirements } from '../shared/types.ts';
import {
  Lock,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileCheck,
  KeyRound,
  Ban,
} from 'lucide-react';

interface Props {
  product: EvaluatedProduct;
  policy: PurchaseRequirements;
  onClose: () => void;
  onSuccess: () => void;
  onViewPassport?: (product: EvaluatedProduct, auditId?: string) => void;
}

export const ApprovalModal: React.FC<Props> = ({
  product,
  policy,
  onClose,
  onSuccess,
  onViewPassport,
}) => {
  const [step, setStep] = useState<
    'VERIFY_INTENT' | 'ORDER_READY' | 'CAPTURING' | 'COMPLETED' | 'CREDENTIALS_REQUIRED'
  >('VERIFY_INTENT');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [verificationHash, setVerificationHash] = useState<string | null>(null);
  const [buyerConfirmed, setBuyerConfirmed] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  const qty = policy.quantity && policy.quantity > 0 ? Math.floor(policy.quantity) : 1;
  const lineTotal = product.price !== null && typeof product.price === 'number' ? product.price * qty : null;

  // 1. Create Order on Server (Immediate server-side recheck of policy & bound price)
  const handleLockAndCreateOrder = async () => {
    setLoading(true);
    setErrorMessage(null);

    // Immediate client-side validation against active policy
    if (lineTotal !== null && lineTotal > policy.maxBudget) {
      setErrorMessage(
        qty > 1
          ? `Policy violation: Total price ${policy.currency} ${lineTotal.toFixed(2)} (${policy.currency} ${product.price?.toFixed(2)} x ${qty} units) exceeds maximum allowed budget ${policy.currency} ${policy.maxBudget.toFixed(2)}. Order creation is blocked.`
          : `Policy violation: Price ${policy.currency} ${product.price?.toFixed(2)} exceeds maximum allowed budget ${policy.currency} ${policy.maxBudget.toFixed(2)}. Order creation is blocked.`
      );
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: policy.id,
          activePolicy: policy,
          productId: product.id,
          userApprovedPrice: lineTotal ?? product.price,
          returnUrl: `${window.location.origin}/?paypal_status=approved&product_id=${product.id}`,
          cancelUrl: `${window.location.origin}/?paypal_status=cancelled&product_id=${product.id}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Server rejected order creation.');
      }

      setAuditId(data.auditId);
      setVerificationHash(data.verificationHash);

      if (!data.configured) {
        // Explicit setup state: credentials required, never pretending success
        setSetupMessage(
          data.message ||
            'PayPal Sandbox credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET) are not yet configured on the server.'
        );
        setStep('CREDENTIALS_REQUIRED');
        return;
      }

      setOrderId(data.orderId);
      setApproveUrl(data.approveUrl);
      setStep('ORDER_READY');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during policy lock.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Capture Order on Server (Verifying official PayPal Sandbox response)
  const handleCaptureOrder = async () => {
    if (!orderId || !auditId || !buyerConfirmed) return;

    setLoading(true);
    setStep('CAPTURING');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/checkout/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          auditId,
          userConfirmation: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'PayPal capture failed.');
      }

      setStep('COMPLETED');
      setTimeout(() => {
        onSuccess();
      }, 1600);
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment capture failed.');
      setStep('ORDER_READY');
    } finally {
      setLoading(false);
    }
  };

  // 3. Cancel Order (Safely release order lock and update audit log)
  const handleCancelCheckout = async () => {
    try {
      if (auditId || product.id) {
        await fetch('/api/checkout/cancel-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auditId,
            productId: product.id,
            reason: 'User cancelled before payment authorization.',
          }),
        });
      }
    } catch (err) {
      console.warn('Cancel order notification failed:', err);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-blue-600/30 text-blue-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Authoritative Purchasing Gate</h3>
              <p className="text-xs text-slate-400">
                Server-Bound PayPal Sandbox Procurement
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelCheckout}
            className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
            title="Cancel and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Security Alert: </span>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Policy Compliance Verification Card */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-900 font-semibold text-xs mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Deterministic Server Verification Certificate</span>
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">
              {product.evaluation?.checks?.some((c) => c.ruleName === 'Minimum RAM Specification')
                ? 'Mandatory procurement rules (Budget ceiling, ISO currency match, product condition, and hardware RAM specification) have been evaluated and bound by the server policy engine.'
                : 'Mandatory procurement rules (Budget ceiling, ISO currency match, and product condition) have been evaluated and bound by the server policy engine.'}
            </p>
          </div>

          {/* Bound Product Details */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Selected Item Specification
            </div>
            <h4 className="font-bold text-slate-900 text-sm leading-snug">
              {product.title}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{product.merchant}</span>
              <span>&bull;</span>
              <span>SKU: {product.sku}</span>
              <span>&bull;</span>
              <span className="capitalize">{product.condition}</span>
              {qty > 1 && (
                <>
                  <span>&bull;</span>
                  <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                    Qty: {qty} units
                  </span>
                </>
              )}
              {product.ramGb !== null && product.ramGb !== undefined && (
                <>
                  <span>&bull;</span>
                  <span>{product.ramGb} GB RAM</span>
                </>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">
                  {qty > 1 ? 'Authoritative Bound Total:' : 'Authoritative Bound Price:'}
                </span>
                {qty > 1 && (
                  <span className="text-[11px] text-slate-400">
                    {product.currency} {product.price?.toFixed(2)} &times; {qty} units
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-slate-900">
                {product.currency} {(lineTotal ?? product.price)?.toFixed(2)}
              </div>
            </div>
          </div>

          {/* STEP 1: Verify & Lock Intent */}
          {step === 'VERIFY_INTENT' && (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-slate-500 leading-relaxed">
                By proceeding, the server locks this exact product, price, and policy requirement.
                The browser cannot alter the transaction payload.
              </p>
              <button
                onClick={handleLockAndCreateOrder}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Policy &amp; Binding Order...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Lock Policy &amp; Proceed to PayPal Sandbox</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP: Clear Setup State when PayPal Credentials are not yet configured */}
          {step === 'CREDENTIALS_REQUIRED' && (
            <div className="space-y-4 pt-1">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>PayPal Sandbox Credentials Required</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {setupMessage}
                </p>
                <div className="mt-2 text-[11px] text-amber-700 bg-white/70 p-2.5 rounded border border-amber-200/60 font-mono space-y-1">
                  <div><strong>Required Environment Variables:</strong></div>
                  <div>&bull; PAYPAL_CLIENT_ID</div>
                  <div>&bull; PAYPAL_CLIENT_SECRET</div>
                  <div>&bull; PAYPAL_ENV=sandbox</div>
                </div>
                <p className="text-[11px] text-amber-600 italic">
                  Note: The policy check passed, but live PayPal checkout is paused until credentials are provided. No simulated payment was marked completed.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCancelCheckout}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition text-center cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Order Ready for Buyer Approval (when configured) */}
          {step === 'ORDER_READY' && (
            <div className="space-y-4 pt-1">
              <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">PayPal Order ID:</span>
                  <span className="font-bold text-slate-900">{orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Environment:</span>
                  <span className="text-blue-700 font-bold">PayPal Sandbox</span>
                </div>
                {verificationHash && (
                  <div className="flex justify-between truncate" title={verificationHash}>
                    <span className="text-slate-500">SHA-256 Hash:</span>
                    <span className="text-slate-700 truncate max-w-[200px]">{verificationHash}</span>
                  </div>
                )}
              </div>

              {/* Sandbox popup link */}
              {approveUrl && (
                <a
                  href={approveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Launch PayPal Sandbox Approval Flow</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1 text-slate-800" />
                </a>
              )}

              {/* Explicit Buyer Approval Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={buyerConfirmed}
                  onChange={(e) => setBuyerConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-700 leading-snug">
                  I explicitly confirm buyer approval to spend{' '}
                  <strong>{product.currency} {(lineTotal ?? product.price)?.toFixed(2)}</strong>
                  {qty > 1 ? ` for ${qty} units (${product.currency} ${product.price?.toFixed(2)}/unit)` : ''} from the business account
                  for this compliant item.
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={handleCancelCheckout}
                  disabled={loading}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>

                <button
                  onClick={handleCaptureOrder}
                  disabled={loading || !buyerConfirmed}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Capturing Payment on PayPal Sandbox...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4" />
                      <span>Authorize Capture &amp; Finalize Purchase</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Payment Capture in Progress */}
          {step === 'CAPTURING' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <div className="text-sm font-semibold text-slate-800">
                Verifying PayPal Settlement &amp; Recording Audit Entry...
              </div>
              <p className="text-xs text-slate-400">
                Payment state is not confirmed until verified PayPal sandbox response.
              </p>
            </div>
          )}

          {/* STEP 4: Completed State */}
          {step === 'COMPLETED' && (
            <div className="py-6 text-center space-y-3 text-emerald-700">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div className="text-base font-bold text-slate-900">
                Purchase Captured &amp; Immutably Audited!
              </div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Transaction recorded with verified PayPal order confirmation. Updating audit ledger.
              </p>

              {onViewPassport && (
                <button
                  onClick={() => {
                    onClose();
                    onViewPassport(product, auditId || undefined);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition shadow-2xs cursor-pointer"
                >
                  <FileCheck className="w-4 h-4 text-blue-600" />
                  <span>View Procurement Decision Passport</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
