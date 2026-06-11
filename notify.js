const SELLER_PHONE = process.env.SELLER_PHONE || '255766847187';

function waLink(phone, message) {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
}

function formatItems(items) {
  return items.map(i => `${i.name} x${i.quantity} ($${i.price * i.quantity})`).join(', ');
}

function calcTotal(items) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function notifyOrder(customerName, customerPhone, items) {
  const total = calcTotal(items);
  const itemList = formatItems(items);

  const sellerMsg = `New order from ${customerName}!%0AItems: ${itemList}%0ATotal: $${total}%0ACustomer: ${customerPhone}`;
  const customerMsg = `Hi ${customerName}, thank you for your order!%0AItems: ${itemList}%0ATotal: $${total}%0AWe'll process it shortly.`;

  const sellerLink = `https://wa.me/${SELLER_PHONE.replace(/[^0-9]/g, '')}?text=${sellerMsg}`;
  const customerLink = customerPhone
    ? `https://wa.me/${customerPhone.replace(/[^0-9]/g, '')}?text=${customerMsg}`
    : null;

  console.log('WhatsApp seller link:', sellerLink);
  if (customerLink) console.log('WhatsApp customer link:', customerLink);

  return { sellerLink, customerLink };
}

module.exports = { notifyOrder, waLink, SELLER_PHONE };
