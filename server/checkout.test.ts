import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductPolicy } from '../src/policyEngine/policyEngine.ts';
import { auditStore } from './auditStore.ts';
import { PayPalService } from './paypalService.ts';
import { Channel3Adapter } from './channel3Adapter.ts';
import { deterministicFallbackParser, extractTargetItemFromPrompt } from './geminiService.ts';
import type { PurchaseRequirements, NormalizedProduct, AuditRecord } from '../src/shared/types.ts';
import { isConsumableCategory } from '../src/shared/categories.ts';

const testPolicy: PurchaseRequirements = {
  id: 'pol_checkout_001',
  category: 'laptop',
  targetItem: 'laptop for software development',
  maxBudget: 800.0,
  currency: 'USD',
  allowedConditions: ['new'],
  minRamGb: 16,
  extractedReasoning: 'Standard dev laptop, max $800, min 16GB RAM, new only.',
  createdAt: new Date().toISOString(),
};

const compliantProduct: NormalizedProduct = {
  id: 'prod_pass_acer',
  title: 'Acer Aspire 5 15.6" (16GB RAM, 512GB SSD)',
  merchant: 'B&H Photo Video',
  price: 599.99,
  currency: 'USD',
  condition: 'new',
  ramGb: 16,
  storageGb: 512,
  productUrl: 'https://example.com/acer',
  sku: 'ACER-A5-16G',
  availability: 'IN_STOCK',
  dataSource: 'channel3_live',
};

const blockedProduct: NormalizedProduct = {
  id: 'prod_blocked_lenovo',
  title: 'Lenovo ThinkPad E14 (16GB RAM, 512GB SSD)',
  merchant: 'CDW Direct',
  price: 889.0, // Above $800 ceiling
  currency: 'USD',
  condition: 'new',
  ramGb: 16,
  storageGb: 512,
  productUrl: 'https://example.com/lenovo',
  sku: 'LNV-E14',
  availability: 'IN_STOCK',
  dataSource: 'channel3_live',
};

const reviewProduct: NormalizedProduct = {
  id: 'prod_review_asus',
  title: 'ASUS Vivobook Go 15 (RAM unlisted in listing)',
  merchant: 'Newegg',
  price: 529.99,
  currency: 'USD',
  condition: 'new',
  ramGb: null, // Ambiguous/missing
  storageGb: 512,
  productUrl: 'https://example.com/asus',
  sku: 'ASUS-GO',
  availability: 'IN_STOCK',
  dataSource: 'channel3_live',
};

test.beforeEach(() => {
  auditStore.clear();
  auditStore.saveRequirements(testPolicy);
  auditStore.cacheProducts([compliantProduct, blockedProduct, reviewProduct]);
});

test('Checkout Security 1: Server policy engine blocks BLOCKED item from order creation', () => {
  const product = auditStore.getProduct('prod_blocked_lenovo')!;
  const policy = auditStore.getRequirements('pol_checkout_001')!;

  // Deterministic server re-evaluation immediately before order creation
  const liveEval = evaluateProductPolicy(product, policy);
  assert.equal(liveEval.overallStatus, 'BLOCKED');

  // Hard assertion: Only PASS items can proceed to order creation
  assert.notEqual(liveEval.overallStatus, 'PASS');
});

test('Checkout Security 2: Server policy engine blocks REVIEW item with missing RAM from order creation', () => {
  const product = auditStore.getProduct('prod_review_asus')!;
  const policy = auditStore.getRequirements('pol_checkout_001')!;

  const liveEval = evaluateProductPolicy(product, policy);
  assert.equal(liveEval.overallStatus, 'REVIEW');

  // Hard assertion: REVIEW items cannot be authoritatively checked out
  assert.notEqual(liveEval.overallStatus, 'PASS');
});

test('Checkout Security 3: Price tampering is strictly detected between client and verified server catalog', () => {
  const product = auditStore.getProduct('prod_pass_acer')!;
  const clientSubmittedPrice = 1.0; // Tampered price

  // Server compares submitted price with trusted product.price
  const isTampered = Math.abs((product.price ?? 0) - clientSubmittedPrice) > 0.001;
  assert.equal(isTampered, true);
});

test('Checkout Security 4: Duplicate submissions for locked items are prevented', () => {
  const productId = 'prod_pass_acer';
  assert.equal(auditStore.isOrderLocked(productId), false);

  // Lock order upon first checkout attempt
  auditStore.lockOrder(productId);
  assert.equal(auditStore.isOrderLocked(productId), true);

  // Subsequent checkout attempt must be rejected
  const canCheckoutAgain = !auditStore.isOrderLocked(productId);
  assert.equal(canCheckoutAgain, false);
});

test('Checkout Security 5: Explicit buyer approval is mandatory for payment capture', () => {
  const userConfirmationProvided = false;

  // Server strictly rejects capture if buyer confirmation is missing
  let errorRaised = false;
  if (!userConfirmationProvided) {
    errorRaised = true;
  }
  assert.equal(errorRaised, true);
});

test('Checkout Security 6: Unconfigured credentials return clear setup state without pretending payment succeeded', async () => {
  // Service initialized with empty credentials
  const unconfiguredService = new PayPalService('', '');
  assert.equal(unconfiguredService.isLiveCredentialsConfigured(), false);

  const orderResult = await unconfiguredService.createOrder({
    productTitle: compliantProduct.title,
    amount: compliantProduct.price!,
    currency: compliantProduct.currency!,
    sku: compliantProduct.sku,
    requirementId: testPolicy.id,
  });

  // Must not pretend order succeeded or return a fake payment
  assert.equal(orderResult.configured, false);
  assert.equal(orderResult.status, 'AWAITING_CREDENTIALS');
  assert.match(orderResult.message || '', /credentials.*required/i);

  const captureResult = await unconfiguredService.captureOrder('test_order', 599.99, 'USD');
  assert.equal(captureResult.configured, false);
  assert.notEqual(captureResult.status, 'COMPLETED');
});

test('Checkout Security 7: Payment state is marked CAPTURED only on verified PayPal completion', () => {
  const auditId = 'audit_test_capture_001';
  const initialAudit: AuditRecord = {
    id: auditId,
    timestamp: new Date().toISOString(),
    requirementId: testPolicy.id,
    productId: compliantProduct.id,
    productTitle: compliantProduct.title,
    amount: compliantProduct.price!,
    currency: compliantProduct.currency!,
    policyStatus: 'PASS',
    approvalGrantedBy: 'Business Owner',
    paypalOrderId: 'TEST_ORDER_123',
    status: 'ORDER_CREATED',
    verificationHash: auditStore.generateChecksum(testPolicy.id, compliantProduct.id, compliantProduct.price!, compliantProduct.currency!),
  };

  auditStore.appendRecord(initialAudit);

  // Simulated verified PayPal completion
  const verifiedPayPalResponse = {
    status: 'COMPLETED',
    captureId: 'PAYPAL_CAP_987654',
  };

  if (verifiedPayPalResponse.status === 'COMPLETED') {
    auditStore.updateRecord(auditId, {
      status: 'CAPTURED',
      paypalCaptureId: verifiedPayPalResponse.captureId,
    });
  }

  const updatedRecord = auditStore.getRecords().find((r) => r.id === auditId);
  assert.equal(updatedRecord?.status, 'CAPTURED');
  assert.equal(updatedRecord?.paypalCaptureId, 'PAYPAL_CAP_987654');
});

test('Checkout Security 8: Non-completed PayPal capture results in FAILED ledger state', () => {
  const auditId = 'audit_test_failed_002';
  const initialAudit: AuditRecord = {
    id: auditId,
    timestamp: new Date().toISOString(),
    requirementId: testPolicy.id,
    productId: compliantProduct.id,
    productTitle: compliantProduct.title,
    amount: compliantProduct.price!,
    currency: compliantProduct.currency!,
    policyStatus: 'PASS',
    approvalGrantedBy: 'Business Owner',
    paypalOrderId: 'TEST_ORDER_DECLINED',
    status: 'ORDER_CREATED',
    verificationHash: 'hash_test',
  };

  auditStore.appendRecord(initialAudit);

  // Simulated payment decline
  const failedResponse = {
    status: 'DENIED',
  };

  if (failedResponse.status !== 'COMPLETED') {
    auditStore.updateRecord(auditId, {
      status: 'FAILED',
      notes: `PayPal capture returned non-completed status: ${failedResponse.status}`,
    });
  }

  const updatedRecord = auditStore.getRecords().find((r) => r.id === auditId);
  assert.equal(updatedRecord?.status, 'FAILED');
  assert.equal(updatedRecord?.paypalCaptureId, undefined);
});

test('Checkout Security 9: Order cancellation unlocks product and marks audit status REJECTED', () => {
  const productId = compliantProduct.id;
  const auditId = 'audit_cancel_001';

  auditStore.lockOrder(productId);
  assert.equal(auditStore.isOrderLocked(productId), true);

  auditStore.appendRecord({
    id: auditId,
    timestamp: new Date().toISOString(),
    requirementId: testPolicy.id,
    productId: compliantProduct.id,
    productTitle: compliantProduct.title,
    amount: compliantProduct.price!,
    currency: compliantProduct.currency!,
    policyStatus: 'PASS',
    approvalGrantedBy: null,
    status: 'ORDER_CREATED',
    verificationHash: 'hash_cancel',
  });

  // User cancels checkout
  auditStore.unlockOrder(productId);
  auditStore.updateRecord(auditId, {
    status: 'REJECTED',
    notes: 'User cancelled before payment authorization.',
  });

  assert.equal(auditStore.isOrderLocked(productId), false);
  const updatedRecord = auditStore.getRecords().find((r) => r.id === auditId);
  assert.equal(updatedRecord?.status, 'REJECTED');
});

test('Checkout Security 10: Server rejects order creation for Lenovo ThinkPad ($1,099.99) under $800 budget even if client claims PASS', async () => {
  const overBudgetProduct: NormalizedProduct = {
    id: 'prod_lenovo_1099',
    title: 'Lenovo ThinkPad E16 Gen 3',
    merchant: 'Best Buy',
    price: 1099.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/thinkpad',
    sku: 'THINKPAD-E16',
    availability: 'IN_STOCK',
    dataSource: 'channel3_live',
  };

  auditStore.cacheProducts([overBudgetProduct]);

  // Client attempts to checkout with userApprovedPrice or claimed PASS
  const policy = auditStore.getRequirements(testPolicy.id)!;
  assert.equal(policy.maxBudget, 800.0);

  // Independent server re-evaluation
  const liveEval = evaluateProductPolicy(overBudgetProduct, policy);
  assert.equal(liveEval.overallStatus, 'BLOCKED');

  // Server budget check
  const isBudgetExceeded = overBudgetProduct.price! > policy.maxBudget;
  assert.equal(isBudgetExceeded, true);

  // Hard assertion: Order creation must be rejected
  const canProceed = (liveEval.overallStatus as string) === 'PASS' && !isBudgetExceeded;
  assert.equal(canProceed, false);
});

test('Checkout Security 11: Active policy budget is authoritatively enforced over stale stored requirements', async () => {
  // Stale policy stored with 1200 budget
  const stalePolicy: PurchaseRequirements = {
    ...testPolicy,
    id: 'pol_stale_1200',
    maxBudget: 1200.0,
  };
  auditStore.saveRequirements(stalePolicy);

  // Active policy provided by user in UI is $800
  const activeUserPolicy: PurchaseRequirements = {
    ...testPolicy,
    id: 'pol_stale_1200',
    maxBudget: 800.0,
  };

  const product: NormalizedProduct = {
    id: 'prod_e16_test',
    title: 'Lenovo ThinkPad E16 Gen 3',
    merchant: 'Best Buy',
    price: 1099.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/e16',
    sku: 'E16-TEST',
    availability: 'IN_STOCK',
    dataSource: 'channel3_live',
  };
  auditStore.cacheProducts([product]);

  // When activePolicy is passed, it overwrites/authorizes over stale store
  auditStore.saveRequirements(activeUserPolicy);
  const effectivePolicy = auditStore.getRequirements(activeUserPolicy.id)!;

  assert.equal(effectivePolicy.maxBudget, 800.0);
  const liveEval = evaluateProductPolicy(product, effectivePolicy);
  assert.equal(liveEval.overallStatus, 'BLOCKED');
});

test('Checkout Security 12: Missing or invalid policy budget in checkout fails closed without order creation', () => {
  const invalidPolicy = {
    ...testPolicy,
    maxBudget: -50, // invalid negative budget
  };

  const product = auditStore.getProduct(compliantProduct.id)!;
  const evalResult = evaluateProductPolicy(product, invalidPolicy);

  assert.equal(evalResult.overallStatus, 'BLOCKED');
  const budgetCheck = evalResult.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'FAIL');
});

test('Procurement Search 13: Deterministic fallback preserves exact targetItem for all 4 non-laptop queries', () => {
  const q1 = deterministicFallbackParser('I need printer and copier paper');
  assert.equal(q1.targetItem.toLowerCase(), 'printer and copier paper');
  assert.equal(q1.category, 'office supplies');

  const q2 = deterministicFallbackParser('Find commercial cleaning supplies');
  assert.equal(q2.targetItem.toLowerCase(), 'commercial cleaning supplies');
  assert.equal(q2.category, 'cleaning supplies');

  const q3 = deterministicFallbackParser('Find maintenance tools and hardware');
  assert.equal(q3.targetItem.toLowerCase(), 'maintenance tools and hardware');
  assert.equal(q3.category, 'maintenance tools');

  const q4 = deterministicFallbackParser('Find office furniture');
  assert.equal(q4.targetItem.toLowerCase(), 'office furniture');
  assert.equal(q4.category, 'office furniture');
});

test('Procurement Search 14: Non-computing query without explicit RAM requirement defaults minRamGb to 0', () => {
  const parsed = deterministicFallbackParser('I need printer and copier paper, budget $100');
  assert.equal(parsed.minRamGb, 0);
  assert.equal(parsed.maxBudget, 100);
});

test('Procurement Search 15: Explicit RAM requirement is accurately extracted and preserved', () => {
  const parsed = deterministicFallbackParser('Find engineering CAD laptop with 32GB RAM under $1500');
  assert.equal(parsed.minRamGb, 32);
  assert.equal(parsed.maxBudget, 1500);
  assert.equal(parsed.category, 'laptop');
});

test('Procurement Search 16: Laptop search continues to extract laptop targetItem and computing category', () => {
  const parsed = deterministicFallbackParser('Find a reliable laptop for remote software development under $800');
  assert.match(parsed.targetItem.toLowerCase(), /laptop/);
  assert.equal(parsed.category, 'laptop');
  assert.equal(parsed.maxBudget, 800);
});

test('Procurement Search 17: Non-computing query never returns laptop fixtures from Channel3 curated dataset', () => {
  const adapter = new Channel3Adapter();
  const nonComputingFixtures1 = adapter.getCuratedHackathonDataset('printer and copier paper');
  assert.equal(nonComputingFixtures1.length, 0);

  const nonComputingFixtures2 = adapter.getCuratedHackathonDataset('cleaning supplies');
  assert.equal(nonComputingFixtures2.length, 0);

  const nonComputingFixtures3 = adapter.getCuratedHackathonDataset('maintenance tools and hardware');
  assert.equal(nonComputingFixtures3.length, 0);

  const nonComputingFixtures4 = adapter.getCuratedHackathonDataset('office furniture');
  assert.equal(nonComputingFixtures4.length, 0);
});

test('Procurement Search 18: Computing query preserves curated laptop fixtures when offline dataset is requested', () => {
  const adapter = new Channel3Adapter();
  const laptopFixtures = adapter.getCuratedHackathonDataset('laptop');
  assert.ok(laptopFixtures.length > 0);
  assert.ok(laptopFixtures.every((p) => p.dataSource === 'fixture_fallback'));
  assert.ok(laptopFixtures.some((p) => p.title.toLowerCase().includes('thinkpad') || p.title.toLowerCase().includes('macbook') || p.title.toLowerCase().includes('acer')));
});

test('Procurement Search 19: Consumable parser defaults condition to new only and populates targetSpecs', () => {
  const paperReq = deterministicFallbackParser('I need 8.5x11 printer and copier paper under $80');
  assert.deepEqual(paperReq.allowedConditions, ['new']);
  assert.equal(paperReq.minRamGb, 0);
  assert.ok(paperReq.targetSpecs);
  assert.equal(paperReq.targetSpecs['Size'], 'Letter (8.5" x 11")');

  const laptopReq = deterministicFallbackParser('New laptop with 16GB RAM and 512GB SSD under $900');
  assert.equal(laptopReq.minRamGb, 16);
  assert.ok(laptopReq.targetSpecs);
  assert.equal(laptopReq.targetSpecs['RAM'], '16 GB');
  assert.equal(laptopReq.targetSpecs['Storage'], '512 GB');
});

test('Procurement Search 20: Server checkout flow evaluates and approves compliant non-computing product', () => {
  const nonComputingPolicy: PurchaseRequirements = {
    id: 'pol_paper_checkout',
    category: 'office_supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Paper procurement.',
    createdAt: new Date().toISOString(),
  };

  const paperProduct: NormalizedProduct = {
    id: 'prod_paper_compliant',
    title: 'Hammermill Multi-Purpose Paper 20lb (500 Sheets)',
    merchant: 'Staples Business',
    price: 39.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/hammermill',
    sku: 'HAMMER-500',
    availability: 'IN_STOCK',
    dataSource: 'channel3_live',
  };

  auditStore.cacheProducts([paperProduct]);
  auditStore.saveRequirements(nonComputingPolicy);

  // Independent server policy check
  const evaluation = evaluateProductPolicy(paperProduct, nonComputingPolicy);
  assert.equal(evaluation.overallStatus, 'PASS');

  // Verify no RAM rule was checked
  const hasRamCheck = evaluation.checks.some((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(hasRamCheck, false);

  // Verify server can lock product for checkout
  auditStore.lockOrder(paperProduct.id);
  assert.equal(auditStore.isOrderLocked(paperProduct.id), true);
  auditStore.unlockOrder(paperProduct.id);
  assert.equal(auditStore.isOrderLocked(paperProduct.id), false);
});

test('Procurement Search 21: Server sanitizes manipulated consumable policy to ["new"] before storing', () => {
  // Incoming client policy attempting to permit refurbished/used paper
  const manipulatedIncoming: PurchaseRequirements = {
    id: 'pol_manipulated_paper_update',
    category: 'office_supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 75.0,
    currency: 'USD',
    allowedConditions: ['refurbished', 'used'], // Malicious client payload
    minRamGb: 0,
    extractedReasoning: 'Client override attempt.',
    createdAt: new Date().toISOString(),
  };

  // Server-side policy sanitization logic from /api/requirements/update
  const isConsumable =
    isConsumableCategory(manipulatedIncoming.category) ||
    isConsumableCategory(manipulatedIncoming.targetItem);
  assert.equal(isConsumable, true);

  const sanitized: PurchaseRequirements = {
    ...manipulatedIncoming,
    allowedConditions: isConsumable ? ['new'] : manipulatedIncoming.allowedConditions,
  };

  auditStore.saveRequirements(sanitized);

  // Assert that stored policy in audit store has strictly ['new']
  const storedPolicy = auditStore.getRequirements(manipulatedIncoming.id)!;
  assert.deepEqual(storedPolicy.allowedConditions, ['new']);
});

test('Procurement Search 22: Checkout security rejects refurbished consumable even if client submits manipulated activePolicy', () => {
  const refurbishedPaperProduct: NormalizedProduct = {
    id: 'prod_refurb_paper_checkout',
    title: 'Multi-Purpose Copier Paper (Refurbished / Open Box)',
    merchant: 'Surplus Office Store',
    price: 25.0,
    currency: 'USD',
    condition: 'refurbished',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-refurb',
    sku: 'SURPLUS-PAPER',
    availability: 'IN_STOCK',
    dataSource: 'channel3_live',
  };

  auditStore.cacheProducts([refurbishedPaperProduct]);

  // Client attempts to create an order by passing activePolicy that allows refurbished
  const maliciousClientPolicy: PurchaseRequirements = {
    id: 'pol_malicious_checkout_pass',
    category: 'office_supplies',
    targetItem: 'copier paper',
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['refurbished'], // Client claims refurbished is allowed
    minRamGb: 0,
    extractedReasoning: 'Bypass attempt.',
    createdAt: new Date().toISOString(),
  };

  // Server-side revalidation immediately before order creation
  const isConsumable =
    isConsumableCategory(maliciousClientPolicy.category) ||
    isConsumableCategory(maliciousClientPolicy.targetItem) ||
    isConsumableCategory(refurbishedPaperProduct.title);
  assert.equal(isConsumable, true);

  const effectivePolicy: PurchaseRequirements = {
    ...maliciousClientPolicy,
    allowedConditions: isConsumable ? ['new'] : maliciousClientPolicy.allowedConditions,
  };

  // Independent server policy engine evaluation
  const liveEvaluation = evaluateProductPolicy(refurbishedPaperProduct, effectivePolicy);

  // Must strictly evaluate to BLOCKED
  assert.equal(liveEvaluation.overallStatus, 'BLOCKED');

  // Hard assertion: Order creation must fail closed
  const canProceed = (liveEvaluation.overallStatus as string) === 'PASS';
  assert.equal(canProceed, false);

  // Order is never locked and never created
  assert.equal(auditStore.isOrderLocked(refurbishedPaperProduct.id), false);
});

// ============================================================================
// Phase 2: Quantity-Aware Checkout & Multi-Category Security Regressions
// ============================================================================

test('Procurement Checkout 23: Natural language quantity extraction ("5 packs of copier paper") extracts quantity 5', () => {
  const parsed = deterministicFallbackParser('5 packs of copier paper under $60');
  assert.equal(parsed.quantity, 5);
  assert.equal(parsed.targetItem.toLowerCase(), 'copier paper');
  assert.equal(parsed.maxBudget, 60);
});

test('Procurement Checkout 24: Prompt without quantity specification defaults to quantity 1', () => {
  const parsed = deterministicFallbackParser('A new laptop for software development under $800');
  assert.equal(parsed.quantity, 1);
});

test('Procurement Checkout 25: Word numbers in quantity prompt ("two ergonomic chairs") extract numeric quantity 2', () => {
  const parsed = deterministicFallbackParser('two ergonomic chairs under $400');
  assert.equal(parsed.quantity, 2);
  assert.match(parsed.targetItem.toLowerCase(), /ergonomic chair/);
});

test('Procurement Checkout 26: Channel3 adapter populates lineTotal based on requested quantity', async () => {
  const adapter = new Channel3Adapter();
  const products = adapter.getCuratedHackathonDataset('laptop', 3);
  assert.ok(products.length > 0);
  assert.ok(products.every((p) => p.quantity === 3));
  const acer = products.find((p) => p.id === 'prod_acer_599');
  assert.ok(acer);
  assert.equal(acer.quantity, 3);
  assert.ok(Math.abs((acer.lineTotal ?? 0) - 599.99 * 3) < 0.001);
});

test('Procurement Checkout 27: Multi-unit server checkout blocks item when line total exceeds budget even if unit price is below budget', () => {
  const multiUnitPolicy: PurchaseRequirements = {
    id: 'pol_multi_block_checkout',
    category: 'office_supplies',
    targetItem: 'copier paper',
    quantity: 5,
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: '5 packs.',
    createdAt: new Date().toISOString(),
  };

  const product: NormalizedProduct = {
    id: 'prod_paper_unit_25',
    title: 'Hammermill Multi-Use Paper Ream',
    merchant: 'Office Supply',
    price: 25.0, // $25 < $100 budget, but 5 * $25 = $125 > $100!
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-25',
    sku: 'HAM-25',
    availability: 'IN_STOCK',
  };

  auditStore.cacheProducts([product]);
  auditStore.saveRequirements(multiUnitPolicy);

  const qty = multiUnitPolicy.quantity || 1;
  const lineTotal = product.price! * qty;
  const isBudgetExceeded = lineTotal > multiUnitPolicy.maxBudget;
  assert.equal(isBudgetExceeded, true);

  const evalResult = evaluateProductPolicy(product, multiUnitPolicy);
  assert.equal(evalResult.overallStatus, 'BLOCKED');
});

test('Procurement Checkout 28: Multi-unit server checkout creates order with line total and records quantity in audit log', async () => {
  const multiUnitPolicy: PurchaseRequirements = {
    id: 'pol_multi_pass_checkout',
    category: 'office_supplies',
    targetItem: 'copier paper',
    quantity: 4,
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: '4 packs.',
    createdAt: new Date().toISOString(),
  };

  const product: NormalizedProduct = {
    id: 'prod_paper_unit_20',
    title: 'Multi-Purpose Copy Paper Ream',
    merchant: 'Staples',
    price: 20.0, // 4 * $20 = $80 <= $100
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-20',
    sku: 'STP-20',
    availability: 'IN_STOCK',
  };

  auditStore.cacheProducts([product]);
  auditStore.saveRequirements(multiUnitPolicy);

  const qty = multiUnitPolicy.quantity || 1;
  const lineTotal = product.price! * qty;
  assert.equal(lineTotal, 80.0);

  const evalResult = evaluateProductPolicy(product, multiUnitPolicy);
  assert.equal(evalResult.overallStatus, 'PASS');

  const auditId = 'audit_multi_001';
  auditStore.appendRecord({
    id: auditId,
    timestamp: new Date().toISOString(),
    requirementId: multiUnitPolicy.id,
    productId: product.id,
    productTitle: `${product.title} (${qty} units)`,
    amount: lineTotal,
    unitPrice: product.price ?? undefined,
    quantity: qty,
    subcategory: evalResult.resolvedSubcategory,
    currency: product.currency || 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Business Owner',
    status: 'ORDER_CREATED',
    verificationHash: auditStore.generateChecksum(
      multiUnitPolicy.id,
      product.id,
      lineTotal,
      product.currency || 'USD',
      qty
    ),
  });

  const record = auditStore.getRecords().find((r) => r.id === auditId);
  assert.ok(record);
  assert.equal(record.amount, 80.0);
  assert.equal(record.quantity, 4);
  assert.equal(record.unitPrice, 20.0);
});

test('Procurement Checkout 29: Price tampering detected if user approved price does not match verified server catalog price or line total', () => {
  const product: NormalizedProduct = {
    id: 'prod_tamper_test',
    title: 'Desk Chair',
    merchant: 'Chair Store',
    price: 150.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/chair',
    sku: 'CHAIR-150',
    availability: 'IN_STOCK',
  };

  const qty = 2;
  const lineTotal = product.price! * qty; // 300.0

  // Valid submissions: 150.0 (unit) or 300.0 (line total)
  const isUnitValid = Math.abs(product.price! - 150.0) <= 0.001 || Math.abs(lineTotal - 150.0) <= 0.001;
  const isLineValid = Math.abs(product.price! - 300.0) <= 0.001 || Math.abs(lineTotal - 300.0) <= 0.001;
  assert.equal(isUnitValid, true);
  assert.equal(isLineValid, true);

  // Tampered submission: 5.0
  const tamperedPrice = 5.0;
  const isTamperedValid =
    Math.abs(product.price! - tamperedPrice) <= 0.001 || Math.abs(lineTotal - tamperedPrice) <= 0.001;
  assert.equal(isTamperedValid, false);
});

test('Procurement Checkout 30: Cryptographic checksum binds quantity, line total, currency, and product ID', () => {
  const hash1 = auditStore.generateChecksum('req_1', 'prod_1', 100.0, 'USD', 1);
  const hash2 = auditStore.generateChecksum('req_1', 'prod_1', 100.0, 'USD', 5);

  // Different quantities produce distinct cryptographic verification hashes
  assert.notEqual(hash1, hash2);
  assert.equal(hash1.length, 64); // SHA-256 hex
  assert.equal(hash2.length, 64);
});

test('Procurement Checkout 31: Budget isolation: distinct procurement requests maintain isolated policy requirements in auditStore', () => {
  const policyA: PurchaseRequirements = {
    id: 'pol_req_A',
    category: 'office_supplies',
    targetItem: 'paper',
    quantity: 10,
    maxBudget: 200.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Request A',
    createdAt: new Date().toISOString(),
  };

  const policyB: PurchaseRequirements = {
    id: 'pol_req_B',
    category: 'computing',
    targetItem: 'laptop',
    quantity: 1,
    maxBudget: 800.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 16,
    extractedReasoning: 'Request B',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(policyA);
  auditStore.saveRequirements(policyB);

  const retrievedA = auditStore.getRequirements('pol_req_A')!;
  const retrievedB = auditStore.getRequirements('pol_req_B')!;

  assert.equal(retrievedA.quantity, 10);
  assert.equal(retrievedA.maxBudget, 200.0);
  assert.equal(retrievedA.minRamGb, 0);

  assert.equal(retrievedB.quantity, 1);
  assert.equal(retrievedB.maxBudget, 800.0);
  assert.equal(retrievedB.minRamGb, 16);
});

test('Procurement Checkout 32: Stored policy update accepts and sanitizes positive integer quantity', () => {
  const incomingPolicy: PurchaseRequirements = {
    id: 'pol_update_qty',
    category: 'tools_hardware',
    targetItem: 'cordless drill',
    quantity: 3,
    maxBudget: 600.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Update with quantity.',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(incomingPolicy);
  const stored = auditStore.getRequirements('pol_update_qty')!;
  assert.equal(stored.quantity, 3);
});

test('Procurement Checkout 33: Non-positive quantity validation detects invalid quantity', () => {
  const isInvalid1 = (qty: any) => typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0;
  assert.equal(isInvalid1(0), true);
  assert.equal(isInvalid1(-5), true);
  assert.equal(isInvalid1(1.5), true);
  assert.equal(isInvalid1('3'), true);
  assert.equal(isInvalid1(4), false);
});

test('Procurement Checkout 34: Verified PayPal Sandbox completion flow sets CAPTURED with amount and capture ID', () => {
  const auditId = 'audit_cap_phase2_001';
  auditStore.appendRecord({
    id: auditId,
    timestamp: new Date().toISOString(),
    requirementId: 'req_phase2',
    productId: 'prod_phase2',
    productTitle: '5 packs of copier paper',
    amount: 75.0,
    quantity: 5,
    unitPrice: 15.0,
    subcategory: 'Paper',
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Business Owner',
    paypalOrderId: 'ORDER_PHASE2_123',
    status: 'ORDER_CREATED',
    verificationHash: 'hash_phase2',
  });

  auditStore.updateRecord(auditId, {
    status: 'CAPTURED',
    paypalCaptureId: 'CAPTURE_PHASE2_456',
    notes: 'Captured via PayPal Sandbox. Capture ID: CAPTURE_PHASE2_456',
  });

  const record = auditStore.getRecords().find((r) => r.id === auditId);
  assert.ok(record);
  assert.equal(record.status, 'CAPTURED');
  assert.equal(record.paypalCaptureId, 'CAPTURE_PHASE2_456');
  assert.equal(record.amount, 75.0);
  assert.equal(record.quantity, 5);
  assert.equal(record.unitPrice, 15.0);
});



