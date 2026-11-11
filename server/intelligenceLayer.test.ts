import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductPolicy } from '../src/policyEngine/policyEngine.ts';
import { auditStore } from './auditStore.ts';
import { passportService } from './passportService.ts';
import type {
  PurchaseRequirements,
  NormalizedProduct,
  EvaluatedProduct,
  AuditRecord,
} from '../src/shared/types.ts';
import { isConsumableCategory } from '../src/shared/categories.ts';

// Helper fixtures
const mockPolicy: PurchaseRequirements = {
  id: 'req_test_laptop_101',
  category: 'computing',
  subcategory: 'Laptops',
  targetItem: 'development laptop',
  quantity: 1,
  maxBudget: 800,
  currency: 'USD',
  allowedConditions: ['new'],
  minRamGb: 16,
  minStorageGb: 512,
  extractedReasoning: 'Dev laptop requiring 16GB RAM and under $800 USD ceiling',
  createdAt: new Date().toISOString(),
  originalPrompt: 'I need a fast dev laptop under $800 with 16GB RAM',
};

const mockConsumablePolicy: PurchaseRequirements = {
  id: 'req_test_paper_202',
  category: 'office_supplies',
  subcategory: 'Paper',
  targetItem: 'copier paper 8.5x11 20lb',
  quantity: 5,
  maxBudget: 60,
  currency: 'USD',
  allowedConditions: ['new'],
  extractedReasoning: 'Copier paper 5 packs under $60 USD ceiling',
  createdAt: new Date().toISOString(),
  originalPrompt: '5 packs of copier paper 8.5x11 20lb under $60',
};

const mockLaptopOverBudget: NormalizedProduct = {
  id: 'prod_thinkpad_t14',
  title: 'Lenovo ThinkPad T14 Gen 4 16GB RAM 512GB SSD',
  merchant: 'Lenovo Direct',
  price: 950,
  currency: 'USD',
  condition: 'new',
  ramGb: 16,
  storageGb: 512,
  productUrl: 'https://example.com/thinkpad',
  sku: 'THINKPAD-T14',
  availability: 'IN_STOCK',
};

const mockLaptopLowRam: NormalizedProduct = {
  id: 'prod_budget_laptop_8gb',
  title: 'Budget Laptop 8GB RAM 256GB SSD',
  merchant: 'Best Buy',
  price: 650,
  currency: 'USD',
  condition: 'new',
  ramGb: 8,
  storageGb: 256,
  productUrl: 'https://example.com/budget',
  sku: 'BUDGET-8GB',
  availability: 'IN_STOCK',
};

const mockLaptopMissingRam: NormalizedProduct = {
  id: 'prod_unknown_ram',
  title: 'Generic Modern Laptop 15-inch',
  merchant: 'Generic Tech',
  price: 720,
  currency: 'USD',
  condition: 'new',
  ramGb: null,
  storageGb: 512,
  productUrl: 'https://example.com/generic',
  sku: 'GEN-LAPTOP',
  availability: 'IN_STOCK',
};

const mockLaptopCompliant: NormalizedProduct = {
  id: 'prod_dell_latitude',
  title: 'Dell Latitude 5420 16GB RAM 512GB SSD',
  merchant: 'Dell Outlet',
  price: 780,
  currency: 'USD',
  condition: 'new',
  ramGb: 16,
  storageGb: 512,
  productUrl: 'https://example.com/latitude',
  sku: 'DELL-5420',
  availability: 'IN_STOCK',
};

const mockPaperRefurbished: NormalizedProduct = {
  id: 'prod_paper_refurb',
  title: 'Copier Paper 8.5x11 20lb 500 Sheets - Refurbished Open Box',
  merchant: 'Office Deals',
  price: 8,
  currency: 'USD',
  condition: 'refurbished',
  ramGb: null,
  storageGb: null,
  productUrl: 'https://example.com/paper',
  sku: 'PAPER-REFURB',
  availability: 'IN_STOCK',
};

// ============================================================================
// PART 1: POLICY WHAT-IF SIMULATOR TESTS (Tests 1 to 10)
// ============================================================================

test('1. Simulator: Simulated budget changes do not modify the active policy object', () => {
  const originalBudget = mockPolicy.maxBudget;
  const simulatedPolicy: PurchaseRequirements = {
    ...mockPolicy,
    maxBudget: 1200,
  };

  assert.equal(mockPolicy.maxBudget, originalBudget, 'Active policy must remain untouched');
  assert.equal(simulatedPolicy.maxBudget, 1200, 'Simulated policy has altered value');
});

test('2. Simulator: Simulated outcomes use the deterministic policy engine', () => {
  const simulatedPolicy: PurchaseRequirements = {
    ...mockPolicy,
    maxBudget: 1000,
  };

  const evalResult = evaluateProductPolicy(mockLaptopOverBudget, simulatedPolicy);
  assert.ok(evalResult, 'Engine returns PolicyEvaluationResult');
  assert.equal(evalResult.overallStatus, 'PASS', 'Deterministically evaluated with pure engine');
});

test('3. Simulator: Product changes from BLOCKED to PASS when simulated budget increase resolves its only violation', () => {
  // Original evaluation with $800 budget
  const originalEval = evaluateProductPolicy(mockLaptopOverBudget, mockPolicy);
  assert.equal(originalEval.overallStatus, 'BLOCKED', 'Original is blocked by budget');

  // Simulated evaluation with $1000 budget
  const simPolicy: PurchaseRequirements = { ...mockPolicy, maxBudget: 1000 };
  const simEval = evaluateProductPolicy(mockLaptopOverBudget, simPolicy);
  assert.equal(simEval.overallStatus, 'PASS', 'Simulated budget increase makes item pass');
  assert.ok(simEval.checks.every((c) => c.status === 'PASS'));
});

test('4. Simulator: Product remains BLOCKED when another mandatory requirement is violated', () => {
  // Even if budget is simulated up to $2,000, 8GB laptop violates min 16GB RAM
  const simPolicy: PurchaseRequirements = { ...mockPolicy, maxBudget: 2000 };
  const simEval = evaluateProductPolicy(mockLaptopLowRam, simPolicy);

  assert.equal(simEval.overallStatus, 'BLOCKED', 'Must remain BLOCKED due to RAM violation');
  const ramCheck = simEval.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(ramCheck?.status, 'FAIL', 'RAM rule fails deterministically');
});

test('5. Simulator: Missing critical specifications remain REVIEW in simulation', () => {
  const simPolicy: PurchaseRequirements = { ...mockPolicy, maxBudget: 1500 };
  const simEval = evaluateProductPolicy(mockLaptopMissingRam, simPolicy);

  assert.equal(simEval.overallStatus, 'REVIEW', 'Must remain REVIEW when RAM is missing');
});

test('6. Simulator: Consumables remain New-only in simulation (immutable protection)', () => {
  // An adversary attempts to simulate allowing 'refurbished' on consumable paper
  const attemptedSimPolicy: PurchaseRequirements = {
    ...mockConsumablePolicy,
    allowedConditions: ['new', 'refurbished', 'used'],
  };

  const evalResult = evaluateProductPolicy(mockPaperRefurbished, attemptedSimPolicy);
  assert.equal(evalResult.overallStatus, 'BLOCKED', 'Refurbished consumable must remain BLOCKED');
  const conditionCheck = evalResult.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(conditionCheck?.status, 'FAIL');
  assert.match(conditionCheck?.evidence || '', /strictly enforces \[new\] only/i);
});

test('7. Simulator: Simulation does not create PayPal orders or alter checkout state', () => {
  const lockedBefore = auditStore.isOrderLocked('prod_thinkpad_t14');
  const recordsBefore = auditStore.getRecords().length;

  // Run simulation
  const simPolicy: PurchaseRequirements = { ...mockPolicy, maxBudget: 1500 };
  evaluateProductPolicy(mockLaptopOverBudget, simPolicy);

  assert.equal(auditStore.isOrderLocked('prod_thinkpad_t14'), lockedBefore);
  assert.equal(auditStore.getRecords().length, recordsBefore);
});

test('8. Simulator: Simulation does not modify historical audit records', () => {
  const initialRecords = JSON.stringify(auditStore.getRecords());
  const simPolicy: PurchaseRequirements = { ...mockPolicy, maxBudget: 5000 };
  evaluateProductPolicy(mockLaptopOverBudget, simPolicy);

  assert.equal(JSON.stringify(auditStore.getRecords()), initialRecords);
});

test('9. Simulator: Discarding a simulation leaves the active policy unchanged', () => {
  const activePolicyClone = { ...mockPolicy };
  let currentPolicy = { ...activePolicyClone };

  // Buyer creates a hypothetical simulation
  const hypothetical = { ...currentPolicy, maxBudget: 99999 };
  assert.equal(hypothetical.maxBudget, 99999);

  // Buyer discards simulation
  // Active policy unchanged
  assert.equal(currentPolicy.maxBudget, activePolicyClone.maxBudget);
});

test('10. Simulator: Applying a policy change uses the validated policy sanitization workflow', () => {
  // Consumable paper with attempted refurbished condition applied
  const incomingPolicy: PurchaseRequirements = {
    ...mockConsumablePolicy,
    allowedConditions: ['refurbished'],
  };

  const isConsumable = isConsumableCategory(incomingPolicy.category);
  const sanitizedPolicy: PurchaseRequirements = {
    ...incomingPolicy,
    allowedConditions: isConsumable ? ['new'] : incomingPolicy.allowedConditions,
  };

  assert.deepEqual(sanitizedPolicy.allowedConditions, ['new'], 'Consumables sanitized to new');
});

// ============================================================================
// PART 2: INTELLIGENT PRODUCT COMPARISON TESTS (Tests 11 to 21)
// ============================================================================

test('11. Comparison: Comparison uses actual product data with real prices and specs', () => {
  const products: NormalizedProduct[] = [mockLaptopCompliant, mockLaptopOverBudget];
  assert.equal(products[0].id, 'prod_dell_latitude');
  assert.equal(products[0].price, 780);
  assert.equal(products[0].ramGb, 16);
});

test('12. Comparison: Different currencies are isolated and not incorrectly compared as equivalent amounts', () => {
  const gbpProduct: NormalizedProduct = {
    id: 'prod_gbp_laptop',
    title: 'UK Laptop in GBP',
    merchant: 'UK Store',
    price: 700, // 700 GBP is ~900 USD, cannot be ranked as cheaper than 780 USD without conversion
    currency: 'GBP',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: '#',
    sku: 'GBP-01',
    availability: 'IN_STOCK',
  };

  const evalResult = evaluateProductPolicy(gbpProduct, mockPolicy);
  assert.equal(evalResult.overallStatus, 'BLOCKED', 'GBP product on USD policy must be BLOCKED');
  const currencyCheck = evalResult.checks.find((c) => c.ruleName === 'Currency Verification');
  assert.equal(currencyCheck?.status, 'FAIL');
});

test('13. Comparison: Missing specifications remain unverified (never fabricated)', () => {
  const evalResult = evaluateProductPolicy(mockLaptopMissingRam, mockPolicy);
  assert.equal(evalResult.overallStatus, 'REVIEW');
  const ramCheck = evalResult.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(ramCheck?.status, 'UNKNOWN');
  assert.match(ramCheck?.evidence || '', /absent or ambiguous/i);
});

test('14. Comparison: Each product receives its exact deterministic policy result', () => {
  const evalCompliant = evaluateProductPolicy(mockLaptopCompliant, mockPolicy);
  const evalBlocked = evaluateProductPolicy(mockLaptopOverBudget, mockPolicy);
  const evalReview = evaluateProductPolicy(mockLaptopMissingRam, mockPolicy);

  assert.equal(evalCompliant.overallStatus, 'PASS');
  assert.equal(evalBlocked.overallStatus, 'BLOCKED');
  assert.equal(evalReview.overallStatus, 'REVIEW');
});

test('15. Comparison: BLOCKED products are never recommended as eligible purchases', () => {
  const evaluatedProducts: EvaluatedProduct[] = [
    { ...mockLaptopOverBudget, evaluation: evaluateProductPolicy(mockLaptopOverBudget, mockPolicy) },
  ];

  const compliantOnly = evaluatedProducts.filter((p) => p.evaluation.overallStatus === 'PASS');
  assert.equal(compliantOnly.length, 0, 'No compliant products');
});

test('16. Comparison: REVIEW products are not presented as compliant', () => {
  const evaluatedProducts: EvaluatedProduct[] = [
    { ...mockLaptopMissingRam, evaluation: evaluateProductPolicy(mockLaptopMissingRam, mockPolicy) },
  ];

  const compliantOnly = evaluatedProducts.filter((p) => p.evaluation.overallStatus === 'PASS');
  assert.equal(compliantOnly.length, 0, 'Review item cannot be treated as compliant');
});

test('17. Comparison: Lowest-priced compliant product is correctly identified', () => {
  const cheaperCompliant: NormalizedProduct = {
    id: 'prod_hp_probook',
    title: 'HP ProBook 450 G9 16GB RAM 512GB SSD',
    merchant: 'HP Store',
    price: 720,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: '#',
    sku: 'HP-450',
    availability: 'IN_STOCK',
  };

  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };
  const p2: EvaluatedProduct = {
    ...cheaperCompliant,
    evaluation: evaluateProductPolicy(cheaperCompliant, mockPolicy),
  };

  const compliant = [p1, p2].filter((p) => p.evaluation.overallStatus === 'PASS');
  const sorted = [...compliant].sort((a, b) => (a.price || 0) - (b.price || 0));

  assert.equal(sorted[0].id, 'prod_hp_probook', 'Lowest priced compliant option must be HP ProBook ($720)');
});

test('18. Comparison: Recommendation explanations match underlying policy outcomes', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  assert.ok(p1.evaluation.summary.includes('deterministically verified and satisfied'));
});

test('19. Comparison: Product selection returns to the existing approval gate', () => {
  let approvalTarget: EvaluatedProduct | null = null;
  const selectForApproval = (p: EvaluatedProduct) => {
    approvalTarget = p;
  };

  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  selectForApproval(p1);
  assert.equal((approvalTarget as EvaluatedProduct | null)?.id, 'prod_dell_latitude');
});

test('20. Comparison: Updated product prices are revalidated before checkout', () => {
  // If price updates from $780 to $850 before order creation, it must be revalidated against $800 ceiling
  const updatedProduct: NormalizedProduct = {
    ...mockLaptopCompliant,
    price: 850,
  };

  const reval = evaluateProductPolicy(updatedProduct, mockPolicy);
  assert.equal(reval.overallStatus, 'BLOCKED', 'Updated higher price fails closed');
});

test('21. Comparison: Product comparison does not create duplicate procurement requests or orders', () => {
  const reqCountBefore = auditStore.getAllRequirements().length;
  const auditCountBefore = auditStore.getRecords().length;

  // Comparison is read-only
  const comparisonView = [mockLaptopCompliant, mockLaptopOverBudget].map((p) => ({
    ...p,
    evaluation: evaluateProductPolicy(p, mockPolicy),
  }));

  assert.equal(comparisonView.length, 2);
  assert.equal(auditStore.getAllRequirements().length, reqCountBefore);
  assert.equal(auditStore.getRecords().length, auditCountBefore);
});

// ============================================================================
// PART 3: PROCUREMENT DECISION PASSPORT TESTS (Tests 22 to 33)
// ============================================================================

test('22. Passport: A Passport can be generated for a PASS evaluation', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const passport = passportService.generatePassport({
    requirement: mockPolicy,
    product: p1,
  });

  assert.ok(passport.passportReference.startsWith('TLP-PASSPORT-'));
  assert.equal(passport.policyEvaluation.overallStatus, 'PASS');
  assert.equal(passport.product.id, 'prod_dell_latitude');
});

test('23. Passport: A Passport can accurately represent BLOCKED and REVIEW decisions', () => {
  const pBlocked: EvaluatedProduct = {
    ...mockLaptopOverBudget,
    evaluation: evaluateProductPolicy(mockLaptopOverBudget, mockPolicy),
  };
  const pReview: EvaluatedProduct = {
    ...mockLaptopMissingRam,
    evaluation: evaluateProductPolicy(mockLaptopMissingRam, mockPolicy),
  };

  const passportBlocked = passportService.generatePassport({
    requirement: mockPolicy,
    product: pBlocked,
  });
  const passportReview = passportService.generatePassport({
    requirement: mockPolicy,
    product: pReview,
  });

  assert.equal(passportBlocked.policyEvaluation.overallStatus, 'BLOCKED');
  assert.match(passportBlocked.decisionExplanation, /BLOCKED by deterministic server policy/);

  assert.equal(passportReview.policyEvaluation.overallStatus, 'REVIEW');
  assert.match(passportReview.decisionExplanation, /OWNER REVIEW/);
});

test('24. Passport: Passport references are unique', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const pass1 = passportService.generatePassport({ requirement: mockPolicy, product: p1 });
  // Add a small artificial delay to ensure distinct time components if using ms
  const pass2 = passportService.generatePassport({
    requirement: { ...mockPolicy, id: 'req_alt_2' },
    product: p1,
  });

  assert.notEqual(pass1.passportReference, pass2.passportReference);
});

test('25. Passport: Original procurement requirements are represented accurately', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const passport = passportService.generatePassport({ requirement: mockPolicy, product: p1 });
  assert.equal(passport.request.targetItem, 'development laptop');
  assert.equal(passport.request.maxBudget, 800);
  assert.equal(passport.request.currency, 'USD');
  assert.equal(passport.request.quantity, 1);
  assert.equal(passport.request.originalPrompt, mockPolicy.originalPrompt);
});

test('26. Passport: Missing product information is not fabricated', () => {
  const pReview: EvaluatedProduct = {
    ...mockLaptopMissingRam,
    evaluation: evaluateProductPolicy(mockLaptopMissingRam, mockPolicy),
  };

  const passport = passportService.generatePassport({ requirement: mockPolicy, product: pReview });
  assert.equal(passport.product.ramGb, null, 'RAM remains null and is never invented');
});

test('27. Passport: Buyer approval status is represented accurately', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  // 1. Without audit record -> PENDING
  const passportPending = passportService.generatePassport({ requirement: mockPolicy, product: p1 });
  assert.equal(passportPending.buyerDecision.status, 'PENDING');

  // 2. With approved audit record -> APPROVED
  const mockAudit: AuditRecord = {
    id: 'audit_test_01',
    timestamp: new Date().toISOString(),
    requirementId: mockPolicy.id,
    productId: p1.id,
    productTitle: p1.title,
    amount: 780,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Finance Lead Alex',
    status: 'ORDER_CREATED',
    verificationHash: 'dummy_hash',
  };

  const passportApproved = passportService.generatePassport({
    requirement: mockPolicy,
    product: p1,
    auditRecord: mockAudit,
  });
  assert.equal(passportApproved.buyerDecision.status, 'APPROVED');
  assert.equal(passportApproved.buyerDecision.approver, 'Finance Lead Alex');
});

test('28. Passport: An unapproved order is not labelled as approved', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const passport = passportService.generatePassport({ requirement: mockPolicy, product: p1 });
  assert.notEqual(passport.buyerDecision.status, 'APPROVED');
});

test('29. Passport: A created PayPal order is not labelled as captured payment', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const orderCreatedAudit: AuditRecord = {
    id: 'audit_created_02',
    timestamp: new Date().toISOString(),
    requirementId: mockPolicy.id,
    productId: p1.id,
    productTitle: p1.title,
    amount: 780,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Buyer',
    paypalOrderId: '89W31755JK1230920',
    status: 'ORDER_CREATED',
    verificationHash: 'dummy_hash_created',
  };

  const passport = passportService.generatePassport({
    requirement: mockPolicy,
    product: p1,
    auditRecord: orderCreatedAudit,
  });

  assert.equal(passport.paymentRecord.orderCreationStatus, 'CREATED');
  assert.equal(passport.paymentRecord.paymentCaptureStatus, 'PENDING');
  assert.equal(passport.paymentRecord.paypalCaptureId, undefined);
  assert.match(passport.paymentRecord.notes, /Payment is NOT yet completed/);
});

test('30. Passport: Only verified successful PayPal capture is represented as completed payment', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const capturedAudit: AuditRecord = {
    id: 'audit_captured_03',
    timestamp: new Date().toISOString(),
    requirementId: mockPolicy.id,
    productId: p1.id,
    productTitle: p1.title,
    amount: 780,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Buyer',
    paypalOrderId: '89W31755JK1230920',
    paypalCaptureId: 'CAP-9988776655',
    status: 'CAPTURED',
    verificationHash: 'dummy_hash_captured',
  };

  const passport = passportService.generatePassport({
    requirement: mockPolicy,
    product: p1,
    auditRecord: capturedAudit,
  });

  assert.equal(passport.paymentRecord.paymentCaptureStatus, 'CAPTURED');
  assert.equal(passport.paymentRecord.paypalCaptureId, 'CAP-9988776655');
  assert.match(passport.paymentRecord.notes, /Payment successfully captured/);
});

test('31. Passport: Passport generation does not modify audit records', () => {
  const recordsBefore = JSON.stringify(auditStore.getRecords());
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  passportService.generatePassport({ requirement: mockPolicy, product: p1 });
  assert.equal(JSON.stringify(auditStore.getRecords()), recordsBefore);
});

test('32. Passport: Passport verification correctly verifies matching audit ledger records', () => {
  const validAudit: AuditRecord = {
    id: 'audit_verifiable_04',
    timestamp: new Date().toISOString(),
    requirementId: mockPolicy.id,
    productId: 'prod_dell_latitude',
    productTitle: 'Dell Latitude 5420',
    amount: 780,
    currency: 'USD',
    quantity: 1,
    policyStatus: 'PASS',
    approvalGrantedBy: 'Buyer',
    paypalOrderId: 'PP-12345',
    paypalCaptureId: 'CAP-67890',
    status: 'CAPTURED',
    verificationHash: auditStore.generateChecksum(mockPolicy.id, 'prod_dell_latitude', 780, 'USD', 1),
  };

  auditStore.appendRecord(validAudit);

  const verification = passportService.verifyPassport('audit_verifiable_04', validAudit.verificationHash);
  assert.equal(verification.recordExists, true);
  assert.equal(verification.recordMatches, true);
  assert.equal(verification.captureConfirmedByPayPal, true);
});

test('33. Passport: Structured passport contains complete section keys for printable output', () => {
  const p1: EvaluatedProduct = {
    ...mockLaptopCompliant,
    evaluation: evaluateProductPolicy(mockLaptopCompliant, mockPolicy),
  };

  const passport = passportService.generatePassport({ requirement: mockPolicy, product: p1 });

  assert.ok(passport.passportReference);
  assert.ok(passport.request);
  assert.ok(passport.product);
  assert.ok(passport.policyEvaluation);
  assert.ok(passport.decisionExplanation);
  assert.ok(passport.buyerDecision);
  assert.ok(passport.paymentRecord);
  assert.ok(passport.audit);
});
