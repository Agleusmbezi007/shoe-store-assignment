const Flutterwave = require('flutterwave-node-v3');
const crypto = require('crypto');

const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY;
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FLW_WEBHOOK_SECRET = process.env.FLW_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let flw = null;

if (FLW_PUBLIC_KEY && FLW_SECRET_KEY && !FLW_PUBLIC_KEY.includes('xxxxx')) {
  flw = new Flutterwave(FLW_PUBLIC_KEY, FLW_SECRET_KEY);
  console.log('Flutterwave client initialized');
} else {
  console.warn('Flutterwave keys missing or still placeholders — payments disabled');
}

function generateTxRef() {
  return 'SHOE-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
}

async function createPayment(userName, email, phone, amount, items) {
  if (!flw) {
    return { error: 'Payment not configured. Set FLW_PUBLIC_KEY and FLW_SECRET_KEY in env.' };
  }

  const txRef = generateTxRef();

  const details = {
    tx_ref: txRef,
    amount: amount.toString(),
    currency: 'TZS',
    redirect_url: `${BASE_URL}/payment-callback`,
    customer: {
      email,
      phone: phone || '',
      name: userName
    },
    meta: {
      user_name: userName,
      items: JSON.stringify(items)
    },
    customizations: {
      title: 'Shoe Store',
      description: 'Payment for ' + items.length + ' item(s)'
    }
  };

  try {
    const response = await flw.Payment.create(details);
    if (response.status === 'success' && response.data?.link) {
      return { txRef, link: response.data.link };
    } else {
      console.error('Flutterwave error:', response);
      return { error: response.message || 'Payment creation failed' };
    }
  } catch (err) {
    console.error('Flutterwave exception:', err);
    return { error: err.message || 'Payment request failed' };
  }
}

async function verifyPayment(transactionId) {
  if (!flw) return { error: 'Flutterwave not configured' };

  try {
    const response = await flw.Transaction.verify({ id: transactionId });
    return response;
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
