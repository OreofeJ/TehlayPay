import React, { useState } from 'react';
import type { PurchaseRequirements, ProductCondition } from '../shared/types.ts';
import {
  classifyCategory,
  resolveClassification,
  isComputingCategory,
  isConsumableCategory,
  getCategoryDisplayName,
  extractDisplaySpecs,
} from '../shared/categories.ts';
import {
  Shield,
  DollarSign,
  CheckCircle2,
  Sliders,
  RefreshCw,
  Layers,
  Laptop,
  FileText,
  Sparkles,
  Wrench,
  Armchair,
  Package,
} from 'lucide-react';

interface Props {
  requirements: PurchaseRequirements;
  onUpdatePolicy: (updated: PurchaseRequirements) => void;
  isReevaluating: boolean;
  onOpenSimulator?: () => void;
}

export const PolicySummaryCard: React.FC<Props> = ({
  requirements,
  onUpdatePolicy,
  isReevaluating,
  onOpenSimulator,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [budget, setBudget] = useState(requirements.maxBudget);
  const [quantity, setQuantity] = useState(requirements.quantity || 1);
  const [ram, setRam] = useState(
    requirements.minRamGb && requirements.minRamGb > 0 ? requirements.minRamGb : 0
  );
  const [storage, setStorage] = useState(
    requirements.minStorageGb && requirements.minStorageGb > 0 ? requirements.minStorageGb : 0
  );
  const [conditions, setConditions] = useState<ProductCondition[]>(requirements.allowedConditions);

  React.useEffect(() => {
    setBudget(requirements.maxBudget);
    setQuantity(requirements.quantity || 1);
    setRam(requirements.minRamGb && requirements.minRamGb > 0 ? requirements.minRamGb : 0);
    setStorage(requirements.minStorageGb && requirements.minStorageGb > 0 ? requirements.minStorageGb : 0);
    setConditions(requirements.allowedConditions);
  }, [requirements]);

  const classification = resolveClassification({
    targetItem: requirements.targetItem,
    extractedCategory: requirements.category,
    buyerPrompt: requirements.originalPrompt || requirements.extractedReasoning,
  });
  const category = classification.category;
  const isComputing = isComputingCategory(category);
  const isConsumable = isConsumableCategory(category);
  const displaySpecs = extractDisplaySpecs(requirements);

  const toggleCondition = (c: ProductCondition) => {
    if (isConsumable) return; // Consumables are strictly 'new'
    if (conditions.includes(c)) {
      if (conditions.length > 1) {
        setConditions(conditions.filter((item) => item !== c));
      }
    } else {
      setConditions([...conditions, c]);
    }
  };

  const handleApplyChanges = (e: React.FormEvent) => {
    e.preventDefault();
    const ramVal = isComputing ? Number(ram) : 0;
    const storageVal = isComputing ? Number(storage) : 0;
    const finalConditions = isConsumable ? (['new'] as ProductCondition[]) : conditions;
    const qtyVal = Math.max(1, Math.floor(Number(quantity) || 1));

    onUpdatePolicy({
      ...requirements,
      quantity: qtyVal,
      maxBudget: Number(budget),
      minRamGb: ramVal > 0 ? ramVal : 0,
      minStorageGb: storageVal > 0 ? storageVal : undefined,
      allowedConditions: finalConditions,
      extractedReasoning: isComputing
        ? ramVal > 0
          ? `Owner manual adjustment applied: budget ${requirements.currency} ${budget}, quantity ${qtyVal} unit(s), min RAM ${ramVal}GB, conditions: [${finalConditions.join(', ')}].`
          : `Owner manual adjustment applied: budget ${requirements.currency} ${budget}, quantity ${qtyVal} unit(s), unconstrained RAM, conditions: [${finalConditions.join(', ')}].`
        : `Owner manual adjustment applied: budget ${requirements.currency} ${budget}, quantity ${qtyVal} unit(s), category: ${getCategoryDisplayName(category)}, conditions: [${finalConditions.join(', ')}]. No RAM constraint.`,
    });
    setIsEditing(false);
  };

  const getCategoryIcon = () => {
    switch (category) {
      case 'computing':
        return <Laptop className="w-3.5 h-3.5 text-blue-600" />;
      case 'office_supplies':
      case 'printer_consumables':
        return <FileText className="w-3.5 h-3.5 text-amber-600" />;
      case 'cleaning_supplies':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-600" />;
      case 'tools_hardware':
        return <Wrench className="w-3.5 h-3.5 text-orange-600" />;
      case 'furniture':
        return <Armchair className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <Package className="w-3.5 h-3.5 text-slate-600" />;
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-blue-100 text-blue-700">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">
              Extracted Procurement Policy Rules
            </h3>
            <p className="text-xs text-slate-500">
              Deterministic parameters extracted from owner prompt and locked on server
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSimulator && (
            <button
              onClick={onOpenSimulator}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition shadow-2xs cursor-pointer"
              title="Simulate alternative budgets, conditions, and specifications safely"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Simulate Policy Changes</span>
            </button>
          )}

          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition shadow-xs cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>{isEditing ? 'Cancel Edit' : 'Adjust Rule Constraints'}</span>
          </button>
        </div>
      </div>

      {/* Exactly Three Primary Policy Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Section 1: Max Budget Ceiling */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-medium">Max Budget Ceiling</span>
            </div>
            <div className="text-xl font-bold text-slate-900 tracking-tight">
              {requirements.currency} {requirements.maxBudget.toFixed(2)}
            </div>
            {requirements.quantity && requirements.quantity > 1 && (
              <div className="text-xs text-blue-700 font-semibold mt-1">
                {requirements.currency} {(requirements.maxBudget / requirements.quantity).toFixed(2)} / unit &bull; {requirements.quantity} units requested
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            Strict hard constraint &bull; Server re-verified
          </div>
        </div>

        {/* Section 2: Permitted Condition */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-medium">Permitted Condition</span>
            </div>
            <div className="text-base font-bold text-slate-900 capitalize tracking-tight">
              {isConsumable ? 'New Only' : requirements.allowedConditions.join(', ')}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            {isConsumable
              ? 'Consumables standard (No used/refurbished)'
              : 'Refurbished condition strictly checked'}
          </div>
        </div>

        {/* Section 3: Target Specification (Category-Aware) */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 text-xs text-slate-500 mb-1">
              <div className="flex items-center gap-1.5">
                {getCategoryIcon()}
                <span className="font-medium">Target Specification</span>
              </div>
              <span className="text-[11px] font-bold tracking-tight px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {classification.fullDisplayName}
              </span>
            </div>
            <div
              className="text-sm font-bold text-slate-900 truncate mb-1.5"
              title={requirements.targetItem}
            >
              {requirements.targetItem}
            </div>

            {/* Category-aware specification badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                Qty: {requirements.quantity || 1}
              </span>
              {displaySpecs.length > 0 ? (
                displaySpecs.map((spec, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded font-medium ${
                      spec.isConstrained
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    <span className="text-slate-400 mr-1">{spec.label}:</span>
                    <span>{spec.value}</span>
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                  Standard Category Spec
                </span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            {isComputing
              ? requirements.minRamGb && requirements.minRamGb > 0
                ? 'Missing RAM spec = REVIEW'
                : 'RAM unconstrained for this request'
              : 'Evaluated against vendor catalog metadata'}
          </div>
        </div>
      </div>

      {/* Extraction Reasoning Footer */}
      <div className="mt-3.5 pt-3 border-t border-slate-200/80 flex items-start gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-700 whitespace-nowrap">Extraction Note:</span>
        <span className="italic text-slate-500">{requirements.extractedReasoning}</span>
      </div>

      {/* Interactive Constraint Editor Panel */}
      {isEditing && (
        <form
          onSubmit={handleApplyChanges}
          className="mt-4 pt-4 border-t border-slate-300 space-y-4 bg-white p-4 rounded-lg border"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Live Policy Constraint Simulation
            </h4>
            <span className="text-xs text-slate-400">
              Category: <span className="font-semibold text-slate-700">{getCategoryDisplayName(category)}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Budget Editing */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Max Budget Ceiling ({requirements.currency})
              </label>
              <input
                type="number"
                min="10"
                max="10000"
                step="25"
                value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400">Total allowed budget</span>
            </div>

            {/* Quantity Editing */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Quantity (Units)
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400">Order count multiplier</span>
            </div>

            {/* Condition Editing */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Allowed Product Conditions
              </label>
              {isConsumable ? (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">New Only</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Consumables (paper, cleaning supplies) strictly require new condition.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 mt-1.5">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conditions.includes('new')}
                      onChange={() => toggleCondition('new')}
                      className="rounded text-blue-600"
                    />
                    New
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conditions.includes('refurbished')}
                      onChange={() => toggleCondition('refurbished')}
                      className="rounded text-blue-600"
                    />
                    Refurbished
                  </label>
                </div>
              )}
              <span className="text-[11px] text-slate-400 mt-1 block">
                {isConsumable ? 'Enforced standard' : 'Refurbished requires buyer policy opt-in'}
              </span>
            </div>

            {/* Category-Specific Target Specs Editing */}
            <div>
              {isComputing ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Hardware Target Specification
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <span className="text-[11px] text-slate-500 block mb-0.5">RAM</span>
                      <select
                        value={ram}
                        onChange={(e) => setRam(parseInt(e.target.value, 10))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>Unconstrained</option>
                        <option value={8}>8 GB Min</option>
                        <option value={16}>16 GB Min</option>
                        <option value={32}>32 GB Min</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <span className="text-[11px] text-slate-500 block mb-0.5">Storage</span>
                      <select
                        value={storage}
                        onChange={(e) => setStorage(parseInt(e.target.value, 10))}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>Unconstrained</option>
                        <option value={256}>256 GB</option>
                        <option value={512}>512 GB</option>
                        <option value={1024}>1 TB</option>
                      </select>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 block">
                    Computing specs evaluated deterministically
                  </span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Specification
                  </label>
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                    <span className="font-semibold text-slate-800 capitalize">
                      {requirements.targetItem}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      RAM and storage controls do not apply to {getCategoryDisplayName(category)}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isReevaluating}
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReevaluating ? 'animate-spin' : ''}`} />
              <span>Apply &amp; Re-evaluate Policy Engine</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
