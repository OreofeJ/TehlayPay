import React, { useState, useMemo } from 'react';
import type {
  PurchaseRequirements,
  EvaluatedProduct,
  ProductCondition,
  OverallPolicyDecision,
  SimulatedOutcome,
} from '../../shared/types.ts';
import {
  isComputingCategory,
  isConsumableCategory,
  getCategoryDisplayName,
  resolveClassification,
} from '../../shared/categories.ts';
import { evaluateProductPolicy } from '../../policyEngine/policyEngine.ts';
import {
  Sliders,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  X,
  RotateCcw,
  Sparkles,
  Info,
  Laptop,
  FileText,
  Wrench,
  Armchair,
  Package,
  Layers,
} from 'lucide-react';

interface Props {
  requirements: PurchaseRequirements;
  products: EvaluatedProduct[];
  onClose: () => void;
  onApplyPolicy: (updated: PurchaseRequirements) => void;
}

export const PolicySimulatorModal: React.FC<Props> = ({
  requirements,
  products,
  onClose,
  onApplyPolicy,
}) => {
  // Classification
  const classification = useMemo(
    () =>
      resolveClassification({
        targetItem: requirements.targetItem,
        extractedCategory: requirements.category,
        buyerPrompt: requirements.originalPrompt || requirements.extractedReasoning,
      }),
    [requirements]
  );

  const category = classification.category;
  const isComputing = isComputingCategory(category);
  const isConsumable = isConsumableCategory(category);

  // Isolated simulation state
  const [simBudget, setSimBudget] = useState<number>(requirements.maxBudget);
  const [simQuantity, setSimQuantity] = useState<number>(requirements.quantity || 1);
  const [simConditions, setSimConditions] = useState<ProductCondition[]>(
    isConsumable ? ['new'] : [...requirements.allowedConditions]
  );

  // Computing specs
  const [simRam, setSimRam] = useState<number>(requirements.minRamGb || 0);
  const [simStorage, setSimStorage] = useState<number>(requirements.minStorageGb || 0);

  // Category specific specs
  const [specSize, setSpecSize] = useState<string>(
    String(requirements.criticalSpecs?.size || requirements.targetSpecs?.size || '')
  );
  const [specWeight, setSpecWeight] = useState<string>(
    String(requirements.criticalSpecs?.gsm || requirements.targetSpecs?.gsm || '')
  );
  const [specVoltage, setSpecVoltage] = useState<string>(
    String(requirements.criticalSpecs?.voltage || requirements.targetSpecs?.voltage || '')
  );
  const [specKeyword, setSpecKeyword] = useState<string>('');

  const [confirmApply, setConfirmApply] = useState(false);

  // Build the simulated policy object (pure isolated copy)
  const simulatedPolicy = useMemo<PurchaseRequirements>(() => {
    const qty = Math.max(1, Math.floor(simQuantity || 1));
    const effectiveConditions: ProductCondition[] = isConsumable
      ? ['new']
      : simConditions.length > 0
      ? simConditions
      : ['new'];

    const criticalSpecs: Record<string, string | number> = {
      ...(requirements.criticalSpecs || {}),
    };

    if (category === 'office_supplies' || category === 'printer_consumables') {
      if (specSize.trim()) criticalSpecs.size = specSize.trim();
      if (specWeight.trim()) criticalSpecs.gsm = specWeight.trim();
    } else if (category === 'tools_hardware') {
      if (specVoltage.trim()) criticalSpecs.voltage = specVoltage.trim();
    }

    if (specKeyword.trim()) {
      criticalSpecs.custom = specKeyword.trim();
    }

    return {
      ...requirements,
      maxBudget: Number(simBudget) || requirements.maxBudget,
      quantity: qty,
      allowedConditions: effectiveConditions,
      minRamGb: isComputing ? (Number(simRam) > 0 ? Number(simRam) : undefined) : undefined,
      minStorageGb: isComputing ? (Number(simStorage) > 0 ? Number(simStorage) : undefined) : undefined,
      criticalSpecs: Object.keys(criticalSpecs).length > 0 ? criticalSpecs : undefined,
      extractedReasoning: `Simulated policy scenario: budget ${requirements.currency} ${simBudget}, conditions [${effectiveConditions.join(', ')}]`,
    };
  }, [
    requirements,
    simBudget,
    simQuantity,
    simConditions,
    simRam,
    simStorage,
    specSize,
    specWeight,
    specVoltage,
    specKeyword,
    category,
    isComputing,
    isConsumable,
  ]);

  // Compute simulated outcomes for all candidate products
  const simulatedOutcomes = useMemo<SimulatedOutcome[]>(() => {
    return products.map((product) => {
      const originalEvaluation = product.evaluation;
      const originalStatus = originalEvaluation.overallStatus;
      const simulatedEvaluation = evaluateProductPolicy(product, simulatedPolicy);
      const simulatedStatus = simulatedEvaluation.overallStatus;

      let delta: 'IMPROVED' | 'WORSENED' | 'UNCHANGED' = 'UNCHANGED';
      if (originalStatus === simulatedStatus) {
        delta = 'UNCHANGED';
      } else if (
        (originalStatus === 'BLOCKED' && (simulatedStatus === 'REVIEW' || simulatedStatus === 'PASS')) ||
        (originalStatus === 'REVIEW' && simulatedStatus === 'PASS')
      ) {
        delta = 'IMPROVED';
      } else {
        delta = 'WORSENED';
      }

      // Generate explainable rationale for change
      let explanation = '';
      if (delta === 'UNCHANGED') {
        if (simulatedStatus === 'PASS') {
          explanation = 'Product continues to satisfy all evaluated procurement rules.';
        } else if (simulatedStatus === 'BLOCKED') {
          const fails = simulatedEvaluation.checks.filter((c) => c.status === 'FAIL');
          explanation = `Remains blocked: ${fails.map((f) => f.ruleName).join(', ')} still violated.`;
        } else {
          explanation = 'Remains held for review due to missing attribute evidence in listing.';
        }
      } else if (delta === 'IMPROVED') {
        if (originalStatus === 'BLOCKED' && simulatedStatus === 'PASS') {
          explanation = `Simulated adjustments resolved previous blocking violations (${originalEvaluation.checks
            .filter((c) => c.status === 'FAIL')
            .map((c) => c.ruleName)
            .join(', ')}). Product now fully passes.`;
        } else if (originalStatus === 'BLOCKED' && simulatedStatus === 'REVIEW') {
          explanation = 'Hard constraint resolved, but listing still lacks evidence for mandatory specs.';
        } else {
          explanation = 'Simulated parameters satisfied previously unverified requirements.';
        }
      } else {
        // Worsened
        const newFails = simulatedEvaluation.checks.filter((c) => c.status === 'FAIL');
        explanation = `Stricter simulated constraints triggered new violation(s): ${newFails
          .map((f) => f.ruleName)
          .join(', ')}.`;
      }

      return {
        product,
        originalStatus,
        simulatedStatus,
        delta,
        originalEvaluation,
        simulatedEvaluation,
        explanation,
      };
    });
  }, [products, simulatedPolicy]);

  // Aggregate metrics
  const originalPassCount = products.filter((p) => p.evaluation.overallStatus === 'PASS').length;
  const simulatedPassCount = simulatedOutcomes.filter((o) => o.simulatedStatus === 'PASS').length;
  const improvedCount = simulatedOutcomes.filter((o) => o.delta === 'IMPROVED').length;
  const worsenedCount = simulatedOutcomes.filter((o) => o.delta === 'WORSENED').length;

  const toggleCondition = (c: ProductCondition) => {
    if (isConsumable) return;
    if (simConditions.includes(c)) {
      if (simConditions.length > 1) {
        setSimConditions(simConditions.filter((item) => item !== c));
      }
    } else {
      setSimConditions([...simConditions, c]);
    }
  };

  const handleResetToActive = () => {
    setSimBudget(requirements.maxBudget);
    setSimQuantity(requirements.quantity || 1);
    setSimConditions(isConsumable ? ['new'] : [...requirements.allowedConditions]);
    setSimRam(requirements.minRamGb || 0);
    setSimStorage(requirements.minStorageGb || 0);
    setSpecSize(String(requirements.criticalSpecs?.size || ''));
    setSpecWeight(String(requirements.criticalSpecs?.gsm || ''));
    setSpecVoltage(String(requirements.criticalSpecs?.voltage || ''));
    setSpecKeyword('');
  };

  const handleCommitApply = () => {
    onApplyPolicy(simulatedPolicy);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header with explicit SIMULATED indicator */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight text-white">Policy What-If Simulator</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  SIMULATED — Not an Active Policy Decision
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Explore hypothetical policy modifications deterministically without modifying active policy or triggering checkout.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-white/10 cursor-pointer"
            title="Discard and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Info Banner & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-950">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Pure Deterministic Sandbox:</strong> Changes made here evaluate against candidate products using the exact same server policy engine rules.
              </span>
            </div>
            <button
              onClick={handleResetToActive}
              className="flex items-center gap-1.5 px-3 py-1 font-semibold text-indigo-700 bg-white hover:bg-indigo-100/80 border border-indigo-200 rounded-lg transition shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Active Rules
            </button>
          </div>

          {/* Simulation Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-slate-50 border border-slate-200 rounded-xl p-5">
            {/* 1. Budget & Quantity */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Simulated Budget &amp; Units
              </label>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Budget Ceiling ({requirements.currency})
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
                    {requirements.currency}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    value={simBudget}
                    onChange={(e) => setSimBudget(Math.max(1, Number(e.target.value)))}
                    className="w-full pl-12 pr-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                  <span>Active: {requirements.currency} {requirements.maxBudget.toFixed(2)}</span>
                  {simBudget !== requirements.maxBudget && (
                    <span className={simBudget > requirements.maxBudget ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                      {simBudget > requirements.maxBudget ? `+${(simBudget - requirements.maxBudget).toFixed(0)}` : `${(simBudget - requirements.maxBudget).toFixed(0)}`}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Procurement Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={simQuantity}
                  onChange={(e) => setSimQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 2. Permitted Conditions (with consumable protection) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Permitted Conditions
                </label>
                {isConsumable && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Consumable Locked
                  </span>
                )}
              </div>

              {isConsumable ? (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                    Strict Consumable Safeguard
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Paper, toner, and cleaning consumables must remain <strong>New-only</strong>. The simulator strictly prohibits refurbished or used consumable procurement.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(['new', 'refurbished', 'used'] as ProductCondition[]).map((cond) => {
                    const isChecked = simConditions.includes(cond);
                    return (
                      <label
                        key={cond}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-indigo-50/60 border-indigo-300 text-indigo-950 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="capitalize">{cond}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCondition(cond)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Category-Specific Specifications */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Category Specifications ({getCategoryDisplayName(category)})
              </label>

              {isComputing ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Min RAM Requirement
                    </label>
                    <select
                      value={simRam}
                      onChange={(e) => setSimRam(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value={0}>Unconstrained (Any RAM)</option>
                      <option value={8}>8 GB RAM</option>
                      <option value={16}>16 GB RAM</option>
                      <option value={32}>32 GB RAM</option>
                      <option value={64}>64 GB RAM</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Min Storage Requirement
                    </label>
                    <select
                      value={simStorage}
                      onChange={(e) => setSimStorage(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value={0}>Unconstrained (Any Storage)</option>
                      <option value={256}>256 GB SSD</option>
                      <option value={512}>512 GB SSD</option>
                      <option value={1000}>1 TB SSD</option>
                    </select>
                  </div>
                </div>
              ) : category === 'office_supplies' || category === 'printer_consumables' ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Target Paper Size
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 8.5x11, Letter, A4"
                      value={specSize}
                      onChange={(e) => setSpecSize(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Paper Weight / GSM
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 20lb, 75gsm, 24lb"
                      value={specWeight}
                      onChange={(e) => setSpecWeight(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : category === 'tools_hardware' ? (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Operating Voltage
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 18V, 20V Max, 12V"
                    value={specVoltage}
                    onChange={(e) => setSpecVoltage(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Mandatory Spec Keyword
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ergonomic, mesh, commercial"
                    value={specKeyword}
                    onChange={(e) => setSpecKeyword(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Impact Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Candidate Products
              </div>
              <div className="text-xl font-black text-slate-900 mt-1">{products.length}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Evaluated in parallel</div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Compliant Eligible
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-black text-indigo-700">{simulatedPassCount}</span>
                <span className="text-xs text-slate-400 font-medium">was {originalPassCount}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {simulatedPassCount > originalPassCount
                  ? `+${simulatedPassCount - originalPassCount} new compliant`
                  : simulatedPassCount < originalPassCount
                  ? `${simulatedPassCount - originalPassCount} fewer compliant`
                  : 'No net change'}
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Improved Items
              </div>
              <div className="text-xl font-black text-emerald-900 mt-1">{improvedCount}</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Gained eligibility</div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-slate-400" />
                Worsened Items
              </div>
              <div className="text-xl font-black text-slate-900 mt-1">{worsenedCount}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Restricted further</div>
            </div>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Side-by-Side Product Eligibility Breakdown
            </h4>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Product &amp; Merchant</th>
                    <th className="py-3 px-3 text-right">Price</th>
                    <th className="py-3 px-3 text-center">Active Policy</th>
                    <th className="py-3 px-3 text-center">Simulated Policy</th>
                    <th className="py-3 px-3 text-center">Delta</th>
                    <th className="py-3 px-4">Simulation Rationale &amp; Rule Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {simulatedOutcomes.map((outcome) => {
                    const p = outcome.product;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-slate-900 truncate" title={p.title}>
                            {p.title}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{p.merchant}</span>
                            <span>&bull;</span>
                            <span className="capitalize">{p.condition}</span>
                            {p.ramGb !== null && (
                              <>
                                <span>&bull;</span>
                                <span>{p.ramGb} GB RAM</span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {p.currency} {p.price?.toFixed(2) || 'N/A'}
                          </div>
                          {outcome.product.quantity && outcome.product.quantity > 1 && (
                            <div className="text-[10px] text-slate-400">
                              Total: {p.currency} {(p.price ? p.price * outcome.product.quantity : 0).toFixed(2)}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              outcome.originalStatus === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : outcome.originalStatus === 'BLOCKED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {outcome.originalStatus}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              outcome.simulatedStatus === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : outcome.simulatedStatus === 'BLOCKED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {outcome.simulatedStatus}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {outcome.delta === 'IMPROVED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <TrendingUp className="w-3.5 h-3.5" /> Improved
                            </span>
                          ) : outcome.delta === 'WORSENED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              <TrendingDown className="w-3.5 h-3.5" /> Worsened
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                              <Minus className="w-3 h-3 text-slate-400" /> Unchanged
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600 leading-relaxed">
                          {outcome.explanation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Simulating against current Channel3 inventory. Zero checkout or audit consequences.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
            >
              Discard Simulation
            </button>

            {!confirmApply ? (
              <button
                onClick={() => setConfirmApply(true)}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <span>Apply Proposed Policy</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-2 p-1 bg-amber-50 border border-amber-300 rounded-xl px-3">
                <span className="text-xs text-amber-900 font-semibold">Confirm update active policy?</span>
                <button
                  onClick={handleCommitApply}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-2xs cursor-pointer"
                >
                  Yes, Update Policy
                </button>
                <button
                  onClick={() => setConfirmApply(false)}
                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
