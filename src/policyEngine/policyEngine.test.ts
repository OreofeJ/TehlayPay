import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductPolicy } from './policyEngine.ts';
import type { PurchaseRequirements, NormalizedProduct } from '../shared/types.ts';
import {
  classifyCategory,
  resolveClassification,
  getCategoryDisplayName,
  isComputingCategory,
  isConsumableCategory,
  extractDisplaySpecs,
} from '../shared/categories.ts';

// Standard demo policy:
// "A new laptop for software development, costing no more than USD 800, with at least 16 GB RAM and no refurbished products."
const devLaptopPolicy: PurchaseRequirements = {
  id: 'pol_dev_laptop_001',
  category: 'laptop',
  targetItem: 'laptop for software development',
  maxBudget: 800.0,
  currency: 'USD',
  allowedConditions: ['new'],
  minRamGb: 16,
  extractedReasoning: 'New dev laptop, max $800, min 16GB RAM, no refurbished.',
  createdAt: new Date().toISOString(),
};

test('1. Compliant new laptop under budget with sufficient RAM returns PASS', () => {
  const product: NormalizedProduct = {
    id: 'prod_pass_acer',
    title: 'Acer Aspire 5 15.6" (Intel i5-1335U, 16GB RAM, 512GB SSD)',
    merchant: 'B&H Photo Video',
    price: 649.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/acer',
    sku: 'ACER-A5-16G',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks.every((c) => c.status === 'PASS'), true);

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.match(budgetCheck!.evidence, /649\.99 <= allowed budget of USD 800\.00/);

  const ramCheck = result.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.match(ramCheck!.evidence, /16 GB meets or exceeds mandatory requirement of 16 GB/);
});

test('2. Over-budget product returns BLOCKED with evidence', () => {
  const product: NormalizedProduct = {
    id: 'prod_fail_budget',
    title: 'Lenovo ThinkPad T14s (16GB RAM, 512GB SSD)',
    merchant: 'Lenovo Direct',
    price: 920.0,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/lenovo',
    sku: 'LNV-T14S',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  assert.equal(result.overallStatus, 'BLOCKED');

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'FAIL');
  assert.match(budgetCheck!.evidence, /USD 920\.00 > allowed budget of USD 800\.00/);
});

test('3. Refurbished product when only "new" is permitted returns BLOCKED', () => {
  const product: NormalizedProduct = {
    id: 'prod_fail_condition',
    title: 'HP EliteBook 840 G8 - Certified Refurbished',
    merchant: 'Refurbished Tech Store',
    price: 520.0,
    currency: 'USD',
    condition: 'refurbished',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/hp-refurb',
    sku: 'HP-840-REF',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  assert.equal(result.overallStatus, 'BLOCKED');

  const conditionCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(conditionCheck?.status, 'FAIL');
  assert.match(conditionCheck!.evidence, /Disallowed condition: listing states "refurbished"/);
});

test('4. Product with missing RAM returns REVIEW (no hard violation)', () => {
  const product: NormalizedProduct = {
    id: 'prod_review_ram',
    title: 'ASUS Vivobook Slim (Spec sheet missing RAM)',
    merchant: 'Newegg',
    price: 599.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: 512,
    productUrl: 'https://example.com/asus-noram',
    sku: 'ASUS-NORAM',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  assert.equal(result.overallStatus, 'REVIEW');

  const ramCheck = result.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(ramCheck?.status, 'UNKNOWN');
  assert.match(ramCheck!.evidence, /RAM specification is absent or ambiguous/);

  // Other verified rules still pass individually
  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'PASS');
});

test('5. Product with missing price returns REVIEW', () => {
  const product: NormalizedProduct = {
    id: 'prod_review_price',
    title: 'Dell Latitude 3540 (Contact Merchant for Price)',
    merchant: 'Dell Partner',
    price: null,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/dell-call',
    sku: 'DELL-NOPRICE',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  assert.equal(result.overallStatus, 'REVIEW');

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'UNKNOWN');
  assert.match(budgetCheck!.evidence, /Price is missing, null, or invalid/);
});

test('6. Product with different currency returns BLOCKED', () => {
  const product: NormalizedProduct = {
    id: 'prod_fail_currency',
    title: 'Fujitsu Lifebook (Eurozone listing)',
    merchant: 'Amazon EU',
    price: 680.0,
    currency: 'EUR',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/fujitsu-eur',
    sku: 'FUJ-EUR-680',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  assert.equal(result.overallStatus, 'BLOCKED');

  const currencyCheck = result.checks.find((c) => c.ruleName === 'Currency Verification');
  assert.equal(currencyCheck?.status, 'FAIL');
  assert.match(currencyCheck!.evidence, /Currency mismatch: listing is priced in "EUR", but policy requires "USD"/);
});

test('7. Precedence Check: Missing RAM on an over-budget product must be BLOCKED, not REVIEW', () => {
  const product: NormalizedProduct = {
    id: 'prod_precedence_violation',
    title: 'Ultra Gaming Laptop (Over budget AND missing RAM spec)',
    merchant: 'Alienware Outlet',
    price: 1450.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: 1024,
    productUrl: 'https://example.com/alienware',
    sku: 'ALW-1450',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, devLaptopPolicy);

  // Hard violation takes precedence: cannot be approved regardless of unverified RAM
  assert.equal(result.overallStatus, 'BLOCKED');

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  const ramCheck = result.checks.find((c) => c.ruleName === 'Minimum RAM Specification');

  assert.equal(budgetCheck?.status, 'FAIL');
  assert.equal(ramCheck?.status, 'UNKNOWN');
});

test('8. Budget Regression: Lenovo ThinkPad costing $1,099.99 is strictly BLOCKED under $800 maximum budget', () => {
  const lenovoProduct: NormalizedProduct = {
    id: 'prod_lenovo_thinkpad_e16',
    title: 'Lenovo ThinkPad E16 Gen 3',
    merchant: 'Best Buy',
    price: 1099.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/thinkpad-e16',
    sku: 'THINKPAD-E16-GEN3',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(lenovoProduct, devLaptopPolicy);

  assert.equal(result.overallStatus, 'BLOCKED');
  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'FAIL');
  assert.match(budgetCheck!.evidence, /USD 1099\.99 > allowed budget of USD 800\.00/);
});

test('9. Fail-Closed Policy: Missing, non-positive or invalid policy budget strictly results in BLOCKED', () => {
  const product: NormalizedProduct = {
    id: 'prod_test_budget_fail_closed',
    title: 'Test Laptop',
    merchant: 'Test Merchant',
    price: 500.0,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/test',
    sku: 'TEST-SKU',
    availability: 'IN_STOCK',
  };

  // Policy with invalid budget
  const invalidPolicy = {
    ...devLaptopPolicy,
    maxBudget: NaN as any,
  };

  const result = evaluateProductPolicy(product, invalidPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'FAIL');
  assert.match(budgetCheck!.evidence, /maximum budget ceiling is missing, non-positive, or invalid/);
});

test('10. Non-computing product without RAM requirement passes without requiring RAM spec', () => {
  const paperPolicy: PurchaseRequirements = {
    id: 'pol_paper_001',
    category: 'office supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 50.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Paper procurement, max $50, new only, no RAM constraint.',
    createdAt: new Date().toISOString(),
  };

  const paperProduct: NormalizedProduct = {
    id: 'prod_paper_staples',
    title: 'Multi-Use Printer & Copy Paper (8.5 x 11, 500 Sheets)',
    merchant: 'Staples',
    price: 19.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null, // Ordinary product without RAM
    storageGb: null,
    productUrl: 'https://example.com/paper',
    sku: 'STAPLES-PAPER-500',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(paperProduct, paperPolicy);
  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.checks.length, 3); // Currency, Budget, Condition (no RAM rule)
  const ramRule = result.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(ramRule, undefined);
});

test('11. Non-computing product with explicit RAM constraint is held for REVIEW when RAM is absent', () => {
  const policyWithRam: PurchaseRequirements = {
    id: 'pol_explicit_ram',
    category: 'office supplies',
    targetItem: 'smart display stationery',
    maxBudget: 200.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 8,
    extractedReasoning: 'Explicit 8GB RAM requirement specified by user.',
    createdAt: new Date().toISOString(),
  };

  const itemWithoutRam: NormalizedProduct = {
    id: 'prod_item_noram',
    title: 'Standard Paper Pack',
    merchant: 'Office Depot',
    price: 35.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper',
    sku: 'OD-35',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(itemWithoutRam, policyWithRam);
  assert.equal(result.overallStatus, 'REVIEW');
  const ramRule = result.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(ramRule?.status, 'UNKNOWN');
  assert.equal(ramRule?.mandatory, true);
});

test('12. Non-computing product exceeding budget is strictly BLOCKED', () => {
  const furniturePolicy: PurchaseRequirements = {
    id: 'pol_furniture_001',
    category: 'office furniture',
    targetItem: 'office furniture',
    maxBudget: 300.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Furniture under $300.',
    createdAt: new Date().toISOString(),
  };

  const expensiveDesk: NormalizedProduct = {
    id: 'prod_exec_desk',
    title: 'Executive Solid Oak Standing Desk',
    merchant: 'Steelcase Direct',
    price: 750.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/desk',
    sku: 'STCASE-DESK',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(expensiveDesk, furniturePolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'FAIL');
});

test('13. Non-computing product with disallowed condition is strictly BLOCKED', () => {
  const toolsPolicy: PurchaseRequirements = {
    id: 'pol_tools_001',
    category: 'maintenance tools',
    targetItem: 'maintenance tools and hardware',
    maxBudget: 250.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'New tools only, max $250.',
    createdAt: new Date().toISOString(),
  };

  const usedDrill: NormalizedProduct = {
    id: 'prod_used_drill',
    title: 'Cordless Brushless Hammer Drill Kit (Used - Good)',
    merchant: 'Tool Outlet',
    price: 120.0,
    currency: 'USD',
    condition: 'used',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/drill',
    sku: 'TOOL-USED-DRILL',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(usedDrill, toolsPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const conditionCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(conditionCheck?.status, 'FAIL');
});

test('14. Category Classification Helper maps all categories and detects consumables', () => {
  assert.equal(classifyCategory('Laptop for development'), 'computing');
  assert.equal(classifyCategory('ThinkPad E16'), 'computing');
  assert.equal(classifyCategory('Printer and copier paper'), 'office_supplies');
  assert.equal(classifyCategory('HP Toner Cartridge 58A'), 'printer_consumables');
  assert.equal(classifyCategory('Commercial cleaning supplies'), 'cleaning_supplies');
  assert.equal(classifyCategory('Maintenance tools and hardware'), 'tools_hardware');
  assert.equal(classifyCategory('Ergonomic office chair'), 'furniture');
  assert.equal(classifyCategory('Generic industrial widget'), 'general');

  assert.equal(isComputingCategory('laptop'), true);
  assert.equal(isComputingCategory('printer paper'), false);
  assert.equal(isComputingCategory('cleaning disinfectant'), false);

  assert.equal(isConsumableCategory('printer paper'), true);
  assert.equal(isConsumableCategory('toner cartridge'), true);
  assert.equal(isConsumableCategory('cleaning supplies'), true);
  assert.equal(isConsumableCategory('laptop'), false);
  assert.equal(isConsumableCategory('office furniture'), false);
});

test('15. Target Specification Extraction formats computing vs non-computing properly', () => {
  // Constrained laptop
  const laptopSpecs = extractDisplaySpecs(devLaptopPolicy);
  assert.ok(laptopSpecs.some((s) => s.label === 'RAM' && s.value === '16 GB Min' && s.isConstrained));

  // Unconstrained laptop
  const unconstrainedLaptop: PurchaseRequirements = {
    ...devLaptopPolicy,
    minRamGb: 0,
  };
  const unconstrainedSpecs = extractDisplaySpecs(unconstrainedLaptop);
  assert.ok(unconstrainedSpecs.some((s) => s.label === 'RAM' && s.value === 'Unconstrained' && !s.isConstrained));

  // Non-computing paper with targetSpecs
  const paperPolicyWithSpecs: PurchaseRequirements = {
    id: 'pol_paper_specs',
    category: 'office_supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 60.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    targetSpecs: {
      Size: 'Letter (8.5" x 11")',
      Weight: '20 lb / 75 GSM',
    },
    extractedReasoning: 'Paper with specs.',
    createdAt: new Date().toISOString(),
  };
  const paperSpecs = extractDisplaySpecs(paperPolicyWithSpecs);
  assert.equal(paperSpecs.length, 2);
  assert.ok(paperSpecs.some((s) => s.label === 'Size' && s.value === 'Letter (8.5" x 11")'));
  assert.ok(paperSpecs.every((s) => s.label !== 'RAM'));
});

test('16. Consumables policy strictly enforces new condition and blocks refurbished listings', () => {
  const cleaningPolicy: PurchaseRequirements = {
    id: 'pol_clean_001',
    category: 'cleaning_supplies',
    targetItem: 'commercial disinfectant liquid',
    maxBudget: 150.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Cleaning supplies must be new.',
    createdAt: new Date().toISOString(),
  };

  const refurbishedLiquid: NormalizedProduct = {
    id: 'prod_refurb_liquid',
    title: 'Disinfectant Solution 1 Gallon (Refurbished Bottle)',
    merchant: 'CleanMart',
    price: 45.0,
    currency: 'USD',
    condition: 'refurbished',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/clean',
    sku: 'CLEAN-REFURB',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(refurbishedLiquid, cleaningPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const condCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(condCheck?.status, 'FAIL');
  assert.match(condCheck!.evidence, /Disallowed condition.*listing states "refurbished"/);
});

test('17. Security: Direct policy request for copier paper with allowedConditions: ["refurbished"] is BLOCKED for refurbished item', () => {
  // Manipulated client policy attempting to permit refurbished paper
  const manipulatedPaperPolicy: PurchaseRequirements = {
    id: 'pol_malicious_paper',
    category: 'office_supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new', 'refurbished', 'used'], // Malicious client override
    minRamGb: 0,
    extractedReasoning: 'Client attempting to permit refurbished consumables.',
    createdAt: new Date().toISOString(),
  };

  const refurbishedPaper: NormalizedProduct = {
    id: 'prod_refurb_paper',
    title: 'Xerox Multi-Use Copier Paper 500 Sheets (Refurbished/Opened Box)',
    merchant: 'Discount Office Outlet',
    price: 15.0,
    currency: 'USD',
    condition: 'refurbished',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-refurb',
    sku: 'XEROX-REFURB',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(refurbishedPaper, manipulatedPaperPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const condCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(condCheck?.status, 'FAIL');
  assert.match(condCheck!.evidence, /Disallowed condition for consumable/);
});

test('18. Security: category: "general" but targetItem: "copier paper" still strictly enforces New Only', () => {
  // Malicious/conflicting policy with category 'general' to bypass category check
  const conflictingPolicy: PurchaseRequirements = {
    id: 'pol_conflicting_paper',
    category: 'general', // Attempting to disguise consumable as general
    targetItem: 'copier paper 8.5x11',
    maxBudget: 50.0,
    currency: 'USD',
    allowedConditions: ['refurbished', 'used'], // Attempting to allow used/refurbished
    minRamGb: 0,
    extractedReasoning: 'Conflicting category test.',
    createdAt: new Date().toISOString(),
  };

  const usedPaper: NormalizedProduct = {
    id: 'prod_used_paper',
    title: 'Copier Paper Ream (Used - Open Box)',
    merchant: 'Liquidation Mart',
    price: 10.0,
    currency: 'USD',
    condition: 'used',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/used-paper',
    sku: 'USED-PAPER',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(usedPaper, conflictingPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const condCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(condCheck?.status, 'FAIL');
  assert.match(condCheck!.evidence, /Disallowed condition for consumable/);
});

test('19. New consumables are fully eligible for PASS when complying with budget and currency', () => {
  const paperPolicy: PurchaseRequirements = {
    id: 'pol_compliant_paper',
    category: 'office_supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 50.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Compliant paper policy.',
    createdAt: new Date().toISOString(),
  };

  const newPaper: NormalizedProduct = {
    id: 'prod_new_paper_pass',
    title: 'Hammermill Premium Color Copy Paper 8.5 x 11 (Brand New)',
    merchant: 'Staples Business',
    price: 24.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/hammermill',
    sku: 'HAMMER-NEW',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(newPaper, paperPolicy);
  assert.equal(result.overallStatus, 'PASS');
  const condCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(condCheck?.status, 'PASS');
  assert.match(condCheck!.evidence, /Condition verified/);
});

test('20. Computing products retain existing permitted-condition behaviour (e.g. refurbished allowed when opted in)', () => {
  const refurbishedLaptopPolicy: PurchaseRequirements = {
    ...devLaptopPolicy,
    id: 'pol_refurb_laptop',
    allowedConditions: ['new', 'refurbished'],
  };

  const refurbishedLaptop: NormalizedProduct = {
    id: 'prod_refurb_laptop_pass',
    title: 'HP EliteBook 840 G8 14" (16GB RAM, 512GB SSD, Refurbished)',
    merchant: 'HP Certified Refurbished',
    price: 699.0,
    currency: 'USD',
    condition: 'refurbished',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/hp-refurb',
    sku: 'HP-REFURB-840',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(refurbishedLaptop, refurbishedLaptopPolicy);
  assert.equal(result.overallStatus, 'PASS');
  const condCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(condCheck?.status, 'PASS');
});

// ============================================================================
// Phase 1.5: Dynamic Category Classification & Safe General Fallback Tests
// ============================================================================

test('21. Regression: Samsung tablets classify as computing, not furniture', () => {
  const query = 'Samsung tablets';
  const category = classifyCategory(query);
  assert.equal(category, 'computing');
  assert.notEqual(category, 'furniture');

  const resolved = resolveClassification({ targetItem: query });
  assert.equal(resolved.category, 'computing');
  assert.equal(resolved.subcategory, 'Tablets');
  assert.equal(resolved.fullDisplayName, 'Computing & IT → Tablets');
});

test('22. Regression: Samsung Galaxy Tab product titles resolve to the Tablets subcategory', () => {
  const productTitle = 'Samsung Galaxy Tab A9+ 11" 64GB Android Tablet (Wi-Fi, Graphite)';
  const resolved = resolveClassification({ productTitle });
  assert.equal(resolved.category, 'computing');
  assert.equal(resolved.subcategory, 'Tablets');
  assert.equal(resolved.fullDisplayName, 'Computing & IT → Tablets');
});

test('23. Regression: Smartphones classify as computing', () => {
  const prompt = 'Find corporate smartphones for field sales';
  const resolved = resolveClassification({ targetItem: prompt });
  assert.equal(resolved.category, 'computing');
  assert.equal(resolved.subcategory, 'Smartphones');
  assert.equal(resolved.fullDisplayName, 'Computing & IT → Smartphones');

  const phoneProduct = resolveClassification({
    productTitle: 'Apple iPhone 15 Pro 128GB Black Titanium (Unlocked)',
  });
  assert.equal(phoneProduct.category, 'computing');
  assert.equal(phoneProduct.subcategory, 'Smartphones');
});

test('24. Regression: Monitors classify as computing', () => {
  const resolved = resolveClassification({ targetItem: 'Dell UltraSharp 27 4K USB-C Hub Monitor' });
  assert.equal(resolved.category, 'computing');
  assert.equal(resolved.subcategory, 'Monitors');
  assert.equal(resolved.fullDisplayName, 'Computing & IT → Monitors');
});

test('25. Regression: Networking equipment classifies as computing', () => {
  const resolved = resolveClassification({ targetItem: 'Cisco Catalyst 1000 24-Port Gigabit Network Switch' });
  assert.equal(resolved.category, 'computing');
  assert.equal(resolved.subcategory, 'Networking');
  assert.equal(resolved.fullDisplayName, 'Computing & IT → Networking');

  const routerResolved = resolveClassification({ targetItem: 'Ubiquiti UniFi Dream Machine Pro Router' });
  assert.equal(routerResolved.category, 'computing');
  assert.equal(routerResolved.subcategory, 'Networking');
});

test('26. Regression: Existing office furniture products still classify as furniture', () => {
  assert.equal(classifyCategory('Ergonomic office chair'), 'furniture');
  assert.equal(classifyCategory('Solid wood standing desk'), 'furniture');
  assert.equal(classifyCategory('Conference room table 8ft'), 'furniture');
  assert.equal(classifyCategory('Lateral file storage cabinet'), 'furniture');

  const chairResolved = resolveClassification({ targetItem: 'Herman Miller Aeron office chair' });
  assert.equal(chairResolved.category, 'furniture');
  assert.equal(chairResolved.subcategory, 'Office Chairs');

  const deskResolved = resolveClassification({ targetItem: 'Steelcase Migration Height-Adjustable Desk' });
  assert.equal(deskResolved.category, 'furniture');
  assert.equal(deskResolved.subcategory, 'Desks');

  const tableResolved = resolveClassification({ targetItem: 'Conference Table with Cable Well' });
  assert.equal(tableResolved.category, 'furniture');
  assert.equal(tableResolved.subcategory, 'Tables');
});

test('27. Regression: Existing consumable classifications remain correct', () => {
  assert.equal(isConsumableCategory('Multi-purpose copier paper'), true);
  assert.equal(isConsumableCategory('HP LaserJet Toner Cartridge'), true);
  assert.equal(isConsumableCategory('Commercial floor cleaning liquid'), true);
  assert.equal(isConsumableCategory('Samsung tablet'), false);
  assert.equal(isConsumableCategory('Smartphone'), false);
  assert.equal(isConsumableCategory('Executive office desk'), false);
});

test('28. Regression: A clearly identified buyer target item takes precedence over an unrelated stale extracted category', () => {
  // Simulates the exact bug: buyer searches for tablets, but stale extractedCategory field says "Office Furniture"
  const resolved = resolveClassification({
    targetItem: 'Samsung Galaxy Tab S9 FE Android Tablet',
    extractedCategory: 'Office Furniture',
  });

  assert.equal(resolved.category, 'computing');
  assert.equal(resolved.subcategory, 'Tablets');
  assert.equal(resolved.fullDisplayName, 'Computing & IT → Tablets');
});

test('29. Regression: A generic or missing supplier category does not override a clear buyer/product classification', () => {
  const resolvedWithGenericCat = resolveClassification({
    targetItem: 'Samsung Galaxy Tab S9',
    productTitle: 'Samsung Galaxy Tab S9 128GB Wi-Fi Tablet',
    supplierCategory: 'General Merchandise / All Products',
  });

  assert.equal(resolvedWithGenericCat.category, 'computing');
  assert.equal(resolvedWithGenericCat.subcategory, 'Tablets');

  const resolvedWithMissingCat = resolveClassification({
    targetItem: 'Samsung Galaxy Tab S9',
    productTitle: 'Samsung Galaxy Tab S9 128GB Wi-Fi Tablet',
    supplierCategory: undefined,
  });

  assert.equal(resolvedWithMissingCat.category, 'computing');
  assert.equal(resolvedWithMissingCat.subcategory, 'Tablets');
});

test('30. Regression: An unknown product correctly falls back to general and remains searchable', () => {
  const unknownItem = 'Industrial hydraulic high-pressure filter unit';
  const resolved = resolveClassification({ targetItem: unknownItem });

  assert.equal(resolved.category, 'general');
  assert.equal(resolved.subcategory, 'Other');
  assert.equal(resolved.fullDisplayName, 'General / Other');
  assert.equal(isComputingCategory(unknownItem), false);
  assert.equal(isConsumableCategory(unknownItem), false);
});

test('31. Regression: General products are evaluated using universal policy safeguards without irrelevant RAM checks', () => {
  const generalPolicy: PurchaseRequirements = {
    id: 'pol_general_001',
    category: 'general',
    targetItem: 'Heavy-duty steel warehouse hand truck',
    maxBudget: 200.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Warehouse hand truck, budget $200.',
    createdAt: new Date().toISOString(),
  };

  const generalProduct: NormalizedProduct = {
    id: 'prod_truck_001',
    title: 'Harper Trucks Steel 800-lb Capacity Convertible Hand Truck',
    merchant: 'Grainger Industrial',
    price: 149.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/truck',
    sku: 'TRUCK-800',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(generalProduct, generalPolicy);
  assert.equal(result.overallStatus, 'PASS');

  // Verify universal rules were executed
  assert.ok(result.checks.some((c) => c.ruleName === 'Currency Verification' && c.status === 'PASS'));
  assert.ok(result.checks.some((c) => c.ruleName === 'Maximum Budget Limit' && c.status === 'PASS'));
  assert.ok(result.checks.some((c) => c.ruleName === 'Product Condition' && c.status === 'PASS'));

  // Verify NO irrelevant RAM checks were applied
  const hasRamCheck = result.checks.some((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(hasRamCheck, false);
});

test('32. Regression: Explicitly requested but unavailable critical specifications result in REVIEW', () => {
  const policyWithCriticalSpec: PurchaseRequirements = {
    id: 'pol_spec_001',
    category: 'general',
    targetItem: 'Industrial Temperature Sensor Probe',
    maxBudget: 150.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      'Accuracy Rating': '0.1C High Precision',
    },
    extractedReasoning: 'Industrial probe with explicit 0.1C high precision accuracy rating.',
    createdAt: new Date().toISOString(),
  };

  // Product listing without the critical specification in metadata
  const probeProduct: NormalizedProduct = {
    id: 'prod_probe_001',
    title: 'Standard Type K Thermocouple Stainless Sensor Probe',
    description: 'Generic industrial thermocouple probe, 2 meter cable.',
    merchant: 'Omega Engineering',
    price: 89.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/probe',
    sku: 'PROBE-K-2M',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(probeProduct, policyWithCriticalSpec);
  assert.equal(result.overallStatus, 'REVIEW');

  const specCheck = result.checks.find((c) => c.ruleName.includes('Critical Specification'));
  assert.ok(specCheck);
  assert.equal(specCheck?.status, 'UNKNOWN');
  assert.equal(specCheck?.mandatory, true);
  assert.match(specCheck!.evidence, /absent or unverified/);
});

test('33. Regression: Genuine classification conflicts do not silently receive an inappropriate specialist policy profile', () => {
  // Buyer asked for copier paper (Office Supplies)
  const paperPolicy: PurchaseRequirements = {
    id: 'pol_paper_conflict',
    category: 'office_supplies',
    targetItem: 'A4 copy paper 500 sheets ream',
    maxBudget: 80.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Paper request.',
    createdAt: new Date().toISOString(),
  };

  // Channel3 listing erroneously returns an office chair listing under $80
  const conflictingChairProduct: NormalizedProduct = {
    id: 'prod_chair_conflict',
    title: 'Ergonomic Mesh Office Desk Chair with Lumbar Support',
    merchant: 'Staples Outlet',
    price: 65.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/chair',
    sku: 'CHAIR-MESH-65',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(conflictingChairProduct, paperPolicy);

  // Must NOT pass silently: conflict between Office Supplies and Office Furniture
  assert.equal(result.overallStatus, 'REVIEW');
  const conflictCheck = result.checks.find((c) => c.ruleName === 'Category Alignment');
  assert.ok(conflictCheck);
  assert.equal(conflictCheck?.status, 'UNKNOWN');
  assert.equal(conflictCheck?.mandatory, true);
  assert.match(conflictCheck!.evidence, /Genuine classification conflict/);
});

test('34. Regression: Existing refurbished consumable attacks remain BLOCKED', () => {
  const paperPolicy: PurchaseRequirements = {
    id: 'pol_paper_strict',
    category: 'office_supplies',
    targetItem: 'printer and copier paper',
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new', 'refurbished'], // Client manipulated policy to allow refurbished
    minRamGb: 0,
    extractedReasoning: 'Client attempting refurbished paper.',
    createdAt: new Date().toISOString(),
  };

  const refurbishedPaper: NormalizedProduct = {
    id: 'prod_paper_refurb',
    title: 'Xerox Multi-Use Paper (Certified Refurbished / Open Box)',
    merchant: 'Bargain Paper Depot',
    price: 24.99,
    currency: 'USD',
    condition: 'refurbished',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-refurb',
    sku: 'XRX-REFURB',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(refurbishedPaper, paperPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const condCheck = result.checks.find((c) => c.ruleName === 'Product Condition');
  assert.equal(condCheck?.status, 'FAIL');
  assert.match(condCheck!.evidence, /strictly enforces \[new\] only/);
});

test('35. Regression: Existing computing RAM and storage checks remain intact', () => {
  const computingProductPass: NormalizedProduct = {
    id: 'prod_laptop_compliant',
    title: 'Dell Inspiron 15 (16GB RAM, 512GB SSD)',
    merchant: 'Dell Direct',
    price: 749.0,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/dell-15',
    sku: 'DELL-15-749',
    availability: 'IN_STOCK',
  };

  const evalPass = evaluateProductPolicy(computingProductPass, devLaptopPolicy);
  assert.equal(evalPass.overallStatus, 'PASS');

  const computingProductLowRam: NormalizedProduct = {
    id: 'prod_laptop_lowram',
    title: 'Dell Inspiron 15 (8GB RAM, 256GB SSD)',
    merchant: 'Dell Direct',
    price: 499.0,
    currency: 'USD',
    condition: 'new',
    ramGb: 8,
    storageGb: 256,
    productUrl: 'https://example.com/dell-8gb',
    sku: 'DELL-8G-499',
    availability: 'IN_STOCK',
  };

  const evalFail = evaluateProductPolicy(computingProductLowRam, devLaptopPolicy);
  assert.equal(evalFail.overallStatus, 'BLOCKED');
  const ramRule = evalFail.checks.find((c) => c.ruleName === 'Minimum RAM Specification');
  assert.equal(ramRule?.status, 'FAIL');
  assert.match(ramRule!.evidence, /Insufficient RAM/);
});

test('36. Regression: The $800 ThinkPad budget regression remains intact', () => {
  const overBudgetThinkPad: NormalizedProduct = {
    id: 'prod_thinkpad_1099',
    title: 'Lenovo ThinkPad E16 Gen 3',
    merchant: 'Lenovo Commercial Store',
    price: 1099.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/thinkpad',
    sku: 'LNV-E16-1099',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(overBudgetThinkPad, devLaptopPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');
  const budgetRule = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetRule?.status, 'FAIL');
  assert.match(budgetRule!.evidence, /1099.99 > allowed budget of USD 800.00/);
});

test('37. Regression: Existing non-computing checkout and policy safeguards continue to pass', () => {
  const cleaningPolicy: PurchaseRequirements = {
    id: 'pol_clean_safe',
    category: 'cleaning_supplies',
    targetItem: 'Commercial disinfectant spray cleaner',
    maxBudget: 60.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Cleaning procurement.',
    createdAt: new Date().toISOString(),
  };

  const disinfectantProduct: NormalizedProduct = {
    id: 'prod_disinfect_001',
    title: 'Clorox Commercial Solutions Clean-Up Disinfectant Cleaner (32 oz)',
    merchant: 'Home Depot Pro',
    price: 29.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/clorox',
    sku: 'CLX-CLEAN-32',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(disinfectantProduct, cleaningPolicy);
  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.checks.some((c) => c.ruleName === 'Minimum RAM Specification'), false);
});

// ============================================================================
// Phase 2: Multi-Unit Quantity & Multi-Category Specification Tests
// ============================================================================

test('38. Phase 2: Multi-unit compliant line total (5 packs @ $15 = $75 <= $100 budget) evaluates to PASS', () => {
  const multiUnitPaperPolicy: PurchaseRequirements = {
    id: 'pol_multi_paper_001',
    category: 'office_supplies',
    targetItem: 'copier paper',
    quantity: 5,
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: '5 packs of paper under $100.',
    createdAt: new Date().toISOString(),
  };

  const paperProduct: NormalizedProduct = {
    id: 'prod_paper_ream_15',
    title: 'Hammermill 20lb Copy Paper Ream (500 Sheets)',
    merchant: 'Office Supply Pro',
    price: 15.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-15',
    sku: 'HAM-15',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(paperProduct, multiUnitPaperPolicy);
  assert.equal(result.overallStatus, 'PASS');

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.ok(budgetCheck);
  assert.equal(budgetCheck?.status, 'PASS');
  assert.match(budgetCheck!.evidence, /75\.00/);
  assert.match(budgetCheck!.evidence, /15\.00 x 5 units/);
  assert.match(budgetCheck!.evidence, /allowed budget of USD 100\.00/);
});

test('39. Phase 2: Multi-unit line total exceeding budget (5 packs @ $25 = $125 > $100 budget) evaluates to BLOCKED even though unit price ($25) is below budget', () => {
  const multiUnitPaperPolicy: PurchaseRequirements = {
    id: 'pol_multi_paper_over',
    category: 'office_supplies',
    targetItem: 'copier paper',
    quantity: 5,
    maxBudget: 100.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: '5 packs of paper under $100.',
    createdAt: new Date().toISOString(),
  };

  const expensivePaperProduct: NormalizedProduct = {
    id: 'prod_paper_ream_25',
    title: 'Premium Color Laser Paper Ream',
    merchant: 'Staples',
    price: 25.0, // Unit price ($25) < budget ($100), but 5 * $25 = $125 > $100!
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-25',
    sku: 'STP-25',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(expensivePaperProduct, multiUnitPaperPolicy);
  assert.equal(result.overallStatus, 'BLOCKED');

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.ok(budgetCheck);
  assert.equal(budgetCheck?.status, 'FAIL');
  assert.match(budgetCheck!.evidence, /125\.00/);
  assert.match(budgetCheck!.evidence, /25\.00 x 5 units/);
  assert.match(budgetCheck!.evidence, /allowed budget of USD 100\.00/);
});

test('40. Phase 2: Single unit request (quantity: 1 or undefined) verifies unit price against budget', () => {
  const singleUnitPolicy: PurchaseRequirements = {
    id: 'pol_single_unit',
    category: 'office_supplies',
    targetItem: 'copier paper',
    quantity: 1,
    maxBudget: 30.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Single paper pack under $30.',
    createdAt: new Date().toISOString(),
  };

  const paperProduct: NormalizedProduct = {
    id: 'prod_paper_22',
    title: 'Multi-Purpose Paper 500 Sheets',
    merchant: 'Office Depot',
    price: 22.5,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/paper-22',
    sku: 'OD-22',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(paperProduct, singleUnitPolicy);
  assert.equal(result.overallStatus, 'PASS');

  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.match(budgetCheck!.evidence, /22\.50 <= allowed budget of USD 30\.00/);
});

test('41. Phase 2: Invalid non-positive quantity fails closed with BLOCKED', () => {
  const invalidQtyPolicy = {
    ...devLaptopPolicy,
    id: 'pol_invalid_qty_zero',
    quantity: 0,
  };

  const product: NormalizedProduct = {
    id: 'prod_laptop_test',
    title: 'Acer Aspire 5 (16GB RAM, 512GB SSD)',
    merchant: 'B&H',
    price: 599.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/test',
    sku: 'ACER-TEST',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, invalidQtyPolicy as any);
  assert.equal(result.overallStatus, 'BLOCKED');

  const qtyCheck = result.checks.find((c) => c.ruleName === 'Quantity Verification');
  assert.ok(qtyCheck);
  assert.equal(qtyCheck?.status, 'FAIL');
  assert.match(qtyCheck!.evidence, /invalid or non-positive quantity/);
});

test('42. Phase 2: Invalid fractional quantity (e.g. 2.5) fails closed with BLOCKED', () => {
  const fractionalQtyPolicy = {
    ...devLaptopPolicy,
    id: 'pol_fractional_qty',
    quantity: 2.5,
  };

  const product: NormalizedProduct = {
    id: 'prod_laptop_test2',
    title: 'Acer Aspire 5 (16GB RAM, 512GB SSD)',
    merchant: 'B&H',
    price: 599.99,
    currency: 'USD',
    condition: 'new',
    ramGb: 16,
    storageGb: 512,
    productUrl: 'https://example.com/test',
    sku: 'ACER-TEST2',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(product, fractionalQtyPolicy as any);
  assert.equal(result.overallStatus, 'BLOCKED');

  const qtyCheck = result.checks.find((c) => c.ruleName === 'Quantity Verification');
  assert.ok(qtyCheck);
  assert.equal(qtyCheck?.status, 'FAIL');
});

test('43. Phase 2: Product with missing price under multi-unit request evaluates to UNKNOWN and overall REVIEW', () => {
  const multiUnitPolicy: PurchaseRequirements = {
    id: 'pol_multi_missing_price',
    category: 'office_supplies',
    targetItem: 'printer paper',
    quantity: 10,
    maxBudget: 200.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: '10 packs.',
    createdAt: new Date().toISOString(),
  };

  const unpricedProduct: NormalizedProduct = {
    id: 'prod_noprice_multi',
    title: 'Commercial Bulk Paper Pack',
    merchant: 'Wholesale Depot',
    price: null, // Price missing
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/bulk-paper',
    sku: 'WHOLESALE-PAPER',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(unpricedProduct, multiUnitPolicy);
  assert.equal(result.overallStatus, 'REVIEW');
  const budgetCheck = result.checks.find((c) => c.ruleName === 'Maximum Budget Limit');
  assert.equal(budgetCheck?.status, 'UNKNOWN');
});

test('44. Phase 2: Paper with critical GSM specification verified in product title/description evaluates to PASS', () => {
  const paperGsmPolicy: PurchaseRequirements = {
    id: 'pol_paper_gsm',
    category: 'office_supplies',
    targetItem: 'copier paper 80 gsm',
    maxBudget: 50.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      'Paper Weight': '80 gsm',
    },
    extractedReasoning: 'Mandatory 80 GSM paper requirement.',
    createdAt: new Date().toISOString(),
  };

  const compliantGsmProduct: NormalizedProduct = {
    id: 'prod_paper_80gsm',
    title: 'Navigator Premium Office Paper A4 80 GSM (500 Sheets)',
    description: 'Ultra-bright 80 gsm multipurpose copy paper for office printing and copying.',
    merchant: 'Staples Business',
    price: 18.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/nav-80gsm',
    sku: 'NAV-80GSM',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(compliantGsmProduct, paperGsmPolicy);
  assert.equal(result.overallStatus, 'PASS');
  const specCheck = result.checks.find((c) => c.ruleName.includes('Paper Weight'));
  assert.ok(specCheck);
  assert.equal(specCheck?.status, 'PASS');
  assert.match(specCheck!.evidence, /verified in product metadata/);
});

test('45. Phase 2: Paper with critical GSM specification missing from listing evaluates to REVIEW', () => {
  const paperGsmPolicy: PurchaseRequirements = {
    id: 'pol_paper_gsm_missing',
    category: 'office_supplies',
    targetItem: 'copier paper 80 gsm',
    maxBudget: 50.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      'Paper Weight': '80 gsm',
    },
    extractedReasoning: 'Mandatory 80 GSM paper requirement.',
    createdAt: new Date().toISOString(),
  };

  const unspecifiedGsmProduct: NormalizedProduct = {
    id: 'prod_paper_nogsm',
    title: 'Standard Multipurpose Copy Paper 500 Sheets',
    description: 'Generic white office paper.',
    merchant: 'Office Depot',
    price: 14.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/gen-paper',
    sku: 'GEN-PAPER',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(unspecifiedGsmProduct, paperGsmPolicy);
  assert.equal(result.overallStatus, 'REVIEW');
  const specCheck = result.checks.find((c) => c.ruleName.includes('Paper Weight'));
  assert.ok(specCheck);
  assert.equal(specCheck?.status, 'UNKNOWN');
  assert.match(specCheck!.evidence, /absent or unverified/);
});

test('46. Phase 2: Power tools with critical Voltage specification (18V) verified in title evaluates to PASS', () => {
  const drillPolicy: PurchaseRequirements = {
    id: 'pol_drill_18v',
    category: 'tools_hardware',
    targetItem: '18V cordless brushless drill kit',
    maxBudget: 220.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      Voltage: '18v',
    },
    extractedReasoning: '18V cordless drill requirement.',
    createdAt: new Date().toISOString(),
  };

  const drillProduct: NormalizedProduct = {
    id: 'prod_makita_18v',
    title: 'Makita LXT 18V Sub-Compact Brushless Cordless 1/2" Driver-Drill Kit',
    description: 'Includes two 18V LXT Lithium-Ion batteries and charger.',
    merchant: 'Home Depot',
    price: 179.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/makita-18v',
    sku: 'MAKITA-18V-KIT',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(drillProduct, drillPolicy);
  assert.equal(result.overallStatus, 'PASS');
  const voltCheck = result.checks.find((c) => c.ruleName.includes('Voltage'));
  assert.ok(voltCheck);
  assert.equal(voltCheck?.status, 'PASS');
});

test('47. Phase 2: Power tools with critical Voltage specification missing from listing evaluates to REVIEW', () => {
  const drillPolicy: PurchaseRequirements = {
    id: 'pol_drill_missing_volt',
    category: 'tools_hardware',
    targetItem: '18V cordless brushless drill kit',
    maxBudget: 220.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      Voltage: '18v',
    },
    extractedReasoning: '18V cordless drill requirement.',
    createdAt: new Date().toISOString(),
  };

  const unverifiedDrillProduct: NormalizedProduct = {
    id: 'prod_drill_novolt',
    title: 'Heavy-Duty Variable Speed Cordless Compact Drill Kit',
    description: 'Compact drill kit with battery and case.',
    merchant: 'Tool Emporium',
    price: 119.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/novolt-drill',
    sku: 'DRILL-NOVOLT',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(unverifiedDrillProduct, drillPolicy);
  assert.equal(result.overallStatus, 'REVIEW');
  const voltCheck = result.checks.find((c) => c.ruleName.includes('Voltage'));
  assert.ok(voltCheck);
  assert.equal(voltCheck?.status, 'UNKNOWN');
});

test('48. Phase 2: Networking equipment with critical 24-Port specification verified evaluates to PASS', () => {
  const switchPolicy: PurchaseRequirements = {
    id: 'pol_switch_24p',
    category: 'computing',
    targetItem: '24-port gigabit managed network switch',
    maxBudget: 300.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      'Port Density': '24-port',
    },
    extractedReasoning: '24-port switch requirement.',
    createdAt: new Date().toISOString(),
  };

  const switchProduct: NormalizedProduct = {
    id: 'prod_cisco_24p',
    title: 'Cisco Business 250 Series CBS250-24T-4G 24-Port Gigabit Smart Switch',
    description: '24 Gigabit Ethernet ports and 4 Gigabit SFP uplink ports.',
    merchant: 'CDW Direct',
    price: 265.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/cisco-24p',
    sku: 'CISCO-CBS250-24T',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(switchProduct, switchPolicy);
  assert.equal(result.overallStatus, 'PASS');
  const portCheck = result.checks.find((c) => c.ruleName.includes('Port Density'));
  assert.ok(portCheck);
  assert.equal(portCheck?.status, 'PASS');
});

test('49. Phase 2: Networking equipment with critical 24-Port specification missing evaluates to REVIEW', () => {
  const switchPolicy: PurchaseRequirements = {
    id: 'pol_switch_missing_port',
    category: 'computing',
    targetItem: '24-port gigabit managed network switch',
    maxBudget: 300.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    criticalSpecs: {
      'Port Density': '24-port',
    },
    extractedReasoning: '24-port switch requirement.',
    createdAt: new Date().toISOString(),
  };

  const genericSwitchProduct: NormalizedProduct = {
    id: 'prod_netgear_generic',
    title: 'Netgear ProSAFE Gigabit Smart Managed Plus Switch',
    description: 'High performance managed gigabit switch for business networks.',
    merchant: 'Amazon Commercial',
    price: 180.0,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/netgear-gen',
    sku: 'NETGEAR-PLUS',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(genericSwitchProduct, switchPolicy);
  assert.equal(result.overallStatus, 'REVIEW');
  const portCheck = result.checks.find((c) => c.ruleName.includes('Port Density'));
  assert.ok(portCheck);
  assert.equal(portCheck?.status, 'UNKNOWN');
});

test('50. Phase 2: Non-computing products never have unrequested RAM or storage rules invented', () => {
  const chairPolicy: PurchaseRequirements = {
    id: 'pol_chair_plain',
    category: 'furniture',
    targetItem: 'ergonomic mesh office chair',
    maxBudget: 250.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Office chair.',
    createdAt: new Date().toISOString(),
  };

  const chairProduct: NormalizedProduct = {
    id: 'prod_mesh_chair',
    title: 'Ergonomic High-Back Mesh Desk Chair with Lumbar Support',
    merchant: 'Wayfair Professional',
    price: 189.99,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/mesh-chair',
    sku: 'WAY-MESH-CHAIR',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(chairProduct, chairPolicy);
  assert.equal(result.overallStatus, 'PASS');

  // Assert NO RAM or storage rules exist
  const hasRamCheck = result.checks.some((c) => c.ruleName.toLowerCase().includes('ram'));
  const hasStorageCheck = result.checks.some((c) => c.ruleName.toLowerCase().includes('storage'));
  assert.equal(hasRamCheck, false);
  assert.equal(hasStorageCheck, false);
});

test('51. Phase 2: Unknown category product evaluates successfully under universal safeguards without failing', () => {
  const unknownPolicy: PurchaseRequirements = {
    id: 'pol_unknown_001',
    category: 'general',
    targetItem: 'Industrial high-pressure stainless steel ball valve',
    maxBudget: 120.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'General industrial equipment.',
    createdAt: new Date().toISOString(),
  };

  const valveProduct: NormalizedProduct = {
    id: 'prod_valve_001',
    title: '1-Inch 316 Stainless Steel Full Port Ball Valve 1000 WOG',
    merchant: 'Grainger',
    price: 64.5,
    currency: 'USD',
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/valve',
    sku: 'GRA-VALVE-1IN',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(valveProduct, unknownPolicy);
  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.resolvedCategory, 'general');
  assert.equal(result.resolvedSubcategory, 'Other');
});

test('52. Phase 2: Unknown category product with missing currency is BLOCKED (never auto-approved)', () => {
  const unknownPolicy: PurchaseRequirements = {
    id: 'pol_unknown_002',
    category: 'general',
    targetItem: 'Warehouse safety bollard',
    maxBudget: 150.0,
    currency: 'USD',
    allowedConditions: ['new'],
    minRamGb: 0,
    extractedReasoning: 'Safety bollard.',
    createdAt: new Date().toISOString(),
  };

  const unverifiedCurrencyProduct: NormalizedProduct = {
    id: 'prod_bollard_nocurrency',
    title: 'Steel Safety Bollard 36-Inch Yellow Powder Coat',
    merchant: 'Global Industrial',
    price: 89.0,
    currency: null, // Missing currency attribute
    condition: 'new',
    ramGb: null,
    storageGb: null,
    productUrl: 'https://example.com/bollard',
    sku: 'GLOB-BOLLARD',
    availability: 'IN_STOCK',
  };

  const result = evaluateProductPolicy(unverifiedCurrencyProduct, unknownPolicy);
  assert.equal(result.overallStatus, 'REVIEW');
  const currencyCheck = result.checks.find((c) => c.ruleName === 'Currency Verification');
  assert.equal(currencyCheck?.status, 'UNKNOWN');
});

test('53. Phase 2: Comprehensive category resolution for 10 core organizational procurement types', () => {
  // 1. Laptop
  const r1 = resolveClassification({ targetItem: 'ThinkPad T14s laptop for engineering' });
  assert.equal(r1.category, 'computing');
  assert.equal(r1.subcategory, 'Laptops');

  // 2. Tablet
  const r2 = resolveClassification({ targetItem: 'Samsung Galaxy Tab S9 tablet with stylus' });
  assert.equal(r2.category, 'computing');
  assert.equal(r2.subcategory, 'Tablets');

  // 3. Smartphone
  const r3 = resolveClassification({ targetItem: 'Google Pixel 8 Pro corporate smartphone' });
  assert.equal(r3.category, 'computing');
  assert.equal(r3.subcategory, 'Smartphones');

  // 4. Monitor
  const r4 = resolveClassification({ targetItem: 'Dell UltraSharp 32 4K USB-C monitor' });
  assert.equal(r4.category, 'computing');
  assert.equal(r4.subcategory, 'Monitors');

  // 5. Network Switch
  const r5 = resolveClassification({ targetItem: 'Cisco CBS250-24T 24-Port Gigabit network switch' });
  assert.equal(r5.category, 'computing');
  assert.equal(r5.subcategory, 'Networking');

  // 6. Paper
  const r6 = resolveClassification({ targetItem: 'A4 multipurpose copier paper 500 sheets ream' });
  assert.equal(r6.category, 'office_supplies');
  assert.equal(r6.subcategory, 'Paper');

  // 7. Toner Cartridge
  const r7 = resolveClassification({ targetItem: 'HP 58A Black LaserJet toner cartridge' });
  assert.equal(r7.category, 'printer_consumables');
  assert.equal(r7.subcategory, 'Toner Cartridges');

  // 8. Cleaning Supplies
  const r8 = resolveClassification({ targetItem: 'Commercial surface disinfectant cleaning liquid' });
  assert.equal(r8.category, 'cleaning_supplies');
  assert.equal(r8.subcategory, 'Disinfectants');

  // 9. Maintenance Tools
  const r9 = resolveClassification({ targetItem: 'DeWalt 20V Max cordless brushless drill' });
  assert.equal(r9.category, 'tools_hardware');
  assert.equal(r9.subcategory, 'Power Tools');

  // 10. Office Furniture
  const r10 = resolveClassification({ targetItem: 'Steelcase Gesture ergonomic office chair' });
  assert.equal(r10.category, 'furniture');
  assert.equal(r10.subcategory, 'Office Chairs');
});


