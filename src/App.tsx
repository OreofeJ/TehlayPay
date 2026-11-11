import React, { useState, useEffect, useCallback } from 'react';
import type {
  PurchaseRequirements,
  EvaluatedProduct,
  AuditRecord,
  SystemStatus,
} from './shared/types.ts';
import { Header, type NavigationTab } from './components/Header.tsx';
import { PolicySummaryCard } from './components/PolicySummaryCard.tsx';
import { ProductGrid } from './components/ProductGrid.tsx';
import { RuleDetailModal } from './components/RuleDetailModal.tsx';
import { ApprovalModal } from './components/ApprovalModal.tsx';
import { AuditGrid } from './components/AuditGrid.tsx';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard.tsx';
import { PolicySimulatorModal } from './components/simulator/PolicySimulatorModal.tsx';
import { ProductComparisonModal } from './components/comparison/ProductComparisonModal.tsx';
import { DecisionPassportModal } from './components/passport/DecisionPassportModal.tsx';
import {
  Sparkles,
  Search,
  ShoppingBag,
  History,
  ArrowRight,
  Loader2,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  Globe,
  Database,
  Scale,
  Sliders,
  FileText,
} from 'lucide-react';

const DEFAULT_DEMO_PROMPT =
  'A new laptop for software development, costing no more than USD 800, with at least 16 GB RAM and no refurbished products.';

const PRESETS = [
  {
    label: 'Dev Laptop ($800, 16GB)',
    prompt:
      'A new laptop for software development, costing no more than USD 800, with at least 16 GB RAM and no refurbished products.',
  },
  {
    label: 'Copier Paper (5 packs, $60)',
    prompt: '5 packs of copier paper 8.5x11 20lb under $60',
  },
  {
    label: 'Office Chairs (2 chairs, $400)',
    prompt: '2 ergonomic mesh office chairs under $400',
  },
  {
    label: 'Cordless Drill (18V, $200)',
    prompt: '18V cordless brushless hammer drill kit under $200',
  },
  {
    label: 'Network Switch (24 ports, $250)',
    prompt: '24-port gigabit managed switch under $250',
  },
  {
    label: 'Cleaning Supplies ($150)',
    prompt: 'Commercial disinfectant cleaning supplies under $150',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('procurement');
  const [prompt, setPrompt] = useState(DEFAULT_DEMO_PROMPT);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isRefreshingAudit, setIsRefreshingAudit] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [requirements, setRequirements] = useState<PurchaseRequirements | null>(null);
  const [products, setProducts] = useState<EvaluatedProduct[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);

  // Modals
  const [inspectedProduct, setInspectedProduct] = useState<EvaluatedProduct | null>(null);
  const [approvedProduct, setApprovedProduct] = useState<EvaluatedProduct | null>(null);

  // Phase 3 Intelligence Layer Modals
  const [showSimulator, setShowSimulator] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [passportTarget, setPassportTarget] = useState<{
    product: EvaluatedProduct;
    auditRecord?: AuditRecord;
  } | null>(null);

  // Fetch system status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('Could not fetch server status:', err);
    }
  };

  // Fetch audit records
  const fetchAuditLogs = useCallback(async () => {
    setIsRefreshingAudit(true);
    try {
      const res = await fetch('/api/audit/logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.warn('Could not fetch audit records:', err);
    } finally {
      setIsRefreshingAudit(false);
    }
  }, []);

  const [paypalNotice, setPaypalNotice] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchAuditLogs();

    // Check for PayPal Sandbox redirect parameters
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const paypalStatus = params.get('paypal_status');
      const token = params.get('token');

      if (paypalStatus === 'approved' || token) {
        setPaypalNotice({
          type: 'success',
          message: `PayPal Sandbox approval returned successfully${token ? ` (Order token: ${token})` : ''}. You may now complete server verification.`,
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (paypalStatus === 'cancelled') {
        setPaypalNotice({
          type: 'info',
          message: 'PayPal Sandbox checkout was cancelled by the buyer. No funds were captured.',
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [fetchAuditLogs]);

  // Execute End-to-End Discovery & Policy Evaluation
  const handleRunAgent = async (customPrompt?: string) => {
    const activePrompt = customPrompt || prompt;
    if (!activePrompt.trim()) return;

    setLoadingExtract(true);
    setGeneralError(null);
    setProducts([]);

    try {
      // 1. Extract requirements via Gemini
      const reqRes = await fetch('/api/requirements/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: activePrompt.trim() }),
      });

      if (!reqRes.ok) {
        const errData = await reqRes.json();
        throw new Error(errData.error || 'Gemini requirements extraction failed.');
      }

      const reqData: PurchaseRequirements = await reqRes.json();
      setRequirements(reqData);
      setLoadingExtract(false);

      // 2. Discover products via Channel3 & run deterministic policy engine
      setLoadingProducts(true);
      const prodRes = await fetch('/api/products/search-and-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirementId: reqData.id, activePolicy: reqData }),
      });

      if (!prodRes.ok) {
        const prodErr = await prodRes.json();
        throw new Error(prodErr.error || 'Product evaluation failed.');
      }

      const prodData: EvaluatedProduct[] = await prodRes.json();
      setProducts(prodData);
      fetchAuditLogs();
    } catch (err: any) {
      setGeneralError(err.message || 'Workflow execution error.');
    } finally {
      setLoadingExtract(false);
      setLoadingProducts(false);
    }
  };

  // Live Policy Constraint Re-evaluation (Manual Owner Override)
  const handleUpdatePolicy = async (updated: PurchaseRequirements) => {
    setLoadingProducts(true);
    setGeneralError(null);
    try {
      // Update policy on server
      await fetch('/api/requirements/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      setRequirements(updated);

      // Re-run policy evaluation on current inventory with explicit active policy
      const prodRes = await fetch('/api/products/search-and-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirementId: updated.id, activePolicy: updated }),
      });

      if (!prodRes.ok) {
        const prodErr = await prodRes.json();
        throw new Error(prodErr.error || 'Re-evaluation failed.');
      }

      const prodData: EvaluatedProduct[] = await prodRes.json();
      setProducts(prodData);
      fetchAuditLogs();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to update policy.');
    } finally {
      setLoadingProducts(false);
    }
  };

  // Reset to Hackathon scenario and auto-run
  const handleResetDemo = () => {
    setPrompt(DEFAULT_DEMO_PROMPT);
    handleRunAgent(DEFAULT_DEMO_PROMPT);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      <Header
        status={status}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRunTestScenario={handleResetDemo}
      />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        {/* Error Banner */}
        {generalError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{generalError}</span>
            </div>
            <button
              onClick={() => setGeneralError(null)}
              className="text-rose-600 font-bold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* PayPal Redirect Notice Banner */}
        {paypalNotice && (
          <div
            className={`p-4 rounded-xl flex items-center justify-between text-xs shadow-xs border ${
              paypalNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{paypalNotice.message}</span>
            </div>
            <button
              onClick={() => setPaypalNotice(null)}
              className="font-bold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <AnalyticsDashboard onNavigateToProcurement={() => setActiveTab('procurement')} />
        )}

        {/* Dedicated Audit History Tab */}
        {activeTab === 'audit' && (
          <section className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Authoritative Procurement Audit Ledger
                </h2>
                <p className="text-xs text-slate-500">
                  Tamper-proof record of policy decisions, buyer authorizations, SHA-256 verification hashes, and PayPal Sandbox order states
                </p>
              </div>
            </div>

            <AuditGrid
              records={auditLogs}
              onRefresh={fetchAuditLogs}
              isRefreshing={isRefreshingAudit}
            />
          </section>
        )}

        {/* Procurement Purchasing Studio Tab */}
        {activeTab === 'procurement' && (
          <>
            {/* Phase 1: Procurement Request Studio */}
            <section className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  1. Natural Language Procurement Intent
                </h2>
                <p className="text-xs text-slate-500">
                  Gemini extracts deterministic requirements and explains defaults. Policy engine enforces hard rules.
                </p>
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium">Quick Prompts:</span>
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(p.prompt);
                    handleRunAgent(p.prompt);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition cursor-pointer text-[11px]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunAgent();
            }}
            className="flex flex-col sm:flex-row gap-3 pt-1"
          >
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A new laptop for software development, costing no more than USD 800, with at least 16 GB RAM and no refurbished products."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-slate-50/50"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loadingExtract || loadingProducts}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loadingExtract ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Extracting Policy via Gemini...</span>
                </>
              ) : loadingProducts ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Evaluating Policy Engine...</span>
                </>
              ) : (
                <>
                  <span>Run Purchasing Agent</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Active Policy Rules Breakdown */}
          {requirements && (
            <div className="pt-2">
              <PolicySummaryCard
                requirements={requirements}
                onUpdatePolicy={handleUpdatePolicy}
                isReevaluating={loadingProducts}
                onOpenSimulator={() => setShowSimulator(true)}
              />
            </div>
          )}
        </section>

        {/* Phase 2: Channel3 Product Matrix & AG Grid Policy Evaluation */}
        {products.length > 0 && (
          <section className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    2. Channel3 Candidate Inventory &amp; Compliance Matrix
                  </h2>
                  <p className="text-xs text-slate-500">
                    Deterministic server-side policy evaluates each item against budget ceiling, currency, condition, and target specifications
                  </p>
                </div>
              </div>

              {/* Action Buttons: Compare Products & Simulate Policy & Tally */}
              <div className="flex flex-wrap items-center gap-2.5">
                {requirements && (
                  <>
                    <button
                      onClick={() => setShowComparison(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition shadow-2xs cursor-pointer"
                      title="Compare candidate products side-by-side using AG Grid with transparent recommendation criteria"
                    >
                      <Scale className="w-3.5 h-3.5 text-blue-600" />
                      <span>Compare Products</span>
                    </button>

                    <button
                      onClick={() => setShowSimulator(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition shadow-2xs cursor-pointer"
                      title="Simulate policy modifications in an isolated sandbox"
                    >
                      <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Simulate Policy Changes</span>
                    </button>
                  </>
                )}

                {/* Status Tally Counter */}
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {products.filter((p) => p.evaluation.overallStatus === 'PASS').length} PASS
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                    {products.filter((p) => p.evaluation.overallStatus === 'BLOCKED').length} BLOCKED
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                    {products.filter((p) => p.evaluation.overallStatus === 'REVIEW').length} REVIEW
                  </span>
                </div>
              </div>
            </div>

            {/* Data Source Distinction Banner */}
            {products.some((p) => p.dataSource === 'channel3_live') ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Channel3 Live API Results (HTTP 200 OK):</strong> Showing real-time retailer inventory and merchant pricing from Channel3 search.
                  </span>
                </div>
                <span className="font-mono text-[10px] bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  Live API Active
                </span>
              </div>
            ) : (
              <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg text-xs text-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    <strong>Demo Fixture Fallback:</strong> Showing verified test fixture dataset for hackathon evaluation.
                  </span>
                </div>
                <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  Fixture Fallback
                </span>
              </div>
            )}

            {/* Explanatory Policy Banner */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>Security Enforcement: </strong>
                AI never approves transactions. The <em>Review &amp; Buy</em> action is strictly enabled only for items
                where every mandatory rule is satisfied. Items exceeding the budget ceiling or with disallowed conditions are{' '}
                <strong>BLOCKED</strong>. Items with unverified mandatory attributes are held for <strong>REVIEW</strong>.
              </div>
            </div>

            {/* AG Grid Component */}
            <ProductGrid
              products={products}
              onSelectProduct={(p) => setApprovedProduct(p)}
              onInspectRules={(p) => setInspectedProduct(p)}
              onViewPassport={(p) => setPassportTarget({ product: p })}
            />
          </section>
        )}

        {/* Phase 3: Immutable Audit Ledger (AG Grid) */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                3. Immutable Purchase Decision Audit Table
              </h2>
              <p className="text-xs text-slate-500">
                Tamper-proof record of policy decisions, buyer authorizations, SHA-256 verification hashes, and PayPal Sandbox order states
              </p>
            </div>
          </div>

          <AuditGrid
            records={auditLogs}
            onRefresh={fetchAuditLogs}
            isRefreshing={isRefreshingAudit}
            onViewPassportRecord={(rec) => {
              const existing = products.find((p) => p.id === rec.productId);
              if (existing) {
                setPassportTarget({ product: existing, auditRecord: rec });
              } else {
                const surrogate: EvaluatedProduct = {
                  id: rec.productId,
                  title: rec.productTitle,
                  merchant: 'Authorized Retailer',
                  price: rec.unitPrice || rec.amount,
                  currency: rec.currency,
                  condition: 'new',
                  ramGb: null,
                  storageGb: null,
                  productUrl: '#',
                  sku: rec.productId.slice(0, 10),
                  availability: 'IN_STOCK',
                  quantity: rec.quantity || 1,
                  lineTotal: rec.amount,
                  evaluation: {
                    productId: rec.productId,
                    overallStatus: rec.policyStatus,
                    summary: rec.notes || 'Recorded audit decision',
                    checks: [],
                    evaluatedAt: rec.timestamp,
                  },
                };
                setPassportTarget({ product: surrogate, auditRecord: rec });
              }
            }}
          />
        </section>
      </>
    )}
  </main>

      {/* Rule Inspection Deep Dive Modal */}
      {inspectedProduct && (
        <RuleDetailModal
          product={inspectedProduct}
          onClose={() => setInspectedProduct(null)}
          onSelectForApproval={(p) => setApprovedProduct(p)}
          onViewPassport={(p) => setPassportTarget({ product: p })}
        />
      )}

      {/* Authoritative Purchasing Gate (Approval & PayPal Sandbox Modal) */}
      {approvedProduct && requirements && (
        <ApprovalModal
          product={approvedProduct}
          policy={requirements}
          onClose={() => setApprovedProduct(null)}
          onSuccess={() => {
            setApprovedProduct(null);
            fetchAuditLogs();
          }}
          onViewPassport={(p, auditId) => {
            const matched = auditId ? auditLogs.find((r) => r.id === auditId) : undefined;
            setPassportTarget({ product: p, auditRecord: matched });
          }}
        />
      )}

      {/* Feature 1: Policy What-If Simulator */}
      {showSimulator && requirements && (
        <PolicySimulatorModal
          requirements={requirements}
          products={products}
          onClose={() => setShowSimulator(false)}
          onApplyPolicy={(updated) => {
            setShowSimulator(false);
            handleUpdatePolicy(updated);
          }}
        />
      )}

      {/* Feature 2: Intelligent Product Comparison */}
      {showComparison && requirements && (
        <ProductComparisonModal
          products={products}
          policy={requirements}
          onClose={() => setShowComparison(false)}
          onSelectForApproval={(p) => setApprovedProduct(p)}
          onInspectRules={(p) => setInspectedProduct(p)}
        />
      )}

      {/* Feature 3: Procurement Decision Passport */}
      {passportTarget && requirements && (
        <DecisionPassportModal
          product={passportTarget.product}
          policy={requirements}
          auditRecord={passportTarget.auditRecord}
          onClose={() => setPassportTarget(null)}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400">
        TehlayPay &bull; Built for PayPal AI Hackathon &bull; Deterministic Policy Guardrails &amp; PayPal Sandbox Gateway
      </footer>
    </div>
  );
}
