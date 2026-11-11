import type {
  AuditRecord,
  PurchaseRequirements,
  EvaluatedProductRecord,
  AnalyticsOverview,
  AnalyticsActivityEvent,
  CategorySummary,
  CurrencyMetric,
  MetricWithComparison,
  PolicyRuleViolation,
  PolicyReviewReason,
  TimeSeriesBucket,
  BudgetUtilisationScope,
  ProcurementCategory,
} from '../src/shared/types.ts';
import { getCategoryDisplayName, classifyCategory } from '../src/shared/categories.ts';
import { auditStore } from './auditStore.ts';

export interface AnalyticsQueryOptions {
  period?: 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: string;
  endDate?: string;
  currency?: string;
  category?: string;
}

interface DateRange {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date | null;
  previousEndDate: Date | null;
}

/**
 * Calculates deterministic date intervals for reporting period filtering and
 * equivalent previous-period comparison.
 */
export function calculateDateRange(
  period: AnalyticsQueryOptions['period'] = 'all',
  customStart?: string,
  customEnd?: string,
  referenceNow: Date = new Date()
): DateRange {
  const now = referenceNow;

  if (period === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    return {
      startDate: startOfToday,
      endDate: now,
      previousStartDate: startOfYesterday,
      previousEndDate: startOfToday,
    };
  }

  if (period === '7d') {
    const durationMs = 7 * 24 * 60 * 60 * 1000;
    const start = new Date(now.getTime() - durationMs);
    const prevStart = new Date(start.getTime() - durationMs);
    return {
      startDate: start,
      endDate: now,
      previousStartDate: prevStart,
      previousEndDate: start,
    };
  }

  if (period === '30d') {
    const durationMs = 30 * 24 * 60 * 60 * 1000;
    const start = new Date(now.getTime() - durationMs);
    const prevStart = new Date(start.getTime() - durationMs);
    return {
      startDate: start,
      endDate: now,
      previousStartDate: prevStart,
      previousEndDate: start,
    };
  }

  if (period === '90d') {
    const durationMs = 90 * 24 * 60 * 60 * 1000;
    const start = new Date(now.getTime() - durationMs);
    const prevStart = new Date(start.getTime() - durationMs);
    return {
      startDate: start,
      endDate: now,
      previousStartDate: prevStart,
      previousEndDate: start,
    };
  }

  if (period === 'custom' && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      const durationMs = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - durationMs);
      return {
        startDate: start,
        endDate: end,
        previousStartDate: prevStart,
        previousEndDate: start,
      };
    }
  }

  // 'all' time: beginning of UNIX time to now, no comparable previous period
  return {
    startDate: new Date(0),
    endDate: now,
    previousStartDate: null,
    previousEndDate: null,
  };
}

/**
 * Authoritative Server Analytics Engine
 * Calculates metrics from real AuditRecords, PurchaseRequirements, and EvaluatedProductRecords.
 * Purely read-only; does not mutate any stored records.
 */
export class AnalyticsService {
  public static generateOverview(options: AnalyticsQueryOptions = {}): AnalyticsOverview {
    const period = options.period || 'all';
    const dateRange = calculateDateRange(period, options.startDate, options.endDate);

    const allRequirements = auditStore.getAllRequirements();
    const allAuditRecords = auditStore.getRecords();
    const allEvaluations = auditStore.getEvaluations();

    // Data quality counters
    let missingTimestampRecordsCount = 0;
    let missingPriceRecordsCount = 0;
    let unclassifiedRecordsCount = 0;
    const currenciesSet = new Set<string>();

    // Helper to safely parse event timestamps without inventing dates
    const parseEventTime = (isoString?: string): Date | null => {
      if (!isoString) {
        missingTimestampRecordsCount++;
        return null;
      }
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) {
        missingTimestampRecordsCount++;
        return null;
      }
      return d;
    };

    // Filter items within current reporting date window
    const isInCurrentWindow = (isoString?: string): boolean => {
      const d = parseEventTime(isoString);
      if (!d) return false;
      return d >= dateRange.startDate && d <= dateRange.endDate;
    };

    // Filter items within previous reporting date window
    const isInPreviousWindow = (isoString?: string): boolean => {
      if (!dateRange.previousStartDate || !dateRange.previousEndDate) return false;
      const d = parseEventTime(isoString);
      if (!d) return false;
      return d >= dateRange.previousStartDate && d < dateRange.previousEndDate;
    };

    // Current window collections
    const filteredRequirements = allRequirements.filter((r) => isInCurrentWindow(r.createdAt));
    const filteredAuditRecords = allAuditRecords.filter((a) => isInCurrentWindow(a.timestamp));
    const filteredEvaluations = allEvaluations.filter((e) => isInCurrentWindow(e.timestamp));

    // Previous window collections for period-over-period comparison
    const prevRequirements = allRequirements.filter((r) => isInPreviousWindow(r.createdAt));
    const prevEvaluations = allEvaluations.filter((e) => isInPreviousWindow(e.timestamp));

    // Optional user filters (Currency & Category)
    const applyUserFilters = <T>(
      items: T[],
      getCategory: (item: T) => string | undefined,
      getCurrency: (item: T) => string | undefined
    ): T[] => {
      return items.filter((item) => {
        if (options.currency && options.currency !== 'ALL') {
          const c = getCurrency(item);
          if (!c || c.toUpperCase() !== options.currency.toUpperCase()) return false;
        }
        if (options.category && options.category !== 'ALL') {
          const cat = getCategory(item);
          if (!cat || classifyCategory(cat) !== classifyCategory(options.category)) return false;
        }
        return true;
      });
    };

    const activeRequirements = applyUserFilters(
      filteredRequirements,
      (r) => r.category || r.subcategory,
      (r) => r.currency
    );

    const activeAuditRecords = applyUserFilters(
      filteredAuditRecords,
      (a) => a.subcategory,
      (a) => a.currency
    );

    const activeEvaluations = applyUserFilters(
      filteredEvaluations,
      (e) => e.product.evaluation.resolvedCategory || e.product.supplierCategory,
      (e) => e.product.currency || undefined
    );

    // -------------------------------------------------------------------------
    // KPI A: Total Procurement Requests (Distinct Buyer Requirements)
    // -------------------------------------------------------------------------
    const currentReqCount = activeRequirements.length;
    const prevReqCount = prevRequirements.length;
    const hasReqHistory = dateRange.previousStartDate !== null && prevReqCount > 0;
    const reqChange = hasReqHistory
      ? Math.round(((currentReqCount - prevReqCount) / prevReqCount) * 100)
      : null;

    const totalRequestsMetric: MetricWithComparison = {
      value: currentReqCount,
      previousValue: dateRange.previousStartDate ? prevReqCount : null,
      changePercentage: reqChange,
      hasSufficientHistory: hasReqHistory,
    };

    // -------------------------------------------------------------------------
    // KPI B: Total Estimated Procurement Value (Grouped strictly by Currency)
    // -------------------------------------------------------------------------
    const estimatedValueMap = new Map<string, { amount: number; count: number }>();
    for (const req of activeRequirements) {
      if (typeof req.maxBudget === 'number' && !Number.isNaN(req.maxBudget) && req.maxBudget > 0) {
        const cur = (req.currency || 'USD').toUpperCase();
        currenciesSet.add(cur);
        const existing = estimatedValueMap.get(cur) || { amount: 0, count: 0 };
        existing.amount += req.maxBudget;
        existing.count += 1;
        estimatedValueMap.set(cur, existing);
      } else {
        missingPriceRecordsCount++;
      }
    }

    const estimatedValueByCurrency: CurrencyMetric[] = Array.from(
      estimatedValueMap.entries()
    ).map(([currency, data]) => ({
      currency,
      amount: Math.round(data.amount * 100) / 100,
      recordCount: data.count,
    }));

    // -------------------------------------------------------------------------
    // KPI C: Approved Procurement Value (Grouped strictly by Currency)
    // Distinguishes buyer approval from successful payment capture.
    // -------------------------------------------------------------------------
    const approvedValueMap = new Map<string, { amount: number; count: number }>();
    for (const rec of activeAuditRecords) {
      const isApproved =
        rec.approvalGrantedBy !== null ||
        rec.status === 'ORDER_CREATED' ||
        rec.status === 'CAPTURED';

      if (isApproved && rec.productId !== 'N/A') {
        const cur = (rec.currency || 'USD').toUpperCase();
        currenciesSet.add(cur);
        const existing = approvedValueMap.get(cur) || { amount: 0, count: 0 };
        existing.amount += rec.amount;
        existing.count += 1;
        approvedValueMap.set(cur, existing);
      }
    }

    const approvedValueByCurrency: CurrencyMetric[] = Array.from(
      approvedValueMap.entries()
    ).map(([currency, data]) => ({
      currency,
      amount: Math.round(data.amount * 100) / 100,
      recordCount: data.count,
    }));

    // -------------------------------------------------------------------------
    // KPI D: Successfully Captured Payment Value (Verified PayPal Captures ONLY)
    // -------------------------------------------------------------------------
    const capturedValueMap = new Map<string, { amount: number; count: number }>();
    for (const rec of activeAuditRecords) {
      const isCaptured = rec.status === 'CAPTURED' && Boolean(rec.paypalCaptureId);
      if (isCaptured) {
        const cur = (rec.currency || 'USD').toUpperCase();
        currenciesSet.add(cur);
        const existing = capturedValueMap.get(cur) || { amount: 0, count: 0 };
        existing.amount += rec.amount;
        existing.count += 1;
        capturedValueMap.set(cur, existing);
      }
    }

    const capturedValueByCurrency: CurrencyMetric[] = Array.from(
      capturedValueMap.entries()
    ).map(([currency, data]) => ({
      currency,
      amount: Math.round(data.amount * 100) / 100,
      recordCount: data.count,
    }));

    // -------------------------------------------------------------------------
    // Policy Outcome Counters & Distribution (Evaluations)
    // -------------------------------------------------------------------------
    let passCount = 0;
    let blockedCount = 0;
    let reviewCount = 0;

    const blockedValueMap = new Map<string, { amount: number; count: number }>();
    const reviewValueMap = new Map<string, { amount: number; count: number }>();

    for (const ev of activeEvaluations) {
      const prod = ev.product;
      const status = prod.evaluation?.overallStatus;
      const lineTotal = prod.lineTotal ?? prod.price ?? 0;
      const cur = (prod.currency || 'USD').toUpperCase();
      if (prod.currency) currenciesSet.add(cur);

      if (status === 'PASS') {
        passCount++;
      } else if (status === 'BLOCKED') {
        blockedCount++;
        if (lineTotal > 0) {
          const existing = blockedValueMap.get(cur) || { amount: 0, count: 0 };
          existing.amount += lineTotal;
          existing.count++;
          blockedValueMap.set(cur, existing);
        }
      } else if (status === 'REVIEW') {
        reviewCount++;
        if (lineTotal > 0) {
          const existing = reviewValueMap.get(cur) || { amount: 0, count: 0 };
          existing.amount += lineTotal;
          existing.count++;
          reviewValueMap.set(cur, existing);
        }
      }
    }

    // Previous window comparison for blocked and review
    const prevBlockedCount = prevEvaluations.filter(
      (e) => e.product.evaluation.overallStatus === 'BLOCKED'
    ).length;
    const prevReviewCount = prevEvaluations.filter(
      (e) => e.product.evaluation.overallStatus === 'REVIEW'
    ).length;

    const totalEvaluations = passCount + blockedCount + reviewCount;

    const blockedMetric: MetricWithComparison = {
      value: blockedCount,
      previousValue: dateRange.previousStartDate ? prevBlockedCount : null,
      changePercentage:
        dateRange.previousStartDate && prevBlockedCount > 0
          ? Math.round(((blockedCount - prevBlockedCount) / prevBlockedCount) * 100)
          : null,
      hasSufficientHistory: Boolean(dateRange.previousStartDate && prevBlockedCount > 0),
    };

    const reviewMetric: MetricWithComparison = {
      value: reviewCount,
      previousValue: dateRange.previousStartDate ? prevReviewCount : null,
      changePercentage:
        dateRange.previousStartDate && prevReviewCount > 0
          ? Math.round(((reviewCount - prevReviewCount) / prevReviewCount) * 100)
          : null,
      hasSufficientHistory: Boolean(dateRange.previousStartDate && prevReviewCount > 0),
    };

    const blockedEstimatedValueByCurrency: CurrencyMetric[] = Array.from(
      blockedValueMap.entries()
    ).map(([currency, d]) => ({
      currency,
      amount: Math.round(d.amount * 100) / 100,
      recordCount: d.count,
    }));

    const reviewEstimatedValueByCurrency: CurrencyMetric[] = Array.from(
      reviewValueMap.entries()
    ).map(([currency, d]) => ({
      currency,
      amount: Math.round(d.amount * 100) / 100,
      recordCount: d.count,
    }));

    const decisionDistribution = {
      pass: {
        count: passCount,
        percentage: totalEvaluations > 0 ? Math.round((passCount / totalEvaluations) * 100) : 0,
      },
      blocked: {
        count: blockedCount,
        percentage: totalEvaluations > 0 ? Math.round((blockedCount / totalEvaluations) * 100) : 0,
      },
      review: {
        count: reviewCount,
        percentage: totalEvaluations > 0 ? Math.round((reviewCount / totalEvaluations) * 100) : 0,
      },
      total: totalEvaluations,
    };

    // -------------------------------------------------------------------------
    // Category Breakdown (Aggregated by ProcurementCategory)
    // -------------------------------------------------------------------------
    const standardCategories: ProcurementCategory[] = [
      'computing',
      'office_supplies',
      'printer_consumables',
      'cleaning_supplies',
      'tools_hardware',
      'furniture',
      'general',
    ];

    const categoryMap = new Map<ProcurementCategory, CategorySummary>();
    for (const cat of standardCategories) {
      categoryMap.set(cat, {
        category: cat,
        categoryDisplayName: getCategoryDisplayName(cat),
        totalRequests: 0,
        totalEvaluations: 0,
        passCount: 0,
        blockedCount: 0,
        reviewCount: 0,
        passRate: 0,
        blockedRate: 0,
        spendByCurrency: {},
        estimatedValueByCurrency: {},
      });
    }

    // Tally requirements per category
    for (const req of activeRequirements) {
      const cat = classifyCategory(req.category || req.subcategory || req.targetItem);
      const summary = categoryMap.get(cat);
      if (summary) {
        summary.totalRequests++;
        const cur = (req.currency || 'USD').toUpperCase();
        if (req.maxBudget > 0) {
          summary.estimatedValueByCurrency[cur] =
            (summary.estimatedValueByCurrency[cur] || 0) + req.maxBudget;
        }
      }
    }

    // Tally evaluations per category
    for (const ev of activeEvaluations) {
      const cat =
        ev.product.evaluation.resolvedCategory ||
        classifyCategory(ev.product.title);
      const summary = categoryMap.get(cat) || categoryMap.get('general')!;
      summary.totalEvaluations++;
      const st = ev.product.evaluation.overallStatus;
      if (st === 'PASS') summary.passCount++;
      else if (st === 'BLOCKED') summary.blockedCount++;
      else if (st === 'REVIEW') summary.reviewCount++;
    }

    // Tally captured spend per category from audit ledger
    for (const rec of activeAuditRecords) {
      if (rec.status === 'CAPTURED' && rec.amount > 0) {
        const cat = classifyCategory(rec.subcategory || rec.productTitle);
        const summary = categoryMap.get(cat) || categoryMap.get('general')!;
        const cur = (rec.currency || 'USD').toUpperCase();
        summary.spendByCurrency[cur] = (summary.spendByCurrency[cur] || 0) + rec.amount;
      }
    }

    // Compute rates for each category
    const categories: CategorySummary[] = Array.from(categoryMap.values()).map((c) => {
      const total = c.totalEvaluations;
      return {
        ...c,
        passRate: total > 0 ? Math.round((c.passCount / total) * 100) : 0,
        blockedRate: total > 0 ? Math.round((c.blockedCount / total) * 100) : 0,
      };
    });

    // Count unclassified general records
    const generalCat = categoryMap.get('general');
    if (generalCat && generalCat.totalRequests > 0) {
      unclassifiedRecordsCount += generalCat.totalRequests;
    }

    // -------------------------------------------------------------------------
    // Time Series Aggregation (Daily Buckets)
    // -------------------------------------------------------------------------
    const timeSeriesMap = new Map<string, TimeSeriesBucket>();

    const getBucketKey = (d: Date): { key: string; label: string } => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return { key, label };
    };

    // Populate from requirements
    for (const req of activeRequirements) {
      const d = parseEventTime(req.createdAt);
      if (!d) continue;
      const { key, label } = getBucketKey(d);
      if (!timeSeriesMap.has(key)) {
        timeSeriesMap.set(key, {
          dateKey: key,
          periodLabel: label,
          requestsCount: 0,
          evaluationsCount: 0,
          passCount: 0,
          blockedCount: 0,
          reviewCount: 0,
          estimatedValueByCurrency: {},
          capturedValueByCurrency: {},
        });
      }
      const b = timeSeriesMap.get(key)!;
      b.requestsCount++;
      const cur = (req.currency || 'USD').toUpperCase();
      if (req.maxBudget > 0) {
        b.estimatedValueByCurrency[cur] = (b.estimatedValueByCurrency[cur] || 0) + req.maxBudget;
      }
    }

    // Populate from evaluations
    for (const ev of activeEvaluations) {
      const d = parseEventTime(ev.timestamp);
      if (!d) continue;
      const { key, label } = getBucketKey(d);
      if (!timeSeriesMap.has(key)) {
        timeSeriesMap.set(key, {
          dateKey: key,
          periodLabel: label,
          requestsCount: 0,
          evaluationsCount: 0,
          passCount: 0,
          blockedCount: 0,
          reviewCount: 0,
          estimatedValueByCurrency: {},
          capturedValueByCurrency: {},
        });
      }
      const b = timeSeriesMap.get(key)!;
      b.evaluationsCount++;
      const st = ev.product.evaluation.overallStatus;
      if (st === 'PASS') b.passCount++;
      else if (st === 'BLOCKED') b.blockedCount++;
      else if (st === 'REVIEW') b.reviewCount++;
    }

    // Populate from captured payments
    for (const rec of activeAuditRecords) {
      if (rec.status === 'CAPTURED') {
        const d = parseEventTime(rec.timestamp);
        if (!d) continue;
        const { key, label } = getBucketKey(d);
        if (!timeSeriesMap.has(key)) {
          timeSeriesMap.set(key, {
            dateKey: key,
            periodLabel: label,
            requestsCount: 0,
            evaluationsCount: 0,
            passCount: 0,
            blockedCount: 0,
            reviewCount: 0,
            estimatedValueByCurrency: {},
            capturedValueByCurrency: {},
          });
        }
        const b = timeSeriesMap.get(key)!;
        const cur = (rec.currency || 'USD').toUpperCase();
        b.capturedValueByCurrency[cur] = (b.capturedValueByCurrency[cur] || 0) + rec.amount;
      }
    }

    const timeSeries = Array.from(timeSeriesMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );

    // -------------------------------------------------------------------------
    // Budget Utilisation Scopes (Per-Request Scope)
    // -------------------------------------------------------------------------
    const budgetUtilisations: BudgetUtilisationScope[] = [];
    for (const req of activeRequirements) {
      if (typeof req.maxBudget !== 'number' || req.maxBudget <= 0) continue;

      // Find committed spend for this requirement from audit records
      const committed = activeAuditRecords
        .filter(
          (a) =>
            a.requirementId === req.id &&
            (a.status === 'ORDER_CREATED' || a.status === 'CAPTURED') &&
            a.productId !== 'N/A'
        )
        .reduce((sum, a) => sum + (a.amount || 0), 0);

      const remaining = Math.max(0, req.maxBudget - committed);
      const utilisation = Math.round((committed / req.maxBudget) * 100);

      budgetUtilisations.push({
        requirementId: req.id,
        targetItem: req.targetItem,
        category: getCategoryDisplayName(req.category),
        currency: (req.currency || 'USD').toUpperCase(),
        budgetCeiling: req.maxBudget,
        committedSpend: Math.round(committed * 100) / 100,
        remainingHeadroom: Math.round(remaining * 100) / 100,
        utilisationPercentage: utilisation,
        status: utilisation > 100 ? 'EXCEEDED' : utilisation >= 80 ? 'WARNING' : 'SAFE',
      });
    }

    // -------------------------------------------------------------------------
    // Compliance Insights (Rule Violations, Review Reasons, Missing Attributes)
    // -------------------------------------------------------------------------
    const violationMap = new Map<string, { count: number; evidence: string[] }>();
    const reviewReasonMap = new Map<string, { count: number; evidence: string[] }>();
    const missingAttrMap = new Map<string, number>();

    for (const ev of activeEvaluations) {
      const checks = ev.product.evaluation.checks || [];
      for (const chk of checks) {
        if (chk.status === 'FAIL') {
          const existing = violationMap.get(chk.ruleName) || { count: 0, evidence: [] };
          existing.count++;
          if (existing.evidence.length < 3 && chk.evidence) {
            existing.evidence.push(chk.evidence);
          }
          violationMap.set(chk.ruleName, existing);
        } else if (chk.status === 'UNKNOWN') {
          const existing = reviewReasonMap.get(chk.ruleName) || { count: 0, evidence: [] };
          existing.count++;
          if (existing.evidence.length < 3 && chk.evidence) {
            existing.evidence.push(chk.evidence);
          }
          reviewReasonMap.set(chk.ruleName, existing);

          // Extract missing attribute name
          const lower = chk.ruleName.toLowerCase();
          if (lower.includes('ram')) {
            missingAttrMap.set('RAM (Memory)', (missingAttrMap.get('RAM (Memory)') || 0) + 1);
          } else if (lower.includes('storage')) {
            missingAttrMap.set('Storage (SSD)', (missingAttrMap.get('Storage (SSD)') || 0) + 1);
          } else if (lower.includes('gsm') || lower.includes('paper')) {
            missingAttrMap.set('Paper Weight / GSM', (missingAttrMap.get('Paper Weight / GSM') || 0) + 1);
          } else if (lower.includes('voltage') || lower.includes('volt')) {
            missingAttrMap.set('Tool Voltage', (missingAttrMap.get('Tool Voltage') || 0) + 1);
          } else if (lower.includes('port')) {
            missingAttrMap.set('Port Count', (missingAttrMap.get('Port Count') || 0) + 1);
          } else {
            missingAttrMap.set(chk.ruleName, (missingAttrMap.get(chk.ruleName) || 0) + 1);
          }
        }
      }
    }

    const topBlockingRules: PolicyRuleViolation[] = Array.from(violationMap.entries())
      .map(([ruleName, data]) => ({
        ruleName,
        violationCount: data.count,
        sampleEvidence: data.evidence,
      }))
      .sort((a, b) => b.violationCount - a.violationCount)
      .slice(0, 5);

    const topReviewReasons: PolicyReviewReason[] = Array.from(reviewReasonMap.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        sampleEvidence: data.evidence,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const frequentMissingAttributes = Array.from(missingAttrMap.entries())
      .map(([attribute, count]) => ({ attribute, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Categories with notable rates (requiring sample size >= 2 for statistical validity)
    const ratedCategories = categories.filter((c) => c.totalEvaluations >= 2);
    const highestBlockedCat =
      ratedCategories.length > 0
        ? [...ratedCategories].sort((a, b) => b.blockedRate - a.blockedRate)[0]
        : null;
    const highestPassCat =
      ratedCategories.length > 0
        ? [...ratedCategories].sort((a, b) => b.passRate - a.passRate)[0]
        : null;

    // -------------------------------------------------------------------------
    // Recent Activity Feed
    // -------------------------------------------------------------------------
    const activityFeed: AnalyticsActivityEvent[] = [];

    // Map audit records
    for (const rec of activeAuditRecords) {
      let eventType: AnalyticsActivityEvent['eventType'] = 'REQUEST_CREATED';
      if (rec.status === 'CAPTURED') eventType = 'PAYMENT_CAPTURED';
      else if (rec.status === 'ORDER_CREATED') eventType = 'ORDER_CREATED';
      else if (rec.status === 'REJECTED' || rec.status === 'FAILED') eventType = 'ORDER_REJECTED';

      const approvalStatus: AnalyticsActivityEvent['approvalStatus'] =
        rec.approvalGrantedBy !== null
          ? 'APPROVED'
          : rec.status === 'REJECTED'
          ? 'REJECTED'
          : rec.status === 'ORDER_CREATED'
          ? 'APPROVED'
          : 'PENDING';

      const paymentStatus: AnalyticsActivityEvent['paymentStatus'] =
        rec.status === 'CAPTURED'
          ? 'CAPTURED'
          : rec.status === 'ORDER_CREATED'
          ? 'PENDING'
          : rec.status === 'FAILED'
          ? 'FAILED'
          : rec.status === 'REJECTED'
          ? 'CANCELLED'
          : 'NOT_CREATED';

      activityFeed.push({
        id: rec.id,
        timestamp: rec.timestamp,
        eventType,
        requirementId: rec.requirementId,
        category: getCategoryDisplayName(rec.subcategory),
        subcategory: rec.subcategory,
        productTitle: rec.productTitle,
        productId: rec.productId,
        unitPrice: rec.unitPrice ?? null,
        quantity: rec.quantity || 1,
        estimatedTotal: rec.amount,
        currency: (rec.currency || 'USD').toUpperCase(),
        policyStatus: rec.policyStatus,
        approvalStatus,
        paymentStatus,
        paypalOrderId: rec.paypalOrderId,
        paypalCaptureId: rec.paypalCaptureId,
        notes: rec.notes,
      });
    }

    // Map evaluations
    for (const ev of activeEvaluations) {
      const p = ev.product;
      activityFeed.push({
        id: ev.id,
        timestamp: ev.timestamp,
        eventType: 'EVALUATION',
        requirementId: ev.requirementId,
        category: getCategoryDisplayName(p.evaluation.resolvedCategory || p.supplierCategory),
        subcategory: p.evaluation.resolvedSubcategory,
        productTitle: p.title,
        productId: p.id,
        merchant: p.merchant,
        unitPrice: p.price,
        quantity: p.quantity || 1,
        estimatedTotal: p.lineTotal ?? (p.price ? p.price * (p.quantity || 1) : null),
        currency: (p.currency || 'USD').toUpperCase(),
        policyStatus: p.evaluation.overallStatus,
        approvalStatus: 'N/A',
        paymentStatus: 'NOT_CREATED',
        notes: p.evaluation.summary,
      });
    }

    // Sort descending by timestamp
    activityFeed.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // -------------------------------------------------------------------------
    // Data Quality Warnings
    // -------------------------------------------------------------------------
    const warnings: string[] = [];
    const currenciesPresent = Array.from(currenciesSet);

    if (allRequirements.length === 0 && allAuditRecords.length === 0 && allEvaluations.length === 0) {
      warnings.push(
        'No procurement activity has been recorded yet. Submit a procurement request to begin building your analytics.'
      );
    }

    if (capturedValueByCurrency.length === 0 && (passCount > 0 || blockedCount > 0)) {
      warnings.push(
        'No payments have been captured yet. Payment analytics will become available when verified PayPal transactions are completed.'
      );
    }

    if (currenciesPresent.length > 1) {
      warnings.push(
        `Multi-currency records detected (${currenciesPresent.join(
          ', '
        )}). Values are aggregated strictly per currency without artificial currency conversion.`
      );
    }

    if (missingPriceRecordsCount > 0) {
      warnings.push(
        `${missingPriceRecordsCount} item listing(s) had unlisted or invalid prices and were excluded from monetary aggregation.`
      );
    }

    if (unclassifiedRecordsCount > 0) {
      warnings.push(
        `${unclassifiedRecordsCount} request(s) had general or unclassified categories and are reported under General / Other.`
      );
    }

    return {
      reportingPeriod: {
        period,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        previousStartDate: dateRange.previousStartDate ? dateRange.previousStartDate.toISOString() : null,
        previousEndDate: dateRange.previousEndDate ? dateRange.previousEndDate.toISOString() : null,
      },
      kpis: {
        totalRequests: totalRequestsMetric,
        estimatedValueByCurrency,
        approvedValueByCurrency,
        capturedValueByCurrency,
        blockedEvaluationsCount: blockedMetric,
        blockedEstimatedValueByCurrency,
        reviewEvaluationsCount: reviewMetric,
        reviewEstimatedValueByCurrency,
        totalEvaluationsCount: totalEvaluations,
        passEvaluationsCount: passCount,
      },
      decisionDistribution,
      categories,
      timeSeries,
      budgetUtilisations,
      complianceInsights: {
        topBlockingRules,
        topReviewReasons,
        categoryWithHighestBlockedRate: highestBlockedCat
          ? {
              categoryName: highestBlockedCat.categoryDisplayName,
              blockedRate: highestBlockedCat.blockedRate,
              sampleSize: highestBlockedCat.totalEvaluations,
            }
          : null,
        categoryWithHighestPassRate: highestPassCat
          ? {
              categoryName: highestPassCat.categoryDisplayName,
              passRate: highestPassCat.passRate,
              sampleSize: highestPassCat.totalEvaluations,
            }
          : null,
        frequentMissingAttributes,
      },
      recentActivity: activityFeed.slice(0, 100),
      dataQuality: {
        totalRecordsAudited: allAuditRecords.length + allEvaluations.length + allRequirements.length,
        unclassifiedRecordsCount,
        missingPriceRecordsCount,
        missingTimestampRecordsCount,
        multiCurrencyPresent: currenciesPresent.length > 1,
        currenciesPresent,
        warnings,
      },
    };
  }

  /**
   * Generates a standard RFC 4180 CSV export string from filtered activity records.
   */
  public static generateCsvExport(activityRecords: AnalyticsActivityEvent[]): string {
    const headers = [
      'Date',
      'Event Type',
      'Requirement ID',
      'Category',
      'Subcategory',
      'Product / Item Title',
      'Product ID',
      'Merchant / Supplier',
      'Unit Price',
      'Quantity',
      'Estimated Total',
      'Currency',
      'Policy Decision',
      'Buyer Approval',
      'Payment Status',
      'PayPal Order ID',
      'PayPal Capture ID',
      'Notes',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = activityRecords.map((r) => [
      escapeCsv(r.timestamp),
      escapeCsv(r.eventType),
      escapeCsv(r.requirementId),
      escapeCsv(r.category),
      escapeCsv(r.subcategory || ''),
      escapeCsv(r.productTitle),
      escapeCsv(r.productId),
      escapeCsv(r.merchant || ''),
      escapeCsv(r.unitPrice !== null ? r.unitPrice.toFixed(2) : ''),
      escapeCsv(r.quantity),
      escapeCsv(r.estimatedTotal !== null ? r.estimatedTotal.toFixed(2) : ''),
      escapeCsv(r.currency),
      escapeCsv(r.policyStatus),
      escapeCsv(r.approvalStatus),
      escapeCsv(r.paymentStatus),
      escapeCsv(r.paypalOrderId || ''),
      escapeCsv(r.paypalCaptureId || ''),
      escapeCsv(r.notes || ''),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }
}
