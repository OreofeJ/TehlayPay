import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsService } from './analyticsService.ts';
import { auditStore } from './auditStore.ts';
import type {
  PurchaseRequirements,
  EvaluatedProduct,
  AuditRecord,
} from '../src/shared/types.ts';

test.beforeEach(() => {
  auditStore.clear();
});

test('1. Empty procurement history produces a valid empty state without error', () => {
  const result = AnalyticsService.generateOverview();
  assert.equal(result.kpis.totalRequests.value, 0);
  assert.equal(result.kpis.estimatedValueByCurrency.length, 0);
  assert.equal(result.kpis.approvedValueByCurrency.length, 0);
  assert.equal(result.kpis.capturedValueByCurrency.length, 0);
  assert.equal(result.kpis.totalEvaluationsCount, 0);
  assert.equal(result.decisionDistribution.total, 0);
  assert.equal(result.recentActivity.length, 0);
  assert.ok(result.dataQuality.warnings.some((w) => w.includes('No procurement activity')));
});

test('2. Procurement request counts are correct', () => {
  const req1: PurchaseRequirements = {
    id: 'req_001',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Dev laptop',
    createdAt: new Date().toISOString(),
  };
  const req2: PurchaseRequirements = {
    id: 'req_002',
    category: 'office_supplies',
    targetItem: 'paper',
    maxBudget: 60,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Copier paper',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(req1);
  auditStore.saveRequirements(req2);

  const result = AnalyticsService.generateOverview();
  assert.equal(result.kpis.totalRequests.value, 2);
});

test('3. PASS, BLOCKED and REVIEW counts are correct across candidate evaluations', () => {
  const createMockEval = (id: string, status: 'PASS' | 'BLOCKED' | 'REVIEW'): EvaluatedProduct => ({
    id,
    title: `Mock item ${id}`,
    merchant: 'Test Merchant',
    price: 100,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com',
    sku: `SKU-${id}`,
    availability: 'IN_STOCK',
    evaluation: {
      productId: id,
      overallStatus: status,
      summary: `Evaluated as ${status}`,
      checks: [
        {
          ruleName: 'Budget Check',
          status: status === 'BLOCKED' ? 'FAIL' : status === 'REVIEW' ? 'UNKNOWN' : 'PASS',
          mandatory: true,
          evidence: `Evidence for ${status}`,
        },
      ],
      evaluatedAt: new Date().toISOString(),
      resolvedCategory: 'computing',
    },
  });

  const evals = [
    createMockEval('p1', 'PASS'),
    createMockEval('p2', 'PASS'),
    createMockEval('p3', 'BLOCKED'),
    createMockEval('p4', 'REVIEW'),
  ];

  auditStore.recordEvaluations('req_001', evals);

  const result = AnalyticsService.generateOverview();
  assert.equal(result.kpis.passEvaluationsCount, 2);
  assert.equal(result.kpis.blockedEvaluationsCount.value, 1);
  assert.equal(result.kpis.reviewEvaluationsCount.value, 1);
  assert.equal(result.decisionDistribution.pass.count, 2);
  assert.equal(result.decisionDistribution.blocked.count, 1);
  assert.equal(result.decisionDistribution.review.count, 1);
  assert.equal(result.decisionDistribution.total, 4);
});

test('4. A single request is not double-counted because it has multiple products or evaluation events', () => {
  const req: PurchaseRequirements = {
    id: 'req_multi',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Single requirement',
    createdAt: new Date().toISOString(),
  };
  auditStore.saveRequirements(req);

  // Multiple candidate evaluations for this same requirement
  const mockProd = (id: string): EvaluatedProduct => ({
    id,
    title: `Item ${id}`,
    merchant: 'Merchant',
    price: 200,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com',
    sku: id,
    availability: 'IN_STOCK',
    evaluation: {
      productId: id,
      overallStatus: 'PASS',
      summary: 'Pass',
      checks: [],
      evaluatedAt: new Date().toISOString(),
    },
  });

  auditStore.recordEvaluations('req_multi', [mockProd('p1'), mockProd('p2'), mockProd('p3')]);

  // Multiple audit records for this same requirement
  auditStore.appendRecord({
    id: 'audit_init',
    timestamp: new Date().toISOString(),
    requirementId: 'req_multi',
    productId: 'N/A',
    productTitle: 'Intent',
    amount: 800,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: null,
    status: 'PENDING_APPROVAL',
    verificationHash: 'hash1',
  });
  auditStore.appendRecord({
    id: 'audit_order',
    timestamp: new Date().toISOString(),
    requirementId: 'req_multi',
    productId: 'p1',
    productTitle: 'Item p1',
    amount: 599,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Owner',
    status: 'ORDER_CREATED',
    verificationHash: 'hash2',
  });

  const result = AnalyticsService.generateOverview();
  // Must still be exactly 1 request
  assert.equal(result.kpis.totalRequests.value, 1);
});

test('5. Estimated procurement value is calculated correctly when price and quantity are reliable', () => {
  const req1: PurchaseRequirements = {
    id: 'req_est_1',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Est 1',
    createdAt: new Date().toISOString(),
  };
  const req2: PurchaseRequirements = {
    id: 'req_est_2',
    category: 'office_supplies',
    targetItem: 'paper',
    maxBudget: 60,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Est 2',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(req1);
  auditStore.saveRequirements(req2);

  const result = AnalyticsService.generateOverview();
  const usdMetric = result.kpis.estimatedValueByCurrency.find((c) => c.currency === 'USD');
  assert.ok(usdMetric);
  assert.equal(usdMetric.amount, 860);
  assert.equal(usdMetric.recordCount, 2);
});

test('6. Missing prices or non-positive budgets are excluded from monetary totals', () => {
  const reqValid: PurchaseRequirements = {
    id: 'req_valid',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Valid',
    createdAt: new Date().toISOString(),
  };
  const reqMissingPrice: PurchaseRequirements = {
    id: 'req_invalid',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 0, // Invalid/missing
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Invalid',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(reqValid);
  auditStore.saveRequirements(reqMissingPrice);

  const result = AnalyticsService.generateOverview();
  const usdMetric = result.kpis.estimatedValueByCurrency.find((c) => c.currency === 'USD');
  assert.ok(usdMetric);
  assert.equal(usdMetric.amount, 800);
  assert.equal(usdMetric.recordCount, 1);
  assert.ok(result.dataQuality.missingPriceRecordsCount > 0);
});

test('7. Different currencies are not incorrectly combined into a single total', () => {
  const reqUsd: PurchaseRequirements = {
    id: 'req_usd',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'USD',
    createdAt: new Date().toISOString(),
  };
  const reqEur: PurchaseRequirements = {
    id: 'req_eur',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 750,
    currency: 'EUR',
    allowedConditions: ['new'],
    extractedReasoning: 'EUR',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(reqUsd);
  auditStore.saveRequirements(reqEur);

  const result = AnalyticsService.generateOverview();
  // Must have separate totals for USD and EUR
  assert.equal(result.kpis.estimatedValueByCurrency.length, 2);
  const usd = result.kpis.estimatedValueByCurrency.find((c) => c.currency === 'USD');
  const eur = result.kpis.estimatedValueByCurrency.find((c) => c.currency === 'EUR');
  assert.ok(usd && eur);
  assert.equal(usd.amount, 800);
  assert.equal(eur.amount, 750);
  assert.ok(result.dataQuality.multiCurrencyPresent);
});

test('8. Approved procurement value excludes unapproved requests', () => {
  // Unapproved intent trace (PENDING_APPROVAL)
  auditStore.appendRecord({
    id: 'rec_pending',
    timestamp: new Date().toISOString(),
    requirementId: 'req_1',
    productId: 'N/A',
    productTitle: 'Intent',
    amount: 800,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: null,
    status: 'PENDING_APPROVAL',
    verificationHash: 'h1',
  });

  // Approved order (ORDER_CREATED with explicit approval)
  auditStore.appendRecord({
    id: 'rec_approved',
    timestamp: new Date().toISOString(),
    requirementId: 'req_1',
    productId: 'prod_pass',
    productTitle: 'Approved laptop',
    amount: 599.99,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Owner',
    status: 'ORDER_CREATED',
    verificationHash: 'h2',
  });

  const result = AnalyticsService.generateOverview();
  const approvedUsd = result.kpis.approvedValueByCurrency.find((c) => c.currency === 'USD');
  assert.ok(approvedUsd);
  assert.equal(approvedUsd.amount, 599.99);
  assert.equal(approvedUsd.recordCount, 1);
});

test('9. Captured payment value includes only verified successful PayPal captures', () => {
  auditStore.appendRecord({
    id: 'rec_captured',
    timestamp: new Date().toISOString(),
    requirementId: 'req_1',
    productId: 'prod_captured',
    productTitle: 'Captured item',
    amount: 450,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Owner',
    paypalOrderId: 'ORDER-123',
    paypalCaptureId: 'CAPTURE-789',
    status: 'CAPTURED',
    verificationHash: 'h_cap',
  });

  const result = AnalyticsService.generateOverview();
  const capUsd = result.kpis.capturedValueByCurrency.find((c) => c.currency === 'USD');
  assert.ok(capUsd);
  assert.equal(capUsd.amount, 450);
  assert.equal(capUsd.recordCount, 1);
});

test('10. Pending PayPal orders are not counted as captured payments', () => {
  auditStore.appendRecord({
    id: 'rec_order_created',
    timestamp: new Date().toISOString(),
    requirementId: 'req_1',
    productId: 'prod_pending',
    productTitle: 'Pending PayPal order',
    amount: 700,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Owner',
    paypalOrderId: 'ORDER-PENDING',
    status: 'ORDER_CREATED', // Not captured
    verificationHash: 'h_ord',
  });

  const result = AnalyticsService.generateOverview();
  // Captured value must be 0
  assert.equal(result.kpis.capturedValueByCurrency.length, 0);
});

test('11. Failed and cancelled transactions are excluded from captured payment totals', () => {
  auditStore.appendRecord({
    id: 'rec_failed',
    timestamp: new Date().toISOString(),
    requirementId: 'req_1',
    productId: 'prod_failed',
    productTitle: 'Failed item',
    amount: 300,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Owner',
    status: 'FAILED',
    verificationHash: 'h_fail',
  });
  auditStore.appendRecord({
    id: 'rec_rejected',
    timestamp: new Date().toISOString(),
    requirementId: 'req_1',
    productId: 'prod_rejected',
    productTitle: 'Rejected item',
    amount: 250,
    currency: 'USD',
    policyStatus: 'BLOCKED',
    approvalGrantedBy: null,
    status: 'REJECTED',
    verificationHash: 'h_rej',
  });

  const result = AnalyticsService.generateOverview();
  assert.equal(result.kpis.capturedValueByCurrency.length, 0);
});

test('12. Category totals are correctly calculated across standard categories', () => {
  const reqComp: PurchaseRequirements = {
    id: 'req_c',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Computing',
    createdAt: new Date().toISOString(),
  };
  const reqTools: PurchaseRequirements = {
    id: 'req_t',
    category: 'tools_hardware',
    targetItem: 'drill',
    maxBudget: 200,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Tools',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(reqComp);
  auditStore.saveRequirements(reqTools);

  const result = AnalyticsService.generateOverview();
  const comp = result.categories.find((c) => c.category === 'computing');
  const tools = result.categories.find((c) => c.category === 'tools_hardware');
  assert.ok(comp && tools);
  assert.equal(comp.totalRequests, 1);
  assert.equal(comp.estimatedValueByCurrency['USD'], 800);
  assert.equal(tools.totalRequests, 1);
  assert.equal(tools.estimatedValueByCurrency['USD'], 200);
});

test('13. Unclassified records are not silently assigned to an unrelated specialist category', () => {
  const reqMisc: PurchaseRequirements = {
    id: 'req_misc',
    category: 'general',
    targetItem: 'miscellaneous office mystery item',
    maxBudget: 150,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'General',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(reqMisc);

  const result = AnalyticsService.generateOverview();
  const genCat = result.categories.find((c) => c.category === 'general');
  assert.ok(genCat);
  assert.equal(genCat.totalRequests, 1);
  assert.equal(genCat.estimatedValueByCurrency['USD'], 150);

  // Must not be in computing or furniture
  const comp = result.categories.find((c) => c.category === 'computing');
  assert.equal(comp?.totalRequests, 0);
});

test('14. Date filters return only records within the requested reporting period', () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const lastMonthIso = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

  const reqToday: PurchaseRequirements = {
    id: 'req_today',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Today',
    createdAt: todayIso,
  };
  const reqOld: PurchaseRequirements = {
    id: 'req_old',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 500,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Old',
    createdAt: lastMonthIso,
  };

  auditStore.saveRequirements(reqToday);
  auditStore.saveRequirements(reqOld);

  // Filter: 7 days
  const result7d = AnalyticsService.generateOverview({ period: '7d' });
  assert.equal(result7d.kpis.totalRequests.value, 1);

  // Filter: all time
  const resultAll = AnalyticsService.generateOverview({ period: 'all' });
  assert.equal(resultAll.kpis.totalRequests.value, 2);
});

test('15. Previous-period comparisons use equivalent date ranges', () => {
  const now = new Date();
  const currentWindowIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const previousWindowIso = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const reqCurrent: PurchaseRequirements = {
    id: 'req_curr',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Current',
    createdAt: currentWindowIso,
  };
  const reqPrev: PurchaseRequirements = {
    id: 'req_prev',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Prev',
    createdAt: previousWindowIso,
  };

  auditStore.saveRequirements(reqCurrent);
  auditStore.saveRequirements(reqPrev);

  // 7-day period: current window [now - 7d, now], previous window [now - 14d, now - 7d]
  const result = AnalyticsService.generateOverview({ period: '7d' });
  assert.equal(result.kpis.totalRequests.value, 1);
  assert.equal(result.kpis.totalRequests.previousValue, 1);
  assert.equal(result.kpis.totalRequests.changePercentage, 0);
  assert.equal(result.kpis.totalRequests.hasSufficientHistory, true);
});

test('16. Missing timestamps do not create invented dates and are flagged', () => {
  const reqInvalidDate: PurchaseRequirements = {
    id: 'req_no_date',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'No date',
    createdAt: 'invalid-date-string',
  };

  auditStore.saveRequirements(reqInvalidDate);

  const result = AnalyticsService.generateOverview({ period: '7d' });
  // Invalid date should not match a date filter
  assert.equal(result.kpis.totalRequests.value, 0);
  assert.ok(result.dataQuality.missingTimestampRecordsCount > 0);
});

test('17. Policy blocking reasons and review reasons are correctly aggregated', () => {
  const blockedProduct: EvaluatedProduct = {
    id: 'p_block_test',
    title: 'Expensive Laptop',
    merchant: 'Merchant',
    price: 1200,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com',
    sku: 'SKU-EXP',
    availability: 'IN_STOCK',
    evaluation: {
      productId: 'p_block_test',
      overallStatus: 'BLOCKED',
      summary: 'BLOCKED',
      checks: [
        {
          ruleName: 'Maximum Budget Limit',
          status: 'FAIL',
          mandatory: true,
          evidence: '$1200 > $800 ceiling',
        },
      ],
      evaluatedAt: new Date().toISOString(),
    },
  };

  const reviewProduct: EvaluatedProduct = {
    id: 'p_rev_test',
    title: 'Mystery Spec Laptop',
    merchant: 'Merchant',
    price: 600,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: 512,
    productUrl: 'https://example.com',
    sku: 'SKU-MYS',
    availability: 'IN_STOCK',
    evaluation: {
      productId: 'p_rev_test',
      overallStatus: 'REVIEW',
      summary: 'REVIEW',
      checks: [
        {
          ruleName: 'RAM Specification Verification',
          status: 'UNKNOWN',
          mandatory: true,
          evidence: 'RAM unlisted in supplier catalog',
        },
      ],
      evaluatedAt: new Date().toISOString(),
    },
  };

  auditStore.recordEvaluations('req_1', [blockedProduct, reviewProduct]);

  const result = AnalyticsService.generateOverview();
  const topBlock = result.complianceInsights.topBlockingRules[0];
  assert.ok(topBlock);
  assert.equal(topBlock.ruleName, 'Maximum Budget Limit');
  assert.equal(topBlock.violationCount, 1);

  const topReview = result.complianceInsights.topReviewReasons[0];
  assert.ok(topReview);
  assert.equal(topReview.reason, 'RAM Specification Verification');
  assert.equal(topReview.count, 1);
});

test('18. Dashboard drill-down filtering by currency or category returns the relevant records', () => {
  const reqComp: PurchaseRequirements = {
    id: 'req_c',
    category: 'computing',
    targetItem: 'laptop',
    maxBudget: 800,
    currency: 'USD',
    allowedConditions: ['new'],
    extractedReasoning: 'Computing',
    createdAt: new Date().toISOString(),
  };
  const reqPaper: PurchaseRequirements = {
    id: 'req_p',
    category: 'office_supplies',
    targetItem: 'paper',
    maxBudget: 60,
    currency: 'EUR',
    allowedConditions: ['new'],
    extractedReasoning: 'Paper',
    createdAt: new Date().toISOString(),
  };

  auditStore.saveRequirements(reqComp);
  auditStore.saveRequirements(reqPaper);

  // Drill down by category: computing
  const compOverview = AnalyticsService.generateOverview({ category: 'computing' });
  assert.equal(compOverview.kpis.totalRequests.value, 1);

  // Drill down by currency: EUR
  const eurOverview = AnalyticsService.generateOverview({ currency: 'EUR' });
  assert.equal(eurOverview.kpis.totalRequests.value, 1);
});

test('19. CSV exports generate standard RFC 4180 format with correct headers and escaping', () => {
  const record: AuditRecord = {
    id: 'audit_csv',
    timestamp: '2026-11-09T10:00:00.000Z',
    requirementId: 'req_1',
    productId: 'prod_1',
    productTitle: 'Special "Laptop", 16GB',
    amount: 599.99,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: 'Owner',
    status: 'ORDER_CREATED',
    verificationHash: 'h_csv',
    notes: 'Comma, and "quotes" handled',
  };

  auditStore.appendRecord(record);

  const overview = AnalyticsService.generateOverview();
  const csv = AnalyticsService.generateCsvExport(overview.recentActivity);

  assert.ok(csv.startsWith('Date,Event Type,Requirement ID,Category'));
  assert.ok(csv.includes('"Special ""Laptop"", 16GB"'));
  assert.ok(csv.includes('599.99'));
  assert.ok(csv.includes('USD'));
});

test('20. Analytics calculations do not mutate audit records or requirements', () => {
  const record: AuditRecord = {
    id: 'audit_immut',
    timestamp: new Date().toISOString(),
    requirementId: 'req_immut',
    productId: 'prod_immut',
    productTitle: 'Original Title',
    amount: 500,
    currency: 'USD',
    policyStatus: 'PASS',
    approvalGrantedBy: null,
    status: 'PENDING_APPROVAL',
    verificationHash: 'h_immut',
  };

  auditStore.appendRecord(record);
  const beforeRecords = JSON.stringify(auditStore.getRecords());

  // Run analytics calculation
  AnalyticsService.generateOverview();

  const afterRecords = JSON.stringify(auditStore.getRecords());
  assert.equal(beforeRecords, afterRecords);
});
