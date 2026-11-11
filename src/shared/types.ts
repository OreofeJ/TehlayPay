export type RuleCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export type OverallPolicyDecision = 'PASS' | 'BLOCKED' | 'REVIEW';

export type ProductCondition = 'new' | 'refurbished' | 'used' | 'unknown';

export interface RuleCheckResult {
  ruleName: string;
  status: RuleCheckStatus;
  mandatory: boolean;
  evidence: string;
}

export type ProcurementCategory =
  | 'computing'
  | 'office_supplies'
  | 'printer_consumables'
  | 'cleaning_supplies'
  | 'tools_hardware'
  | 'furniture'
  | 'general';

export interface PurchaseRequirements {
  id: string;
  category: string;
  subcategory?: string;
  targetItem: string;
  quantity?: number;
  maxBudget: number;
  currency: string;
  allowedConditions: ProductCondition[];
  minRamGb?: number;
  minStorageGb?: number;
  targetSpecs?: Record<string, string | number>;
  criticalSpecs?: Record<string, string | number>;
  enforceTargetSpecs?: boolean;
  extractedReasoning: string;
  createdAt: string;
  originalPrompt?: string;
}

export interface NormalizedProduct {
  id: string;
  title: string;
  merchant: string;
  price: number | null;
  currency: string | null;
  condition: ProductCondition;
  ramGb: number | null;
  storageGb: number | null;
  productUrl: string;
  sku: string;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER';
  imageUrl?: string;
  dataSource?: 'channel3_live' | 'fixture_fallback';
  supplierCategory?: string;
  description?: string;
  quantity?: number;
  lineTotal?: number | null;
}

export interface PolicyEvaluationResult {
  productId: string;
  overallStatus: OverallPolicyDecision;
  summary: string;
  checks: RuleCheckResult[];
  evaluatedAt: string;
  resolvedCategory?: ProcurementCategory;
  resolvedSubcategory?: string;
}

export interface EvaluatedProduct extends NormalizedProduct {
  evaluation: PolicyEvaluationResult;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  requirementId: string;
  productId: string;
  productTitle: string;
  amount: number;
  currency: string;
  quantity?: number;
  unitPrice?: number;
  subcategory?: string;
  policyStatus: OverallPolicyDecision;
  approvalGrantedBy: string | null;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  status: 'PENDING_APPROVAL' | 'ORDER_CREATED' | 'CAPTURED' | 'FAILED' | 'REJECTED';
  verificationHash: string;
  notes?: string;
}

export interface SystemStatus {
  geminiConfigured: boolean;
  channel3Live: boolean;
  channel3BaseUrl: string;
  paypalSandboxConnected: boolean;
  paypalEnv: string;
  isProductionDisabled: boolean;
  paypalLive?: boolean;
}

export interface EvaluatedProductRecord {
  id: string;
  timestamp: string;
  requirementId: string;
  product: EvaluatedProduct;
}

export interface CurrencyMetric {
  currency: string;
  amount: number;
  recordCount: number;
}

export interface MetricWithComparison {
  value: number;
  previousValue: number | null;
  changePercentage: number | null;
  hasSufficientHistory: boolean;
}

export interface CategorySummary {
  category: ProcurementCategory;
  categoryDisplayName: string;
  totalRequests: number;
  totalEvaluations: number;
  passCount: number;
  blockedCount: number;
  reviewCount: number;
  passRate: number;
  blockedRate: number;
  spendByCurrency: Record<string, number>;
  estimatedValueByCurrency: Record<string, number>;
}

export interface PolicyRuleViolation {
  ruleName: string;
  violationCount: number;
  sampleEvidence: string[];
}

export interface PolicyReviewReason {
  reason: string;
  count: number;
  sampleEvidence: string[];
}

export interface TimeSeriesBucket {
  periodLabel: string;
  dateKey: string;
  requestsCount: number;
  evaluationsCount: number;
  passCount: number;
  blockedCount: number;
  reviewCount: number;
  estimatedValueByCurrency: Record<string, number>;
  capturedValueByCurrency: Record<string, number>;
}

export interface BudgetUtilisationScope {
  requirementId: string;
  targetItem: string;
  category: string;
  currency: string;
  budgetCeiling: number;
  committedSpend: number;
  remainingHeadroom: number;
  utilisationPercentage: number;
  status: 'SAFE' | 'WARNING' | 'EXCEEDED';
}

export interface AnalyticsActivityEvent {
  id: string;
  timestamp: string;
  eventType: 'EVALUATION' | 'ORDER_CREATED' | 'PAYMENT_CAPTURED' | 'ORDER_REJECTED' | 'REQUEST_CREATED';
  requirementId: string;
  requestPrompt?: string;
  category: string;
  subcategory?: string;
  productTitle: string;
  productId: string;
  merchant?: string;
  unitPrice: number | null;
  quantity: number;
  estimatedTotal: number | null;
  currency: string;
  policyStatus: OverallPolicyDecision;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'N/A';
  paymentStatus: 'NOT_CREATED' | 'PENDING' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
  paypalOrderId?: string;
  paypalCaptureId?: string;
  notes?: string;
}

export interface AnalyticsOverview {
  reportingPeriod: {
    period: 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';
    startDate: string;
    endDate: string;
    previousStartDate: string | null;
    previousEndDate: string | null;
  };
  kpis: {
    totalRequests: MetricWithComparison;
    estimatedValueByCurrency: CurrencyMetric[];
    approvedValueByCurrency: CurrencyMetric[];
    capturedValueByCurrency: CurrencyMetric[];
    blockedEvaluationsCount: MetricWithComparison;
    blockedEstimatedValueByCurrency: CurrencyMetric[];
    reviewEvaluationsCount: MetricWithComparison;
    reviewEstimatedValueByCurrency: CurrencyMetric[];
    totalEvaluationsCount: number;
    passEvaluationsCount: number;
  };
  decisionDistribution: {
    pass: { count: number; percentage: number };
    blocked: { count: number; percentage: number };
    review: { count: number; percentage: number };
    total: number;
  };
  categories: CategorySummary[];
  timeSeries: TimeSeriesBucket[];
  budgetUtilisations: BudgetUtilisationScope[];
  complianceInsights: {
    topBlockingRules: PolicyRuleViolation[];
    topReviewReasons: PolicyReviewReason[];
    categoryWithHighestBlockedRate: { categoryName: string; blockedRate: number; sampleSize: number } | null;
    categoryWithHighestPassRate: { categoryName: string; passRate: number; sampleSize: number } | null;
    frequentMissingAttributes: { attribute: string; count: number }[];
  };
  recentActivity: AnalyticsActivityEvent[];
  dataQuality: {
    totalRecordsAudited: number;
    unclassifiedRecordsCount: number;
    missingPriceRecordsCount: number;
    missingTimestampRecordsCount: number;
    multiCurrencyPresent: boolean;
    currenciesPresent: string[];
    warnings: string[];
  };
}

export interface SimulatedOutcome {
  product: EvaluatedProduct;
  originalStatus: OverallPolicyDecision;
  simulatedStatus: OverallPolicyDecision;
  delta: 'IMPROVED' | 'WORSENED' | 'UNCHANGED';
  originalEvaluation: PolicyEvaluationResult;
  simulatedEvaluation: PolicyEvaluationResult;
  explanation: string;
}

export interface ComparisonRecommendation {
  lowestPricedCompliant: EvaluatedProduct | null;
  bestSpecCompliant: EvaluatedProduct | null;
  reviewProducts: EvaluatedProduct[];
  blockedProducts: EvaluatedProduct[];
  summary: string;
  explanations: Record<string, string>;
  hasCompliantOptions: boolean;
}

export interface ProcurementPassport {
  passportReference: string;
  generatedAt: string;
  requestReference: string;
  request: {
    originalPrompt?: string;
    targetItem: string;
    category: string;
    subcategory?: string;
    quantity: number;
    maxBudget: number;
    currency: string;
    allowedConditions: ProductCondition[];
    mandatorySpecs: Record<string, string | number>;
    extractedReasoning: string;
  };
  product: {
    id: string;
    title: string;
    merchant: string;
    sku: string;
    productUrl: string;
    price: number | null;
    currency: string | null;
    condition: ProductCondition;
    quantity: number;
    lineTotal: number | null;
    ramGb: number | null;
    storageGb: number | null;
    description?: string;
    dataSource?: string;
  };
  policyEvaluation: {
    overallStatus: OverallPolicyDecision;
    summary: string;
    checks: RuleCheckResult[];
    evaluatedAt: string;
    resolvedCategory?: ProcurementCategory;
    resolvedSubcategory?: string;
  };
  decisionExplanation: string;
  buyerDecision: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approver: string | null;
    timestamp: string | null;
    approvalReference?: string;
  };
  paymentRecord: {
    paypalOrderId?: string;
    orderCreationStatus: 'NOT_CREATED' | 'CREATED' | 'FAILED';
    buyerApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'N/A';
    paymentCaptureStatus: 'UNATTEMPTED' | 'NOT_CREATED' | 'PENDING' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
    paypalCaptureId?: string;
    capturedAmount?: number;
    capturedCurrency?: string;
    capturedAt?: string;
    notes: string;
  };
  audit: {
    auditReference?: string;
    verificationHash?: string;
    recordFound: boolean;
    integrityVerified: boolean;
    passportGeneratedAt: string;
  };
}

export interface PassportVerificationResult {
  passportReference: string;
  recordExists: boolean;
  recordMatches: boolean;
  captureConfirmedByPayPal: boolean;
  message: string;
  record?: AuditRecord;
}

