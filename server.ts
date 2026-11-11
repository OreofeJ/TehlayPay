import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { extractRequirementsFromPrompt } from './server/geminiService.ts';
import { Channel3Adapter } from './server/channel3Adapter.ts';
import { PayPalService } from './server/paypalService.ts';
import { auditStore } from './server/auditStore.ts';
import { evaluateProductPolicy } from './src/policyEngine/policyEngine.ts';
import { AnalyticsService } from './server/analyticsService.ts';
import { passportService } from './server/passportService.ts';
import type { EvaluatedProduct, AuditRecord, SystemStatus, PurchaseRequirements } from './src/shared/types.ts';
import { isConsumableCategory } from './src/shared/categories.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const portArgIndex = process.argv.indexOf('--port');
const hostArgIndex = process.argv.indexOf('--host');

const port =
  portArgIndex !== -1 && process.argv[portArgIndex + 1]
    ? parseInt(process.argv[portArgIndex + 1], 10)
    : process.env.PORT && process.env.PORT !== '8080'
    ? parseInt(process.env.PORT, 10)
    : 3000;

const host =
  hostArgIndex !== -1 && process.argv[hostArgIndex + 1]
    ? process.argv[hostArgIndex + 1]
    : '0.0.0.0';

process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Unhandled rejection intercepted:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});

app.use(express.json());

const channel3 = new Channel3Adapter();
const paypal = new PayPalService();

// ---------------------------------------------------------------------------
// 1. Health & Config Readiness Endpoint
// ---------------------------------------------------------------------------
app.get('/api/status', (_req, res) => {
  const c3Status = channel3.getStatus();
  const status = {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5),
    channel3Live: channel3.isLiveKeyConfigured(),
    channel3BaseUrl: channel3.getBaseUrl(),
    channel3Status: c3Status,
    paypalSandboxConnected: paypal.isSandboxConfigured(),
    paypalEnv: paypal.getEnvironment(),
    isProductionDisabled: true,
    paypalLive: paypal.isSandboxConfigured(),
  };
  res.json(status);
});

// ---------------------------------------------------------------------------
// 2. Extract Purchase Requirements via Gemini
// ---------------------------------------------------------------------------
app.post('/api/requirements/extract', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'A purchase request prompt string is required.' });
    }

    const requirements = await extractRequirementsFromPrompt(prompt.trim());
    auditStore.saveRequirements(requirements);

    const qty = requirements.quantity || 1;

    // Initial audit trace
    auditStore.appendRecord({
      id: `audit_init_${requirements.id.slice(-6)}`,
      timestamp: new Date().toISOString(),
      requirementId: requirements.id,
      productId: 'N/A',
      productTitle: `Intent: "${requirements.targetItem}" (${qty > 1 ? `Qty: ${qty}, ` : ''}Max ${requirements.currency} ${requirements.maxBudget})`,
      amount: requirements.maxBudget,
      currency: requirements.currency,
      quantity: qty,
      unitPrice: requirements.maxBudget / qty,
      subcategory: requirements.subcategory,
      policyStatus: 'PASS',
      approvalGrantedBy: null,
      status: 'PENDING_APPROVAL',
      verificationHash: auditStore.generateChecksum(requirements.id, 'none', requirements.maxBudget, requirements.currency, qty),
      notes: `Requirements extracted: ${requirements.extractedReasoning}`,
    });

    res.json(requirements);
  } catch (err: any) {
    console.error('[API] /api/requirements/extract failed:', err);
    res.status(500).json({ error: err.message || 'Failed to extract requirements.' });
  }
});

// ---------------------------------------------------------------------------
// 3. Update Policy Manually (Owner Override in Studio)
// ---------------------------------------------------------------------------
app.post('/api/requirements/update', (req, res) => {
  try {
    const incoming: PurchaseRequirements = req.body;
    if (
      !incoming?.id ||
      typeof incoming.maxBudget !== 'number' ||
      Number.isNaN(incoming.maxBudget) ||
      incoming.maxBudget <= 0
    ) {
      return res.status(400).json({
        error: 'Valid requirement object with id and positive numeric maxBudget is required.',
      });
    }

    if (!incoming.currency || typeof incoming.currency !== 'string') {
      return res.status(400).json({ error: 'Valid currency code is required.' });
    }

    if (!Array.isArray(incoming.allowedConditions) || incoming.allowedConditions.length === 0) {
      return res.status(400).json({ error: 'At least one allowed condition must be specified.' });
    }

    // Validate quantity if provided
    if (incoming.quantity !== undefined && incoming.quantity !== null) {
      if (typeof incoming.quantity !== 'number' || !Number.isInteger(incoming.quantity) || incoming.quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be a positive integer.' });
      }
    }

    // Server-side policy sanitization: Check category and targetItem independently for consumables
    const isConsumable =
      isConsumableCategory(incoming.category) ||
      isConsumableCategory(incoming.targetItem);

    // Create a pristine, non-mutating copy with sanitized conditions
    const sanitized: PurchaseRequirements = {
      ...incoming,
      quantity: incoming.quantity && incoming.quantity > 0 ? Math.floor(incoming.quantity) : 1,
      allowedConditions: isConsumable ? ['new'] : incoming.allowedConditions,
    };

    auditStore.saveRequirements(sanitized);
    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Product Search via Channel3 & Deterministic Policy Evaluation
// ---------------------------------------------------------------------------
app.post('/api/products/search-and-evaluate', async (req, res) => {
  try {
    const { requirementId, activePolicy } = req.body;

    let rawPolicy = activePolicy || auditStore.getRequirements(requirementId);

    if (!rawPolicy) {
      return res.status(404).json({ error: 'Purchase requirements not found or session expired.' });
    }

    const isConsumable =
      isConsumableCategory(rawPolicy.category) ||
      isConsumableCategory(rawPolicy.targetItem);

    const policy: PurchaseRequirements = {
      ...rawPolicy,
      allowedConditions: isConsumable ? ['new'] : rawPolicy.allowedConditions,
    };

    // Synchronize sanitized policy if provided by client
    if (activePolicy && activePolicy.id && typeof activePolicy.maxBudget === 'number' && activePolicy.maxBudget > 0) {
      auditStore.saveRequirements(policy);
    }

    const rawProducts = await channel3.searchProducts({
      query: policy.targetItem,
      category: policy.category,
      quantity: policy.quantity || 1,
      limit: 10,
    });

    // Cache products in server audit store for tamper-proofing
    auditStore.cacheProducts(rawProducts);

    // Run deterministic policy engine on each item against active policy
    const evaluatedProducts: EvaluatedProduct[] = rawProducts.map((prod) => ({
      ...prod,
      quantity: policy.quantity || 1,
      lineTotal: prod.price !== null ? prod.price * (policy.quantity || 1) : null,
      evaluation: evaluateProductPolicy(prod, policy),
    }));

    // Record authoritative candidate evaluations in audit store for analytics & compliance intelligence
    auditStore.recordEvaluations(policy.id, evaluatedProducts);

    res.json(evaluatedProducts);
  } catch (err: any) {
    console.error('[API] /api/products/search-and-evaluate failed:', err);
    res.status(500).json({ error: err.message || 'Product discovery or policy evaluation failed.' });
  }
});

// ---------------------------------------------------------------------------
// 5. Authoritative Order Creation (Strict Server Re-Verification & Budget Lock)
// ---------------------------------------------------------------------------
app.post('/api/checkout/create-order', async (req, res) => {
  try {
    const { requirementId, activePolicy, productId, userApprovedPrice } = req.body;

    // Synchronize and validate active policy from client if provided
    let rawPolicy: PurchaseRequirements | undefined;
    if (activePolicy && typeof activePolicy.maxBudget === 'number') {
      if (Number.isNaN(activePolicy.maxBudget) || activePolicy.maxBudget <= 0) {
        return res.status(400).json({
          error: 'Invalid activePolicy: maxBudget must be a positive finite number.',
        });
      }
      rawPolicy = activePolicy;
    } else {
      rawPolicy = auditStore.getRequirements(requirementId);
    }

    const product = auditStore.getProduct(productId);

    // FAIL-CLOSED SECURITY RULE 1: Missing requirement, missing product, or unverified catalog
    if (!rawPolicy) {
      return res.status(400).json({
        error: 'Active policy requirement is missing or expired. Checkout prevented.',
      });
    }

    if (!product) {
      return res.status(400).json({
        error: 'Product reference not found in verified server cache. The item must be discovered via Channel3 first.',
      });
    }

    // Server-side policy sanitization: Consumables must strictly enforce 'new' condition.
    // Inspect category, targetItem, and product title independently.
    const isConsumable =
      isConsumableCategory(rawPolicy.category) ||
      isConsumableCategory(rawPolicy.targetItem) ||
      isConsumableCategory(product.title);

    const effectivePolicy: PurchaseRequirements = {
      ...rawPolicy,
      quantity: rawPolicy.quantity && rawPolicy.quantity > 0 ? Math.floor(rawPolicy.quantity) : 1,
      allowedConditions: isConsumable ? ['new'] : rawPolicy.allowedConditions,
    };

    auditStore.saveRequirements(effectivePolicy);

    // FAIL-CLOSED SECURITY RULE 2: Validate policy attributes
    if (
      typeof effectivePolicy.maxBudget !== 'number' ||
      Number.isNaN(effectivePolicy.maxBudget) ||
      effectivePolicy.maxBudget <= 0
    ) {
      return res.status(400).json({
        error: 'Policy budget ceiling is invalid or non-positive. Checkout failed closed.',
      });
    }

    // FAIL-CLOSED SECURITY RULE 3: Validate verified server catalog price
    if (
      product.price === null ||
      product.price === undefined ||
      typeof product.price !== 'number' ||
      Number.isNaN(product.price)
    ) {
      return res.status(400).json({
        error: 'Product price is missing, unverified, or invalid in server catalog. Order creation BLOCKED.',
        status: 'BLOCKED',
      });
    }

    const qty =
      typeof effectivePolicy.quantity === 'number' &&
      !Number.isNaN(effectivePolicy.quantity) &&
      effectivePolicy.quantity > 0
        ? Math.floor(effectivePolicy.quantity)
        : 1;

    const lineTotal = product.price * qty;

    // FAIL-CLOSED SECURITY RULE 4: Strict independent server-side budget ceiling check (quantity-aware)
    if (lineTotal > effectivePolicy.maxBudget) {
      return res.status(403).json({
        error:
          qty > 1
            ? `Budget policy violation: Line total of ${effectivePolicy.currency} ${lineTotal.toFixed(2)} (${effectivePolicy.currency} ${product.price.toFixed(2)} x ${qty} units) exceeds maximum allowed budget ceiling of ${effectivePolicy.currency} ${effectivePolicy.maxBudget.toFixed(2)}. Order creation strictly BLOCKED.`
            : `Budget policy violation: Product price of ${effectivePolicy.currency} ${product.price.toFixed(2)} exceeds maximum allowed budget ceiling of ${effectivePolicy.currency} ${effectivePolicy.maxBudget.toFixed(2)}. Order creation strictly BLOCKED.`,
        status: 'BLOCKED',
        serverPrice: product.price,
        lineTotal,
        quantity: qty,
        maxBudget: effectivePolicy.maxBudget,
      });
    }

    // SECURITY RULE 5: Prevent duplicate checkout attempts / locked items
    if (auditStore.isOrderLocked(productId)) {
      return res.status(409).json({
        error: 'A checkout is already in progress or completed for this item. Duplicate order creation prevented.',
      });
    }

    // SECURITY RULE 6: Immediate independent server re-evaluation of product against policy
    const liveEvaluation = evaluateProductPolicy(product, effectivePolicy);
    if (liveEvaluation.overallStatus !== 'PASS') {
      return res.status(403).json({
        error: `Policy violation: Evaluated status is ${liveEvaluation.overallStatus}. Only fully compliant items can proceed to checkout.`,
        status: liveEvaluation.overallStatus,
        evaluation: liveEvaluation,
      });
    }

    // SECURITY RULE 7: Bound product price tampering check against server price (either unit price or line total)
    const submittedPriceNum = Number(userApprovedPrice);
    const matchesUnitPrice = Math.abs(product.price - submittedPriceNum) <= 0.001;
    const matchesLineTotal = Math.abs(lineTotal - submittedPriceNum) <= 0.001;

    if (!matchesUnitPrice && !matchesLineTotal) {
      return res.status(400).json({
        error: 'Price tampering detected: Submitted price does not match verified server catalog price.',
        serverPrice: product.price,
        lineTotal,
        submittedPrice: userApprovedPrice,
      });
    }

    // Generate cryptographic verification hash binding policy, product, line total, currency, and quantity
    const verificationHash = auditStore.generateChecksum(
      effectivePolicy.id,
      product.id,
      lineTotal,
      product.currency || 'USD',
      qty
    );

    // Compute working application URLs for PayPal Sandbox approval redirect
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const origin = (req.headers.origin as string) || `${proto}://${host}`;
    const defaultReturnUrl = `${origin}/?paypal_status=approved&requirement_id=${effectivePolicy.id}&product_id=${product.id}`;
    const defaultCancelUrl = `${origin}/?paypal_status=cancelled&product_id=${product.id}`;

    // Call PayPal Sandbox
    const orderResult = await paypal.createOrder({
      productTitle: qty > 1 ? `${product.title} (${qty} units)` : product.title,
      amount: lineTotal,
      currency: product.currency || 'USD',
      sku: product.sku,
      requirementId: effectivePolicy.id,
      returnUrl: req.body.returnUrl || defaultReturnUrl,
      cancelUrl: req.body.cancelUrl || defaultCancelUrl,
    });

    if (!orderResult.configured) {
      const auditEntry: AuditRecord = {
        id: `audit_${Math.random().toString(36).substring(2, 10)}`,
        timestamp: new Date().toISOString(),
        requirementId: effectivePolicy.id,
        productId: product.id,
        productTitle: qty > 1 ? `${product.title} (${qty} units)` : product.title,
        amount: lineTotal,
        unitPrice: product.price,
        quantity: qty,
        subcategory: liveEvaluation.resolvedSubcategory,
        currency: product.currency || 'USD',
        policyStatus: liveEvaluation.overallStatus,
        approvalGrantedBy: null,
        status: 'PENDING_APPROVAL',
        verificationHash,
        notes: orderResult.message || 'PayPal Sandbox credentials required.',
      };

      auditStore.appendRecord(auditEntry);

      return res.json({
        configured: false,
        auditId: auditEntry.id,
        verifiedProduct: { ...product, quantity: qty, lineTotal },
        verificationHash,
        status: 'AWAITING_CREDENTIALS',
        message: orderResult.message,
      });
    }

    const auditEntry: AuditRecord = {
      id: `audit_${Math.random().toString(36).substring(2, 10)}`,
      timestamp: new Date().toISOString(),
      requirementId: effectivePolicy.id,
      productId: product.id,
      productTitle: qty > 1 ? `${product.title} (${qty} units)` : product.title,
      amount: lineTotal,
      unitPrice: product.price,
      quantity: qty,
      subcategory: liveEvaluation.resolvedSubcategory,
      currency: product.currency || 'USD',
      policyStatus: liveEvaluation.overallStatus,
      approvalGrantedBy: 'Business Owner (Explicit Confirmation)',
      paypalOrderId: orderResult.orderId,
      status: 'ORDER_CREATED',
      verificationHash,
      notes: `PayPal Sandbox order created for ${qty} unit(s). Order ID: ${orderResult.orderId}`,
    };

    auditStore.appendRecord(auditEntry);
    auditStore.lockOrder(productId);

    res.json({
      configured: true,
      orderId: orderResult.orderId,
      approveUrl: orderResult.approveUrl,
      auditId: auditEntry.id,
      verifiedProduct: { ...product, quantity: qty, lineTotal },
      verificationHash,
    });
  } catch (err: any) {
    console.error('[API] /api/checkout/create-order failed:', err);
    res.status(500).json({ error: err.message || 'Order creation failed.' });
  }
});

// ---------------------------------------------------------------------------
// 6. PayPal Order Capture (Explicit Buyer Approval Verified)
// ---------------------------------------------------------------------------
app.post('/api/checkout/capture-order', async (req, res) => {
  try {
    const { orderId, auditId, userConfirmation } = req.body;

    if (!userConfirmation) {
      return res.status(400).json({ error: 'Explicit buyer approval is required prior to payment capture.' });
    }

    if (!paypal.isLiveCredentialsConfigured()) {
      return res.status(400).json({
        error: 'PayPal Sandbox credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET) are not configured. Cannot process live payment capture.',
        configured: false,
      });
    }

    const records = auditStore.getRecords();
    const auditRecord = records.find((r) => r.id === auditId);

    if (!auditRecord) {
      return res.status(404).json({ error: 'Audit record not found for this transaction.' });
    }

    // Call PayPal capture
    const captureResult = await paypal.captureOrder(
      orderId,
      auditRecord.amount,
      auditRecord.currency
    );

    // SECURITY RULE 4: Do not mark as completed until verified PayPal response confirms
    if (captureResult.status !== 'COMPLETED') {
      auditStore.updateRecord(auditId, {
        status: 'FAILED',
        notes: `PayPal capture returned non-completed status: ${captureResult.status}`,
      });
      return res.status(400).json({
        error: `Payment capture failed. PayPal returned status: ${captureResult.status}`,
      });
    }

    auditStore.updateRecord(auditId, {
      paypalCaptureId: captureResult.captureId,
      status: 'CAPTURED',
      notes: `Captured via PayPal Sandbox. Capture ID: ${captureResult.captureId}`,
    });

    res.json({
      success: true,
      captureId: captureResult.captureId,
      status: captureResult.status,
      configured: true,
      amount: captureResult.amount,
      currency: captureResult.currency,
    });
  } catch (err: any) {
    console.error('[API] /api/checkout/capture-order failed:', err);
    res.status(500).json({ error: err.message || 'Payment capture failed.' });
  }
});

// ---------------------------------------------------------------------------
// 7. Cancel / Dismiss Order Checkout (Safe Lock Release)
// ---------------------------------------------------------------------------
app.post('/api/checkout/cancel-order', (req, res) => {
  try {
    const { auditId, productId, orderId, reason } = req.body;

    if (productId) {
      auditStore.unlockOrder(productId);
    }

    const records = auditStore.getRecords();
    const matched = records.filter(
      (r) =>
        (auditId && r.id === auditId) ||
        (orderId && r.paypalOrderId === orderId) ||
        (productId && r.productId === productId && r.status === 'ORDER_CREATED')
    );

    for (const rec of matched) {
      if (rec.productId) {
        auditStore.unlockOrder(rec.productId);
      }
      auditStore.updateRecord(rec.id, {
        status: 'REJECTED',
        notes: reason || 'Checkout cancelled and locked item released.',
      });
    }

    res.json({
      cancelled: true,
      message: 'Order unlocked and marked cancelled in audit trail.',
      count: matched.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 8. Immutable Audit Logs & Export
// ---------------------------------------------------------------------------
app.get('/api/audit/logs', (_req, res) => {
  res.json(auditStore.getRecords());
});

// ---------------------------------------------------------------------------
// 9. Authoritative Procurement Analytics & Compliance Intelligence
// ---------------------------------------------------------------------------
app.get('/api/analytics/overview', (req, res) => {
  try {
    const { period, startDate, endDate, currency, category } = req.query as Record<string, string>;
    const overview = AnalyticsService.generateOverview({
      period: (period as any) || 'all',
      startDate,
      endDate,
      currency,
      category,
    });
    res.json(overview);
  } catch (err: any) {
    console.error('[API] /api/analytics/overview failed:', err);
    res.status(500).json({ error: err.message || 'Failed to generate procurement analytics.' });
  }
});

app.get('/api/analytics/export', (req, res) => {
  try {
    const { period, startDate, endDate, currency, category } = req.query as Record<string, string>;
    const overview = AnalyticsService.generateOverview({
      period: (period as any) || 'all',
      startDate,
      endDate,
      currency,
      category,
    });
    const csvContent = AnalyticsService.generateCsvExport(overview.recentActivity);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tehlaypay_procurement_analytics_${Date.now()}.csv"`
    );
    res.send(csvContent);
  } catch (err: any) {
    console.error('[API] /api/analytics/export failed:', err);
    res.status(500).json({ error: err.message || 'Failed to export procurement analytics.' });
  }
});

// ---------------------------------------------------------------------------
// 10. Procurement Decision Passport & Integrity Verification
// ---------------------------------------------------------------------------
app.post('/api/passport/generate', (req, res) => {
  try {
    const { requirementId, activePolicy, productId, product: incomingProduct, auditId } = req.body;

    const requirement = activePolicy || (requirementId ? auditStore.getRequirements(requirementId) : undefined);
    if (!requirement) {
      return res.status(404).json({ error: 'Procurement policy requirements not found.' });
    }

    let product = incomingProduct;
    if (!product && productId) {
      const cached = auditStore.getProduct(productId);
      if (cached) {
        product = {
          ...cached,
          evaluation: evaluateProductPolicy(cached, requirement),
        };
      }
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found in verified catalog.' });
    }

    // Match audit record if available
    const records = auditStore.getRecords();
    const auditRecord =
      (auditId ? records.find((r) => r.id === auditId) : undefined) ||
      records.find((r) => r.productId === product.id && r.requirementId === requirement.id) ||
      records.find((r) => r.productId === product.id);

    const passport = passportService.generatePassport({
      requirement,
      product,
      auditRecord,
    });

    res.json(passport);
  } catch (err: any) {
    console.error('[API] /api/passport/generate failed:', err);
    res.status(500).json({ error: err.message || 'Failed to generate procurement passport.' });
  }
});

app.get('/api/passport/verify/:reference', (req, res) => {
  try {
    const { reference } = req.params;
    const { hash } = req.query as { hash?: string };
    const result = passportService.verifyPassport(reference, hash);
    res.json(result);
  } catch (err: any) {
    console.error('[API] /api/passport/verify failed:', err);
    res.status(500).json({ error: err.message || 'Failed to verify passport reference.' });
  }
});

// ---------------------------------------------------------------------------
// 11. Policy What-If Simulator Endpoint (Server-Side Parity)
// ---------------------------------------------------------------------------
app.post('/api/policy/simulate', (req, res) => {
  try {
    const { simulatedPolicy, products } = req.body;
    if (!simulatedPolicy || typeof simulatedPolicy.maxBudget !== 'number') {
      return res.status(400).json({ error: 'Valid simulatedPolicy is required.' });
    }

    // Strict consumable protection: paper, toner, ink, cleaning supplies must remain 'new' only
    const isConsumable =
      isConsumableCategory(simulatedPolicy.category) ||
      isConsumableCategory(simulatedPolicy.targetItem);

    const pristineSimulatedPolicy: PurchaseRequirements = {
      ...simulatedPolicy,
      quantity: simulatedPolicy.quantity && simulatedPolicy.quantity > 0 ? Math.floor(simulatedPolicy.quantity) : 1,
      allowedConditions: isConsumable ? ['new'] : simulatedPolicy.allowedConditions,
    };

    const evaluated = (products || []).map((p: EvaluatedProduct) => ({
      ...p,
      evaluation: evaluateProductPolicy(p, pristineSimulatedPolicy),
    }));

    res.json({
      simulatedPolicy: pristineSimulatedPolicy,
      products: evaluated,
    });
  } catch (err: any) {
    console.error('[API] /api/policy/simulate failed:', err);
    res.status(500).json({ error: err.message || 'Policy simulation failed.' });
  }
});

// Sanitize any existing pending orders that violate budget limits
auditStore.sanitizePolicyAudit();

// ---------------------------------------------------------------------------
// Vite Dev Server / Static Production Mounting
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, host, () => {
  console.log(`[TehlayPay Server] Full-stack engine running on http://${host}:${port}`);
});
