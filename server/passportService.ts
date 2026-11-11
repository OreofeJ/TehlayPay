import crypto from 'node:crypto';
import type {
  PurchaseRequirements,
  EvaluatedProduct,
  AuditRecord,
  ProcurementPassport,
  PassportVerificationResult,
} from '../src/shared/types.ts';
import { auditStore } from './auditStore.ts';
import { evaluateProductPolicy } from '../src/policyEngine/policyEngine.ts';

export class PassportService {
  /**
   * Generates a structured TehlayPay Procurement Decision Passport
   */
  public generatePassport(params: {
    requirement: PurchaseRequirements;
    product: EvaluatedProduct;
    auditRecord?: AuditRecord;
  }): ProcurementPassport {
    const { requirement, product, auditRecord } = params;

    const timestamp = new Date().toISOString();
    const reqShort = requirement.id ? requirement.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() : 'REQ001';
    const prodShort = product.id ? product.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() : 'PROD01';
    const timeShort = Date.now().toString(36).toUpperCase();
    const passportReference = `TLP-PASSPORT-${reqShort}-${prodShort}-${timeShort}`;

    // Extract mandatory specs object
    const mandatorySpecs: Record<string, string | number> = {};
    if (requirement.minRamGb && requirement.minRamGb > 0) {
      mandatorySpecs['Minimum RAM'] = `${requirement.minRamGb} GB`;
    }
    if (requirement.minStorageGb && requirement.minStorageGb > 0) {
      mandatorySpecs['Minimum Storage'] = `${requirement.minStorageGb} GB`;
    }
    if (requirement.criticalSpecs) {
      for (const [k, v] of Object.entries(requirement.criticalSpecs)) {
        mandatorySpecs[k] = v;
      }
    }
    if (requirement.enforceTargetSpecs && requirement.targetSpecs) {
      for (const [k, v] of Object.entries(requirement.targetSpecs)) {
        mandatorySpecs[k] = v;
      }
    }

    const qty = requirement.quantity && requirement.quantity > 0 ? requirement.quantity : 1;
    const lineTotal = product.price !== null ? product.price * qty : null;

    // Use current product evaluation or recompute deterministically
    const evaluation = product.evaluation || evaluateProductPolicy(product, requirement);

    // Build transparent decision explanation
    let decisionExplanation = '';
    const failedChecks = evaluation.checks.filter((c) => c.status === 'FAIL');
    const unknownChecks = evaluation.checks.filter((c) => c.mandatory && c.status === 'UNKNOWN');

    if (evaluation.overallStatus === 'PASS') {
      decisionExplanation = `The evaluated product satisfies all mandatory procurement constraints under policy "${requirement.targetItem}". The unit price of ${product.currency || requirement.currency} ${product.price?.toFixed(2)} (estimated line total: ${product.currency || requirement.currency} ${lineTotal?.toFixed(2)}) is within the ${requirement.currency} ${requirement.maxBudget.toFixed(2)} ceiling. Product condition "${product.condition}" is permitted.`;
    } else if (evaluation.overallStatus === 'BLOCKED') {
      const reasons = failedChecks.map((c) => c.evidence).join('; ');
      decisionExplanation = `Purchase BLOCKED by deterministic server policy. ${reasons}`;
    } else {
      const reasons = unknownChecks.map((c) => c.evidence).join('; ');
      decisionExplanation = `Purchase held for OWNER REVIEW. Unconfirmed mandatory attributes: ${reasons}`;
    }

    // Determine buyer decision and payment record based on actual audit record (if one exists)
    let buyerDecisionStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
    let approver: string | null = null;
    let approvalTimestamp: string | null = null;
    let approvalReference: string | undefined = undefined;

    let orderCreationStatus: 'NOT_CREATED' | 'CREATED' | 'FAILED' = 'NOT_CREATED';
    let buyerApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'N/A' = 'PENDING';
    let paymentCaptureStatus: 'UNATTEMPTED' | 'NOT_CREATED' | 'PENDING' | 'CAPTURED' | 'FAILED' | 'CANCELLED' = 'NOT_CREATED';
    let paypalOrderId: string | undefined = undefined;
    let paypalCaptureId: string | undefined = undefined;
    let capturedAmount: number | undefined = undefined;
    let capturedCurrency: string | undefined = undefined;
    let capturedAt: string | undefined = undefined;
    let paymentNotes = 'No checkout transaction has been initiated for this product.';

    if (auditRecord) {
      if (auditRecord.status === 'CAPTURED') {
        buyerDecisionStatus = 'APPROVED';
        approver = auditRecord.approvalGrantedBy || 'Authorized Buyer';
        approvalTimestamp = auditRecord.timestamp;
        approvalReference = auditRecord.id;

        orderCreationStatus = 'CREATED';
        buyerApprovalStatus = 'APPROVED';
        paymentCaptureStatus = 'CAPTURED';
        paypalOrderId = auditRecord.paypalOrderId;
        paypalCaptureId = auditRecord.paypalCaptureId;
        capturedAmount = auditRecord.amount;
        capturedCurrency = auditRecord.currency;
        capturedAt = auditRecord.timestamp;
        paymentNotes = `Payment successfully captured in PayPal Sandbox under Capture ID ${auditRecord.paypalCaptureId}. Order reference ${auditRecord.paypalOrderId}.`;
      } else if (auditRecord.status === 'ORDER_CREATED') {
        buyerDecisionStatus = 'APPROVED';
        approver = auditRecord.approvalGrantedBy || 'Authorized Buyer';
        approvalTimestamp = auditRecord.timestamp;
        approvalReference = auditRecord.id;

        orderCreationStatus = 'CREATED';
        buyerApprovalStatus = 'APPROVED';
        paymentCaptureStatus = 'PENDING';
        paypalOrderId = auditRecord.paypalOrderId;
        paymentNotes = `PayPal order created (${auditRecord.paypalOrderId}). Awaiting PayPal Sandbox checkout and buyer payment capture. Payment is NOT yet completed.`;
      } else if (auditRecord.status === 'REJECTED') {
        buyerDecisionStatus = 'REJECTED';
        approver = auditRecord.approvalGrantedBy;
        approvalTimestamp = auditRecord.timestamp;
        approvalReference = auditRecord.id;

        orderCreationStatus = auditRecord.paypalOrderId ? 'CREATED' : 'NOT_CREATED';
        buyerApprovalStatus = 'REJECTED';
        paymentCaptureStatus = 'CANCELLED';
        paypalOrderId = auditRecord.paypalOrderId;
        paymentNotes = auditRecord.notes || 'Order was rejected or canceled by policy enforcement.';
      } else if (auditRecord.status === 'FAILED') {
        orderCreationStatus = 'FAILED';
        paymentCaptureStatus = 'FAILED';
        paymentNotes = auditRecord.notes || 'Transaction failed during processing.';
      } else {
        buyerDecisionStatus = 'PENDING';
        buyerApprovalStatus = 'PENDING';
        paymentCaptureStatus = 'NOT_CREATED';
        paymentNotes = 'Product evaluation recorded in audit ledger. Awaiting buyer decision.';
      }
    }

    // Audit verification hash
    const expectedHash = auditRecord
      ? auditRecord.verificationHash
      : auditStore.generateChecksum(
          requirement.id,
          product.id,
          lineTotal ?? product.price ?? 0,
          product.currency || requirement.currency,
          qty
        );

    const recordFound = Boolean(auditRecord);
    const integrityVerified = Boolean(
      auditRecord &&
        auditRecord.verificationHash &&
        auditRecord.verificationHash ===
          auditStore.generateChecksum(
            auditRecord.requirementId,
            auditRecord.productId,
            auditRecord.amount,
            auditRecord.currency,
            auditRecord.quantity || 1
          )
    );

    return {
      passportReference,
      generatedAt: timestamp,
      requestReference: requirement.id,
      request: {
        originalPrompt: requirement.originalPrompt,
        targetItem: requirement.targetItem,
        category: requirement.category,
        subcategory: requirement.subcategory,
        quantity: qty,
        maxBudget: requirement.maxBudget,
        currency: requirement.currency,
        allowedConditions: [...requirement.allowedConditions],
        mandatorySpecs,
        extractedReasoning: requirement.extractedReasoning,
      },
      product: {
        id: product.id,
        title: product.title,
        merchant: product.merchant,
        sku: product.sku,
        productUrl: product.productUrl,
        price: product.price,
        currency: product.currency,
        condition: product.condition,
        quantity: qty,
        lineTotal,
        ramGb: product.ramGb,
        storageGb: product.storageGb,
        description: product.description,
        dataSource: product.dataSource,
      },
      policyEvaluation: {
        overallStatus: evaluation.overallStatus,
        summary: evaluation.summary,
        checks: evaluation.checks,
        evaluatedAt: evaluation.evaluatedAt,
        resolvedCategory: evaluation.resolvedCategory,
        resolvedSubcategory: evaluation.resolvedSubcategory,
      },
      decisionExplanation,
      buyerDecision: {
        status: buyerDecisionStatus,
        approver,
        timestamp: approvalTimestamp,
        approvalReference,
      },
      paymentRecord: {
        paypalOrderId,
        orderCreationStatus,
        buyerApprovalStatus,
        paymentCaptureStatus,
        paypalCaptureId,
        capturedAmount,
        capturedCurrency,
        capturedAt,
        notes: paymentNotes,
      },
      audit: {
        auditReference: auditRecord?.id,
        verificationHash: expectedHash,
        recordFound,
        integrityVerified,
        passportGeneratedAt: timestamp,
      },
    };
  }

  /**
   * Verifies whether a Passport reference or hash matches stored authoritative records
   */
  public verifyPassport(passportReference: string, verificationHash?: string): PassportVerificationResult {
    const records = auditStore.getRecords();

    // Try finding by audit ID or matching hash
    const record = records.find(
      (r) =>
        r.id === passportReference ||
        (verificationHash && r.verificationHash === verificationHash) ||
        (r.paypalOrderId && passportReference.includes(r.paypalOrderId)) ||
        (r.paypalCaptureId && passportReference.includes(r.paypalCaptureId))
    );

    if (!record) {
      return {
        passportReference,
        recordExists: false,
        recordMatches: false,
        captureConfirmedByPayPal: false,
        message: 'No corresponding audit record found in server ledger for this passport reference.',
      };
    }

    const calculatedHash = auditStore.generateChecksum(
      record.requirementId,
      record.productId,
      record.amount,
      record.currency,
      record.quantity || 1
    );

    const hashMatches = calculatedHash === record.verificationHash;
    const captureConfirmed = record.status === 'CAPTURED' && Boolean(record.paypalCaptureId);

    let message = '';
    if (hashMatches && captureConfirmed) {
      message = `Verified: Stored audit record ${record.id} matches cryptographic checksum. PayPal Sandbox payment capture confirmed (${record.paypalCaptureId}).`;
    } else if (hashMatches) {
      message = `Verified: Stored audit record ${record.id} matches cryptographic checksum. Current status: ${record.status}.`;
    } else {
      message = `Warning: Audit record ${record.id} found, but cryptographic checksum mismatch detected. Integrity compromised.`;
    }

    return {
      passportReference,
      recordExists: true,
      recordMatches: hashMatches,
      captureConfirmedByPayPal: captureConfirmed,
      message,
      record,
    };
  }
}

export const passportService = new PassportService();
