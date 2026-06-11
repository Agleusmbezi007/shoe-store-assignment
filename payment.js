const https = require('https');
const crypto = require('crypto');

const SELCOM_API_KEY = (process.env.SELCOM_API_KEY || '').replace(/^"+|"+$/g, '').trim();
const SELCOM_API_SECRET = (process.env.SELCOM_API_SECRET || '').replace(/^"+|"+$/g, '').trim();
const SELCOM_MERCHANT_ID = (process.env.SELCOM_MERCHANT_ID || '').replace(/^"+|"+$/g, '').trim();
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/^"+|"+$/g, '').trim();

const configured = SELCOM_API_KEY && SELCOM_API_SECRET && SELCOM_MERCHANT_ID && !SELCOM_API_KEY.includes('xxxxx');

if (configured) {
  console.log('Selcom configured for merchant: ' + SELCOM_MERCHANT_ID);
} else {
  console.warn('Selcom credentials missing or still placeholders — payments disabled');
}

function generateOrderId() {
  return 'SHOE-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
}

function selcomRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const auth = Buffer.from(SELCOM_API_KEY + ':' + SELCOM_API_SECRET).toString('base64');
    const options = {
      hostname: 'api.selcommobile.com',
      path: '/v1/payments',
      method: 'POST',
      timeout: 30000,
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString() });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Selcom API timeout')); });
    req.write(data);
    req.end();
  });
}

async function createPayment(userName, email, phone, amount, items) {
  if (!configured) {
    return { error: 'Selcom not configured. Get API keys from https://selcommobile.com and set SELCOM_API_KEY, SELCOM_API_SECRET, SELCOM_MERCHANT_ID in env.' };
  }

  const orderId = generateOrderId();

  const payload = {
    merchant_id: SELCOM_MERCHANT_ID,
    order_id: orderId,
    amount: Math.round(amount * 2600),
    currency: 'TZS',
    description: 'Shoe Store - ' + items.length + ' item(s)',
    customer_phone: phone || '255766847187',
    customer_email: email,
    callback_url: BASE_URL + '/selcom-callback',
    success_url: BASE_URL + '/shop?payment=success',
    cancel_url: BASE_URL + '/shop?payment=cancelled'
  };

  try {
    const resp = await selcomRequest(payload);
    if (resp.statusCode === 200 && resp.body?.status === 'success' && resp.body?.data?.checkout_url) {
      return { txRef: orderId, link: resp.body.data.checkout_url };
    } else {
      console.error('Selcom error:', resp.statusCode, resp.body);
      return { error: typeof resp.body === 'string' ? resp.body : (resp.body?.message || 'Payment creation failed') };
    }
  } catch (err) {
    console.error('Selcom exception:', err);
    return { error: err.message || 'Payment request failed' };
  }
}

async function verifyPayment(orderId) {
  if (!configured) return { error: 'Selcom not configured' };
  try {
    const auth = Buffer.from(SELCOM_API_KEY + ':' + SELCOM_API_SECRET).toString('base64');
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.selcommobile.com',
        path: '/v1/payments/' + orderId + '/status',
        method: 'GET',
        timeout: 15000,
        headers: { 'Authorization': 'Basic ' + auth }
      };
      const req = https.request(options, res => {
        let chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { createPayment, verifyPayment, generateOrderId };
