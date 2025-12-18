import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);

  private readEnv(key: string) {
    const v = process.env[key];
    return v === undefined || v === null ? undefined : String(v).trim();
  }

  private async getAccessToken() {
    const client = this.readEnv('PAYPAL_CLIENT_ID');
    const secret = this.readEnv('PAYPAL_SECRET');
    const base = this.readEnv('PAYPAL_BASE_URL') || 'https://api-m.sandbox.paypal.com';
    if (!client || !secret) return null;

    const url = `${base.replace(/\/$/, '')}/v1/oauth2/token`;
    const body = 'grant_type=client_credentials';
    const auth = `Basic ${Buffer.from(`${client}:${secret}`).toString('base64')}`;
    try {
      const res = await this.httpRequest(url, 'POST', { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body);
      return res?.access_token ?? null;
    } catch (e) {
      this.logger.error('Failed to obtain PayPal token', e as any);
      return null;
    }
  }

  async createOrder(amount: string | number, returnUrl?: string, cancelUrl?: string) {
    const client = this.readEnv('PAYPAL_CLIENT_ID');
    const secret = this.readEnv('PAYPAL_SECRET');
    const base = this.readEnv('PAYPAL_BASE_URL') || 'https://api-m.sandbox.paypal.com';

    const amt = Number(amount);
    if (!client || !secret) {
      this.logger.warn('PayPal credentials not set; returning simulated order');
      return { id: `order_mock_${Date.now()}`, status: 'CREATED', links: [{ rel: 'approve', href: 'https://example.com/approve' }] };
    }

    const token = await this.getAccessToken();
    if (!token) throw new Error('Failed to obtain PayPal access token');

    const url = `${base.replace(/\/$/, '')}/v2/checkout/orders`;
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: String(amt) } }],
      application_context: { return_url: returnUrl || 'https://example.com/success', cancel_url: cancelUrl || 'https://example.com/cancel' },
    };

    const res = await this.httpRequest(url, 'POST', { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, JSON.stringify(payload));
    return res;
  }

  private httpRequest(urlStr: string, method: 'GET' | 'POST' = 'GET', headers: Record<string, string> = {}, body?: string) {
    return new Promise<any>((resolve, reject) => {
      try {
        const urlObj = new URL(urlStr);
        const https = require('https');

        const options: any = {
          method,
          hostname: urlObj.hostname,
          path: urlObj.pathname + (urlObj.search || ''),
          port: urlObj.port || 443,
          headers,
        };

        const req = https.request(options, (res: any) => {
          const chunks: any[] = [];
          res.on('data', (c: any) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let parsed: any = raw;
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch (e) {
              parsed = raw;
            }
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) return resolve(parsed);
            const err: any = new Error(`HTTP ${status}`);
            err.status = status;
            err.body = parsed;
            return reject(err);
          });
        });

        req.on('error', (err: any) => reject(err));
        if (body) req.write(body);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }
}
