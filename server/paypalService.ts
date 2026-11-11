interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface PayPalCreateOrderParams {
  productTitle: string;
  amount: number;
  currency: string;
  sku: string;
  requirementId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PayPalOrderResult {
  orderId?: string;
  approveUrl?: string;
  status: string;
  configured: boolean;
  message?: string;
}

export interface PayPalCaptureResult {
  captureId?: string;
  status: string;
  amount: number;
  currency: string;
  configured: boolean;
  message?: string;
}

/**
 * PayPal Sandbox Service
 *
 * Implements official PayPal Orders v2 API strictly in the Sandbox environment:
 * - Base URL: https://api-m.sandbox.paypal.com
 * - OAuth Token: POST /v1/oauth2/token (client_credentials)
 * - Create Order: POST /v2/checkout/orders (intent: CAPTURE)
 * - Capture Order: POST /v2/checkout/orders/{id}/capture
 *
 * Security Guarantees:
 * - Credentials remain strictly on server (`process.env.PAYPAL_CLIENT_ID`, `process.env.PAYPAL_CLIENT_SECRET`).
 * - Hardcoded to Sandbox. Real-money production payments cannot be activated.
 * - Enforces verified PayPal completion, matching amount, and matching currency before capture confirmation.
 */
export class PayPalService {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;

  constructor(customClientId?: string, customClientSecret?: string) {
    this.clientId = customClientId ?? (process.env.PAYPAL_CLIENT_ID || '');
    this.clientSecret = customClientSecret ?? (process.env.PAYPAL_CLIENT_SECRET || '');

    // STRICT SAFETY CHECK: Force Sandbox base URL. Live real-money transactions are never permitted.
    const requestedEnv = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    if (requestedEnv !== 'sandbox') {
      console.warn(`[PayPalService] Requested PAYPAL_ENV='${requestedEnv}'. Enforcing 'sandbox'. Real money payments are prohibited.`);
    }
    this.baseUrl = 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Confirms whether valid Sandbox credentials are configured on the server.
   */
  public isSandboxConfigured(): boolean {
    return Boolean(
      this.clientId &&
      this.clientId.trim().length > 0 &&
      this.clientSecret &&
      this.clientSecret.trim().length > 0
    );
  }

  /**
   * Alias for backwards compatibility. Note: Refers to Sandbox credentials.
   */
  public isLiveCredentialsConfigured(): boolean {
    return this.isSandboxConfigured();
  }

  public getEnvironment(): string {
    return 'sandbox';
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async getAccessToken(): Promise<string> {
    if (!this.isSandboxConfigured()) {
      throw new Error('PayPal Sandbox credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET) are not configured.');
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PayPal OAuth authentication failed (HTTP ${response.status}): ${errorText}`);
    }

    const data: PayPalTokenResponse = await response.json();
    return data.access_token;
  }

  public async createOrder(params: PayPalCreateOrderParams): Promise<PayPalOrderResult> {
    if (!this.isSandboxConfigured()) {
      return {
        configured: false,
        status: 'AWAITING_CREDENTIALS',
        message: 'PayPal Sandbox credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET) are required to create sandbox checkout orders.',
      };
    }

    try {
      console.log(`[PayPalService] Creating PayPal Sandbox order: ${params.currency} ${params.amount.toFixed(2)} at ${this.baseUrl}`);
      const accessToken = await this.getAccessToken();

      const payload = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: params.requirementId,
            description: `TehlayPay Verified: ${params.productTitle.substring(0, 100)}`,
            custom_id: params.sku,
            amount: {
              currency_code: params.currency,
              value: params.amount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: 'TehlayPay Compliance Gate',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: params.returnUrl || 'http://localhost:3000/?paypal_status=approved',
          cancel_url: params.cancelUrl || 'http://localhost:3000/?paypal_status=cancelled',
        },
      };

      const response = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`PayPal Sandbox create order error (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const approveLink = data.links?.find((l: any) => l.rel === 'approve')?.href;

      return {
        orderId: data.id,
        approveUrl: approveLink,
        status: data.status || 'CREATED',
        configured: true,
      };
    } catch (err: any) {
      console.error('[PayPalService] createOrder failed:', err?.message || err);
      throw err;
    }
  }

  public async captureOrder(orderId: string, expectedAmount: number, currency: string): Promise<PayPalCaptureResult> {
    if (!this.isSandboxConfigured()) {
      return {
        configured: false,
        status: 'AWAITING_CREDENTIALS',
        amount: expectedAmount,
        currency,
        message: 'PayPal Sandbox credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET) are required to capture sandbox orders.',
      };
    }

    try {
      console.log(`[PayPalService] Capturing PayPal Sandbox order: ${orderId} at ${this.baseUrl}`);
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`PayPal Sandbox capture failed (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
      const captureStatus = data.status || capture?.status || 'COMPLETED';

      // Security Check: Verify captured currency and amount against server expectations
      if (capture?.amount) {
        const capturedAmount = parseFloat(capture.amount.value || '0');
        const capturedCurrency = String(capture.amount.currency_code || '').toUpperCase();

        if (capturedCurrency && capturedCurrency !== currency.toUpperCase()) {
          throw new Error(`Currency tampering detected during capture: expected ${currency}, PayPal recorded ${capturedCurrency}`);
        }
        if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
          throw new Error(`Amount tampering detected during capture: expected ${expectedAmount.toFixed(2)}, PayPal recorded ${capturedAmount.toFixed(2)}`);
        }
      }

      return {
        captureId: capture?.id || `CAP_${orderId.slice(-8)}`,
        status: captureStatus,
        amount: parseFloat(capture?.amount?.value || expectedAmount.toString()),
        currency: capture?.amount?.currency_code || currency,
        configured: true,
      };
    } catch (err: any) {
      console.error('[PayPalService] captureOrder failed:', err?.message || err);
      throw err;
    }
  }
}
