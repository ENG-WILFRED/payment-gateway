"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MpesaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MpesaService = void 0;
const common_1 = require("@nestjs/common");
let MpesaService = MpesaService_1 = class MpesaService {
    constructor() {
        this.logger = new common_1.Logger(MpesaService_1.name);
    }
    readEnv(key) {
        const raw = process.env[key];
        if (raw === undefined || raw === null)
            return undefined;
        let v = String(raw).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        return v;
    }
    formatPhone(phoneNumber) {
        if (!phoneNumber)
            return phoneNumber;
        const p = String(phoneNumber).trim();
        if (p.startsWith('0'))
            return '254' + p.slice(1);
        if (p.startsWith('+'))
            return p.slice(1);
        return p;
    }
    async initiateStkPush(phone, amount, accountReference, transactionDesc) {
        const formatted = this.formatPhone(String(phone));
        const amt = String(amount);
        this.logger.debug('Initiate STK push (live)', { phone: formatted, amount: amt, accountReference, transactionDesc });
        const baseUrl = this.readEnv('MPESA_BASE_URL');
        const consumerKey = this.readEnv('MPESA_CONSUMER_KEY');
        const consumerSecret = this.readEnv('MPESA_CONSUMER_SECRET');
        const shortcode = this.readEnv('MPESA_SHORTCODE');
        const passkey = this.readEnv('MPESA_PASSKEY');
        const callbackUrl = this.readEnv('MPESA_CALLBACK_URL');
        const missing = [];
        if (!baseUrl)
            missing.push('MPESA_BASE_URL');
        if (!consumerKey)
            missing.push('MPESA_CONSUMER_KEY');
        if (!consumerSecret)
            missing.push('MPESA_CONSUMER_SECRET');
        if (!shortcode)
            missing.push('MPESA_SHORTCODE');
        if (!passkey)
            missing.push('MPESA_PASSKEY');
        if (!callbackUrl)
            missing.push('MPESA_CALLBACK_URL');
        if (missing.length) {
            const msg = `Missing MPESA configuration: ${missing.join(', ')}`;
            this.logger.error(msg);
            throw new Error(msg);
        }
        try {
            const token = await this.getAccessToken(baseUrl, consumerKey, consumerSecret);
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
            const timeoutMs = timeoutEnv ? Number(timeoutEnv) : 30000;
            const res = await this.httpRequest(url, 'POST', headers, JSON.stringify(payload), timeoutMs);
            if (!res)
                throw new Error('Empty response from MPESA STK push');
            if (res.ResponseCode === undefined && res.responseCode === undefined) {
                this.logger.warn('Unexpected MPESA STK response shape', res);
            }
            return res;
        }
        catch (err) {
            this.logger.error('Error performing live STK push', err);
            throw err;
        }
    }
    async handleCallback(payload) {
        this.logger.debug('Mpesa callback received', payload);
        return payload;
    }
    async getAccessToken(baseUrl, consumerKey, consumerSecret) {
        var _a;
        const url = `${baseUrl.replace(/\/$/, '')}/oauth/v1/generate?grant_type=client_credentials`;
        const credentials = `${consumerKey}:${consumerSecret}`;
        const headers = { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` };
        const attempts = 3;
        const timeoutEnv = this.readEnv('MPESA_HTTP_TIMEOUT_MS');
        const timeoutMs = timeoutEnv ? Number(timeoutEnv) : 10000;
        for (let i = 0; i < attempts; i++) {
            try {
                const res = await this.httpRequest(url, 'GET', headers, undefined, timeoutMs);
                if (!res || !res.access_token)
                    throw new Error('Failed to obtain mpesa access token');
                return res.access_token;
            }
            catch (err) {
                this.logger.warn(`MPESA token fetch attempt ${i + 1} failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
                if (i === attempts - 1)
                    throw err;
                await new Promise((r) => setTimeout(r, 500 * (i + 1)));
            }
        }
        throw new Error('Failed to obtain mpesa access token after retries');
    }
    httpRequest(urlStr, method = 'GET', headers = {}, body, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(urlStr);
                const https = require('https');
                const options = {
                    method,
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + (urlObj.search || ''),
                    port: urlObj.port || 443,
                    headers: headers,
                };
                const req = https.request(options, (res) => {
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        var _a;
                        const raw = Buffer.concat(chunks).toString('utf8');
                        let parsed = raw;
                        try {
                            parsed = raw ? JSON.parse(raw) : {};
                        }
                        catch (e) {
                            parsed = raw;
                        }
                        const status = (_a = res.statusCode) !== null && _a !== void 0 ? _a : 0;
                        if (status >= 200 && status < 300)
                            return resolve(parsed);
                        const err = new Error(`HTTP ${status}`);
                        err.status = status;
                        err.body = parsed;
                        return reject(err);
                    });
                });
                req.on('error', (err) => {
                    if (String((err === null || err === void 0 ? void 0 : err.message) || '').toLowerCase().includes('timed out')) {
                        err.status = 504;
                    }
                    reject(err);
                });
                req.setTimeout(timeoutMs, () => {
                    req.destroy(new Error('Request timed out'));
                });
                if (body)
                    req.write(body);
                req.end();
            }
            catch (e) {
                reject(e);
            }
        });
    }
};
exports.MpesaService = MpesaService;
exports.MpesaService = MpesaService = MpesaService_1 = __decorate([
    (0, common_1.Injectable)()
], MpesaService);
//# sourceMappingURL=mpesa.service.js.map