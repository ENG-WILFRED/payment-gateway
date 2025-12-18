import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  // Helper to read env vars more robustly: trim and strip surrounding quotes
  private readEnv(key: string): string | undefined {
    const raw = process.env[key];
    if (raw === undefined || raw === null) return undefined;
    let v = String(raw).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }

  private formatPhone(phoneNumber: string) {
    if (!phoneNumber) return phoneNumber;
    const p = String(phoneNumber).trim();
    if (p.startsWith('0')) return '254' + p.slice(1);
    if (p.startsWith('+')) return p.slice(1);
    return p;
  }

  /**
   * Initiate an STK push (live Daraja integration).
   *
   * This method requires the following env vars to be set:
   * - MPESA_BASE_URL
   * - MPESA_CONSUMER_KEY
   * - MPESA_CONSUMER_SECRET
   * - MPESA_SHORTCODE
   * - MPESA_PASSKEY
   *
   * The callbackUrl parameter should be provided in the request (no longer read from env).
   * It will obtain an access token, build the STK payload, call the Daraja
   * /mpesa/stkpush/v1/processrequest endpoint and return the parsed result.
   */
  async initiateStkPush(phone: string, amount: string | number, callbackUrl: string, accountReference?: string, transactionDesc?: string) {
    const formatted = this.formatPhone(String(phone));
    const amt = String(amount);
    this.logger.debug('Initiate STK push (live)', { phone: formatted, amount: amt, accountReference, transactionDesc });

    // Validate configuration (read from env robustly)
    const baseUrl = this.readEnv('MPESA_BASE_URL');
    const consumerKey = this.readEnv('MPESA_CONSUMER_KEY');
    const consumerSecret = this.readEnv('MPESA_CONSUMER_SECRET');
    const shortcode = this.readEnv('MPESA_SHORTCODE');
    const passkey = this.readEnv('MPESA_PASSKEY');

    const missing = [] as string[];
    if (!baseUrl) missing.push('MPESA_BASE_URL');
    if (!consumerKey) missing.push('MPESA_CONSUMER_KEY');
    if (!consumerSecret) missing.push('MPESA_CONSUMER_SECRET');
    if (!shortcode) missing.push('MPESA_SHORTCODE');
    if (!passkey) missing.push('MPESA_PASSKEY');
    if (!callbackUrl) missing.push('callbackUrl (must be provided in request)');
    if (missing.length) {
      const msg = `Missing MPESA configuration: ${missing.join(', ')}`;
      this.logger.error(msg);
      throw new Error(msg);
    }

    try {
      // get access token
      const token = await this.getAccessToken(baseUrl as string, consumerKey as string, consumerSecret as string);

      // timestamp and password => Daraja expects YYYYMMDDhhmmss
      const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      const dataToEncode = `${shortcode}${passkey}${timestamp}`;
      const password = Buffer.from(dataToEncode).toString('base64');

      const payload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(Number(amt)),
        PartyA: formatted,
        PartyB: shortcode,
        PhoneNumber: formatted,
        CallBackURL: callbackUrl,
        AccountReference: 'goods',
        TransactionDesc: 'payment for goods',
      };

  const resolvedBase = String(baseUrl).replace(/\/$/, '');
  const url = `${resolvedBase}/mpesa/stkpush/v1/processrequest`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const timeoutEnv = this.readEnv('MPESA_HTTP_TIMEOUT_MS');
  const timeoutMs = timeoutEnv ? Number(timeoutEnv) : 30000; // default 30s
  const res = await this.httpRequest(url, 'POST', headers, JSON.stringify(payload), timeoutMs);

      // Validate response shape
      if (!res) throw new Error('Empty response from MPESA STK push');
      if (res.ResponseCode === undefined && res.responseCode === undefined) {
        // Daraja returns ResponseCode (string) in success, but some errors may have different shapes
        this.logger.warn('Unexpected MPESA STK response shape', res);
      }

      return res;
    } catch (err) {
      this.logger.error('Error performing live STK push', err as any);
      throw err;
    }
  }

  async handleCallback(payload: any) {
    this.logger.debug('Mpesa callback received', payload);
    return payload;
  }

  private async getAccessToken(baseUrl: string, consumerKey: string, consumerSecret: string) {
    const url = `${baseUrl.replace(/\/$/, '')}/oauth/v1/generate?grant_type=client_credentials`;
    const credentials = `${consumerKey}:${consumerSecret}`;
    const headers = { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` };

    // Retry token fetch a few times (network may be flaky). Be conservative to avoid rate limits.
    const attempts = 3;
    const timeoutEnv = this.readEnv('MPESA_HTTP_TIMEOUT_MS');
    const timeoutMs = timeoutEnv ? Number(timeoutEnv) : 10000; // 10s for token
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.httpRequest(url, 'GET', headers, undefined, timeoutMs);
        if (!res || !res.access_token) throw new Error('Failed to obtain mpesa access token');
        return res.access_token as string;
      } catch (err: any) {
        this.logger.warn(`MPESA token fetch attempt ${i + 1} failed: ${err?.message ?? err}`);
        if (i === attempts - 1) throw err;
        // small backoff
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw new Error('Failed to obtain mpesa access token after retries');
  }

  private httpRequest(urlStr: string, method: 'GET' | 'POST' = 'GET', headers: Record<string, string> = {}, body?: string, timeoutMs = 10000) {
    return new Promise<any>((resolve, reject) => {
      try {
        const urlObj = new URL(urlStr);
        const https = require('https');

        const options: any = {
          method,
          hostname: urlObj.hostname,
          path: urlObj.pathname + (urlObj.search || ''),
          port: urlObj.port || 443,
          headers: headers,
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
              // keep raw string as fallback
              parsed = raw;
            }

            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) return resolve(parsed);
            // include status and body for debugging
            const err: any = new Error(`HTTP ${status}`);
            err.status = status;
            err.body = parsed;
            return reject(err);
          });
        });

        req.on('error', (err: any) => {
          // mark timeout errors with 504 for consistent HTTP mapping
          if (String(err?.message || '').toLowerCase().includes('timed out')) {
            err.status = 504;
          }
          reject(err);
        });
        req.setTimeout(timeoutMs, () => {
          // destroy will trigger 'error' handler
          req.destroy(new Error('Request timed out'));
        });
        if (body) req.write(body);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }
}
