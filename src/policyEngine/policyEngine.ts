import type {
  PurchaseRequirements,
  NormalizedProduct,
  PolicyEvaluationResult,
  RuleCheckResult,
  OverallPolicyDecision,
} from '../shared/types.ts';
import {
  isConsumableCategory,
  resolveClassification,
  getCategoryDisplayName,
} from '../shared/categories.ts';

/**
 * Deterministic TehlayPay Policy Engine
 *
 * Strict Security Rules:
 * 1. AI never authoritatively approves spending.
 * 2. Missing or ambiguous information about a mandatory constraint results in REVIEW, not PASS.
 * 3. Any hard violation of a policy constraint results in BLOCKED (takes precedence over REVIEW).
 * 4. Pure function with zero external network or AI dependencies.
 */
export function evaluateProductPolicy(
  product: NormalizedProduct,
  policy: PurchaseRequirements
): PolicyEvaluationResult {
  const checks: RuleCheckResult[] = [];

  // ----------------------------------------------------
  // 0. Fail-Closed Validation of Policy Parameters
  // ----------------------------------------------------
  const hasValidPolicyBudget =
    typeof policy?.maxBudget === 'number' &&
    !Number.isNaN(policy.maxBudget) &&
    policy.maxBudget > 0;

  const hasValidPolicyCurrency =
    Boolean(policy?.currency && typeof policy.currency === 'string' && policy.currency.trim().length > 0);

  const hasValidPolicyConditions =
    Array.isArray(policy?.allowedConditions) && policy.allowedConditions.length > 0;

  // ----------------------------------------------------
  // 1. Mandatory Check: Currency Verification
  // ----------------------------------------------------
  const rawCurrency = product.currency ? product.currency.trim() : null;
  if (!hasValidPolicyCurrency) {
    checks.push({
      ruleName: 'Currency Verification',
      status: 'FAIL',
      mandatory: true,
      evidence: 'Procurement policy is missing a valid ISO currency requirement. Evaluation failed closed.',
    });
  } else if (!rawCurrency) {
    checks.push({
      ruleName: 'Currency Verification',
      status: 'UNKNOWN',
      mandatory: true,
      evidence: 'Product currency attribute is missing or unspecified in listing metadata.',
    });
  } else if (rawCurrency.toUpperCase() !== policy.currency.toUpperCase()) {
    checks.push({
      ruleName: 'Currency Verification',
      status: 'FAIL',
      mandatory: true,
      evidence: `Currency mismatch: listing is priced in "${rawCurrency.toUpperCase()}", but policy requires "${policy.currency.toUpperCase()}".`,
    });
  } else {
    checks.push({
      ruleName: 'Currency Verification',
      status: 'PASS',
      mandatory: true,
      evidence: `Currency verified: listing currency "${rawCurrency.toUpperCase()}" matches policy "${policy.currency.toUpperCase()}".`,
    });
  }

  // ----------------------------------------------------
  // 1.5 Optional/Mandatory Check: Quantity Verification
  // ----------------------------------------------------
  const rawQuantity = policy?.quantity;
  const hasQuantitySpecified = rawQuantity !== undefined && rawQuantity !== null;
  const isQuantityValid =
    !hasQuantitySpecified ||
    (typeof rawQuantity === 'number' &&
      !Number.isNaN(rawQuantity) &&
      Number.isInteger(rawQuantity) &&
      rawQuantity > 0);

  const effectiveQuantity = hasQuantitySpecified && isQuantityValid ? rawQuantity : 1;

  if (hasQuantitySpecified && !isQuantityValid) {
    checks.push({
      ruleName: 'Quantity Verification',
      status: 'FAIL',
      mandatory: true,
      evidence: `Procurement policy specifies an invalid or non-positive quantity (${rawQuantity}). Quantity must be a positive integer.`,
    });
  }

  // ----------------------------------------------------
  // 2. Mandatory Check: Maximum Budget Limit (Quantity-Aware)
  // ----------------------------------------------------
  const rawPrice = product.price;
  const policyCurrency = hasValidPolicyCurrency ? policy.currency.toUpperCase() : 'USD';
  const lineTotal =
    rawPrice !== null && rawPrice !== undefined && typeof rawPrice === 'number' && !Number.isNaN(rawPrice)
      ? rawPrice * effectiveQuantity
      : null;

  if (!hasValidPolicyBudget) {
    checks.push({
      ruleName: 'Maximum Budget Limit',
      status: 'FAIL',
      mandatory: true,
      evidence: 'Procurement policy maximum budget ceiling is missing, non-positive, or invalid. Evaluation failed closed.',
    });
  } else if (rawPrice === null || rawPrice === undefined || typeof rawPrice !== 'number' || Number.isNaN(rawPrice) || lineTotal === null) {
    checks.push({
      ruleName: 'Maximum Budget Limit',
      status: 'UNKNOWN',
      mandatory: true,
      evidence: 'Price is missing, null, or invalid in product metadata.',
    });
  } else if (!isQuantityValid) {
    checks.push({
      ruleName: 'Maximum Budget Limit',
      status: 'FAIL',
      mandatory: true,
      evidence: `Cannot calculate line total due to invalid quantity (${rawQuantity}). Order evaluation failed closed.`,
    });
  } else if (lineTotal > policy.maxBudget) {
    checks.push({
      ruleName: 'Maximum Budget Limit',
      status: 'FAIL',
      mandatory: true,
      evidence:
        effectiveQuantity > 1
          ? `Order line total exceeds budget ceiling: ${policyCurrency} ${lineTotal.toFixed(2)} (${policyCurrency} ${rawPrice.toFixed(2)} x ${effectiveQuantity} units) > allowed budget of ${policyCurrency} ${policy.maxBudget.toFixed(2)}.`
          : `Price exceeds ceiling: ${policyCurrency} ${rawPrice.toFixed(2)} > allowed budget of ${policyCurrency} ${policy.maxBudget.toFixed(2)}.`,
    });
  } else {
    checks.push({
      ruleName: 'Maximum Budget Limit',
      status: 'PASS',
      mandatory: true,
      evidence:
        effectiveQuantity > 1
          ? `Order line total compliant: ${policyCurrency} ${lineTotal.toFixed(2)} (${policyCurrency} ${rawPrice.toFixed(2)} x ${effectiveQuantity} units) <= allowed budget of ${policyCurrency} ${policy.maxBudget.toFixed(2)}.`
          : `Price compliant: ${policyCurrency} ${rawPrice.toFixed(2)} <= allowed budget of ${policyCurrency} ${policy.maxBudget.toFixed(2)}.`,
    });
  }

  // ----------------------------------------------------
  // 3. Mandatory Check: Product Condition
  // ----------------------------------------------------
  const rawCondition = product.condition ? product.condition.trim().toLowerCase() : null;

  // Authoritative consumable detection across policy category, target item, and product title
  const isConsumable =
    isConsumableCategory(policy?.category) ||
    isConsumableCategory(policy?.targetItem) ||
    isConsumableCategory(product.title);

  // For consumables (paper, toner, cleaning supplies), strictly enforce 'new' condition,
  // regardless of client-supplied allowedConditions.
  const effectiveAllowedConditions = isConsumable
    ? ['new']
    : (policy?.allowedConditions || []).map((c) => c.toLowerCase());

  if (!hasValidPolicyConditions && !isConsumable) {
    checks.push({
      ruleName: 'Product Condition',
      status: 'FAIL',
      mandatory: true,
      evidence: 'Procurement policy specifies no allowed product conditions. Evaluation failed closed.',
    });
  } else {
    if (!rawCondition || rawCondition === 'unknown') {
      checks.push({
        ruleName: 'Product Condition',
        status: 'UNKNOWN',
        mandatory: true,
        evidence: isConsumable
          ? 'Consumable product condition is missing, unverified, or listed as "unknown". New condition is required.'
          : 'Product condition attribute is missing, unverified, or listed as "unknown".',
      });
    } else if (!effectiveAllowedConditions.includes(rawCondition as any)) {
      checks.push({
        ruleName: 'Product Condition',
        status: 'FAIL',
        mandatory: true,
        evidence: isConsumable
          ? `Disallowed condition for consumable: listing states "${rawCondition}", but consumable procurement strictly enforces [new] only.`
          : `Disallowed condition: listing states "${rawCondition}", but policy strictly permits [${effectiveAllowedConditions.join(', ')}].`,
      });
    } else {
      checks.push({
        ruleName: 'Product Condition',
        status: 'PASS',
        mandatory: true,
        evidence: isConsumable
          ? `Condition verified: consumable listing condition "${rawCondition}" satisfies strict [new] only policy.`
          : `Condition verified: listing condition "${rawCondition}" is permitted by policy.`,
      });
    }
  }

  // ----------------------------------------------------
  // 4. Mandatory Check: Minimum RAM Specification
  // ----------------------------------------------------
  if (policy?.minRamGb !== undefined && policy.minRamGb > 0) {
    const rawRam = product.ramGb;
    if (rawRam === null || rawRam === undefined || typeof rawRam !== 'number' || Number.isNaN(rawRam)) {
      checks.push({
        ruleName: 'Minimum RAM Specification',
        status: 'UNKNOWN',
        mandatory: true,
        evidence: `RAM specification is absent or ambiguous in listing metadata. Policy demands >= ${policy.minRamGb} GB.`,
      });
    } else if (rawRam < policy.minRamGb) {
      checks.push({
        ruleName: 'Minimum RAM Specification',
        status: 'FAIL',
        mandatory: true,
        evidence: `Insufficient RAM: verified specification is ${rawRam} GB, which is below the mandatory ${policy.minRamGb} GB requirement.`,
      });
    } else {
      checks.push({
        ruleName: 'Minimum RAM Specification',
        status: 'PASS',
        mandatory: true,
        evidence: `RAM capacity verified: ${rawRam} GB meets or exceeds mandatory requirement of ${policy.minRamGb} GB.`,
      });
    }
  }

  // ----------------------------------------------------
  // 5. Category Alignment & Conflict Verification
  // ----------------------------------------------------
  const buyerClassification = resolveClassification({
    targetItem: policy?.targetItem,
    extractedCategory: policy?.category,
    buyerPrompt: policy?.originalPrompt || policy?.extractedReasoning,
  });

  const productClassification = resolveClassification({
    productTitle: product.title,
    productDescription: product.description,
    supplierCategory: product.supplierCategory,
  });

  if (
    buyerClassification.category !== 'general' &&
    productClassification.category !== 'general' &&
    buyerClassification.category !== productClassification.category
  ) {
    checks.push({
      ruleName: 'Category Alignment',
      status: 'UNKNOWN',
      mandatory: true,
      evidence: `Genuine classification conflict: buyer intent is [${buyerClassification.categoryDisplayName}], but product listing indicates [${productClassification.categoryDisplayName}]. Held for owner review to prevent misapplied policy profile.`,
    });
  }

  // ----------------------------------------------------
  // 6. Explicit Critical Specifications Check
  // ----------------------------------------------------
  const criticalSpecsToCheck = {
    ...(policy?.criticalSpecs || {}),
    ...(policy?.enforceTargetSpecs ? policy?.targetSpecs || {} : {}),
  };

  if (Object.keys(criticalSpecsToCheck).length > 0) {
    const combinedProductText = `${product.title} ${product.description || ''}`.toLowerCase();
    for (const [specName, specVal] of Object.entries(criticalSpecsToCheck)) {
      if (specName.toLowerCase() === 'ram' || specName.toLowerCase() === 'storage') {
        continue;
      }
      const valStr = String(specVal).trim().toLowerCase();
      const isPresent = combinedProductText.includes(valStr);
      if (isPresent) {
        checks.push({
          ruleName: `Critical Specification: ${specName}`,
          status: 'PASS',
          mandatory: true,
          evidence: `Critical specification "${specName}: ${specVal}" verified in product metadata.`,
        });
      } else {
        checks.push({
          ruleName: `Critical Specification: ${specName}`,
          status: 'UNKNOWN',
          mandatory: true,
          evidence: `Requested critical specification "${specName}: ${specVal}" is absent or unverified in listing metadata. Held for owner review.`,
        });
      }
    }
  }

  // ----------------------------------------------------
  // Deterministic Decision Matrix (Strict Precedence)
  // ----------------------------------------------------
  const hardViolations = checks.filter((c) => c.status === 'FAIL');
  const unknownMandatory = checks.filter((c) => c.mandatory && c.status === 'UNKNOWN');

  let overallStatus: OverallPolicyDecision = 'PASS';
  let summary = '';

  if (hardViolations.length > 0) {
    overallStatus = 'BLOCKED';
    summary = `Purchase BLOCKED: ${hardViolations.length} hard constraint violation(s) detected [${hardViolations.map((v) => v.ruleName).join(', ')}].`;
  } else if (unknownMandatory.length > 0) {
    overallStatus = 'REVIEW';
    summary = `Purchase held for OWNER REVIEW: ${unknownMandatory.length} mandatory attribute(s) missing or ambiguous [${unknownMandatory.map((u) => u.ruleName).join(', ')}].`;
  } else {
    overallStatus = 'PASS';
    summary = 'All mandatory procurement constraints were deterministically verified and satisfied.';
  }

  return {
    productId: product.id,
    overallStatus,
    summary,
    checks,
    evaluatedAt: new Date().toISOString(),
    resolvedCategory: productClassification.category !== 'general' ? productClassification.category : buyerClassification.category,
    resolvedSubcategory: productClassification.subcategory !== 'Other' ? productClassification.subcategory : buyerClassification.subcategory,
  };
}
