const africastalking = require('africastalking');

const AT_USERNAME = process.env.AT_USERNAME;
const AT_API_KEY = process.env.AT_API_KEY;
const SELLER_PHONE = process.env.SELLER_PHONE;

let client = null;

if (AT_USERNAME && AT_API_KEY) {
  client = africastalking({
    username: AT_USERNAME,
    apiKey: AT_API_KEY
  });
  console.log('Africa\'s Talking client initialized');
} else {
  console.warn('AT_USERNAME or AT_API_KEY missing — notifications disabled');
}

function formatItems(items) {
  return items.map(i => `${i.name} x${i.quantity} ($${i.price * i.quantity})`).join(', ');
}

function calcTotal(items) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

async function sendSMS(to, message) {
  if (!client) return;
  try {
    const sms = client.SMS;
    const resp = await sms.send({ to: [to], message });
    console.log('SMS sent:', resp);
    return resp;
  } catch (err) {
    console.error('SMS failed:', err);
  }
}

async function sendWhatsApp(to, message) {
  if (!client) return;
  try {
    const wa = client.WhatsApp;
    const resp = await wa.send({ to, message });
    console.log('WhatsApp sent:', resp);
    return resp;
  } catch (err) {
    console.error('WhatsApp failed:', err);
  }
}

async function notifyOrder(customerName, customerPhone, items) {
  const total = calcTotal(items);
  const itemList = formatItems(items);

  const sellerMsg = `New order from ${customerName}! Items: ${itemList}. Total: $${total}. Customer: ${customerPhone}`;
  const customerMsg = `Hi ${customerName}, thank you for your order! Items: ${itemList}. Total: $${total}. We'll process it shortly.`;

  const results = await Promise.allSettled([
    sendSMS(SELLER_PHONE, sellerMsg),
    sendSMS(customerPhone, customerMsg),
    sendWhatsApp(SELLER_PHONE, sellerMsg),
    sendWhatsApp(customerPhone, customerMsg),
  ]);

  results.forEach((r, i) => {
    const label = ['SMS->Seller', 'SMS->Customer', 'WA->Seller', 'WA->Customer'][i];
    if (r.status === 'fulfilled') {
      console.log(`${label}: OK`);
    } else {
      console.warn(`${label}: ${r.reason?.message || 'failed'}`);
    }
  });
}

module.exports = { notifyOrder };
