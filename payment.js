const https = require('https');
const crypto = require('crypto');

function clean(val) {
  return (val || '').trim().replace(/^"+|"+$/g, '');
}

const FLW_PUBLIC_KEY = clean(process.env.FLW_PUBLIC_KEY);
const FLW_SECRET_KEY = clean(process.env.FLW_SECRET_KEY);
const FLW_WEBHOOK_SECRET = clean(process.env.FLW_WEBHOOK_SECRET);
const BASE_URL = clean(process.env.BASE_URL) || 'http://localhost:3000';

const keyValid = FLW_PUBLIC_KEY && FLW_SECRET_KEY && FLW_PUBLIC_KEY.length > 20 && FLW_SECRET_KEY.length > 20 && !FLW_PUBLIC_KEY.includes('xxxxx') && !FLW_SECRET_KEY.includes('xxxxx');

if (keyValid) {
  console.log('Flutterwave configured with key: ' + FLW_PUBLIC_KEY.substring(0, 12) + '...');
} else {
  console.warn('Flutterwave keys missing or still placeholders — payments disabled');
  if (FLW_PUBLIC_KEY) console.log('FLW_PUBLIC_KEY starts with: ' + FLW_PUBLIC_KEY.substring(0, 12) + '...');
}

function generateTxRef() {
  return 'SHOE-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
}

function flwRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.flutterwave.com',
      path: '/v3' + path,
      method,
      timeout: 20000,
      headers: {
        'Authorization': 'Bearer ' + FLW_SECRET_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Flutterwave API timeout')); });
    req.write(data);
    req.end();
  });
}

async function createPayment(userName, email, phone, amount, items) {
  if (!keyValid) {
    return { error: 'Payment not configured. Get your Flutterwave API keys from https://dashboard.flutterwave.com and set FLW_PUBLIC_KEY / FLW_SECRET_KEY in Render env vars.' };
  }

  const txRef = generateTxRef();

  const payload = {
    tx_ref: txRef,
    amount: amount.toString(),
    currency: 'TZS',
    redirect_url: `${BASE_URL}/payment-callback`,
    customer: {
      email,
      phone: phone || '',
      name: userName
    },
    customizations: {
      title: 'Shoe Store',
      description: 'Payment for ' + items.length + ' item(s)'
    }
  };

  try {
    const response = await flwRequest('/payments', 'POST', payload);
    if (response.status === 'success' && response.data?.link) {
      return { txRef, link: response.data.link };
    } else {
      console.error('Flutterwave error:', response);
      return { error: response.message || response.data?.message || 'Payment creation failed' };
    }
  } catch (err) {
    console.error('Flutterwave exception:', err);
    return { error: err.message || 'Payment request failed' };
  }
}

async function verifyPayment(transactionId) {
  if (!configured) return { error: 'Flutterwave not configured' };
  try {
    return await flwRequest('/transactions/' + transactionId + '/verify', 'GET', {});
  } catch (err) {
    console.error('Verification failed:', err);
    return { error: err.message };
  }
}

function verifyWebhookSignature(body, signature) {
  if (!FLW_WEBHOOK_SECRET) return false;
  const hash = crypto.createHmac('sha256', FLW_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex');
  return hash === signature;
}

module.exports = { createPayment, verifyPayment, verifyWebhookSignature, generateTxRef };
