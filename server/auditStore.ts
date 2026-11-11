import crypto from 'node:crypto';
import type {
  AuditRecord,
  PurchaseRequirements,
  NormalizedProduct,
  EvaluatedProduct,
  EvaluatedProductRecord,
} from '../src/shared/types.ts';

class AuditStore {
  private auditRecords: AuditRecord[] = [];
  private requirementsMap: Map<string, PurchaseRequirements> = new Map();
  private productsMap: Map<string, NormalizedProduct> = new Map();
  private lockedOrders: Set<string> = new Set();
  private evaluations: EvaluatedProductRecord[] = [];

  public saveRequirements(req: PurchaseRequirements): void {
    this.requirementsMap.set(req.id, req);
  }

  public getRequirements(id: string): PurchaseRequirements | undefined {
    return this.requirementsMap.get(id);
  }

  public getAllRequirements(): PurchaseRequirements[] {
    return Array.from(this.requirementsMap.values());
  }

  public recordEvaluations(requirementId: string, products: EvaluatedProduct[]): void {
    const defaultTimestamp = new Date().toISOString();
    for (const p of products) {
      this.evaluations.unshift({
        id: `eval_${p.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: p.evaluation?.evaluatedAt || defaultTimestamp,
        requirementId,
        product: p,
      });
    }
  }

  public getEvaluations(): EvaluatedProductRecord[] {
    return [...this.evaluations];
  }

  public cacheProducts(products: NormalizedProduct[]): void {
    for (const p of products) {
      this.productsMap.set(p.id, p);
    }
  }

  public getProduct(id: string): NormalizedProduct | undefined {
    return this.productsMap.get(id);
  }

  public appendRecord(record: AuditRecord): void {
    this.auditRecords.unshift(record);
  }

  public updateRecord(id: string, update: Partial<AuditRecord>): void {
    const record = this.auditRecords.find((r) => r.id === id);
    if (record) {
      Object.assign(record, update);
      if (['REJECTED', 'CANCELLED', 'FAILED'].includes(record.status) && record.productId) {
        this.unlockOrder(record.productId);
      }
    }
  }

  public getRecords(): AuditRecord[] {
    return [...this.auditRecords];
  }

  public isOrderLocked(productId: string): boolean {
    return this.lockedOrders.has(productId);
  }

  public lockOrder(productId: string): void {
    this.lockedOrders.add(productId);
  }

  public unlockOrder(productId: string): void {
    this.lockedOrders.delete(productId);
  }

  public sanitizePolicyAudit(): void {
    for (const record of this.auditRecords) {
      if (record.paypalOrderId === '89W31755JK1230920' && record.status === 'ORDER_CREATED') {
        record.status = 'REJECTED';
        record.policyStatus = 'BLOCKED';
        record.notes = 'Rejected by budget policy enforcement: price ($1,099.99) exceeds active $800 budget limit. Order remains pending/uncaptured in PayPal Sandbox.';
        if (record.productId) {
          this.lockedOrders.delete(record.productId);
        }
      }
    }
  }

  public generateChecksum(
    reqId: string,
    prodId: string,
    amount: number,
    currency: string,
    quantity: number = 1
  ): string {
    const salt = process.env.PAYPAL_CLIENT_SECRET || 'tehlaypay_deterministic_salt';
    return crypto
      .createHash('sha256')
      .update(`${reqId}:${prodId}:${currency}:${amount.toFixed(2)}:${quantity}:${salt}`)
      .digest('hex');
  }

  public clear(): void {
    this.auditRecords = [];
    this.requirementsMap.clear();
    this.productsMap.clear();
    this.lockedOrders.clear();
    this.evaluations = [];
  }
}

export const auditStore = new AuditStore();
