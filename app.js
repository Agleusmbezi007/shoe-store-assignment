require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const { notifyOrder } = require('./notify');
const { createPayment, verifyPayment, verifyWebhookSignature, generateTxRef } = require('./payment');

const app = express();


// MIDDLEWARE

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// DEBUG — remove after fixing

app.get('/debug-env', (req, res) => {
    const pk = (process.env.FLW_PUBLIC_KEY || '').trim();
    const sk = (process.env.FLW_SECRET_KEY || '').trim();
    res.json({
        flw_public_prefix: pk.substring(0, 15) + '...',
        flw_secret_prefix: sk.substring(0, 15) + '...',
        flw_public_length: pk.length,
        flw_secret_length: sk.length,
        starts_with_flwpubk: pk.startsWith('FLWPUBK-'),
        starts_with_flwseck: sk.startsWith('FLWSECK-'),
        contains_xxxxx: pk.includes('xxxxx') || sk.includes('xxxxx'),
        seller_phone: process.env.SELLER_PHONE || '(not set)',
        base_url: process.env.BASE_URL || '(not set)'
    });
});

// CONFIG ENDPOINT (so frontend uses same SELLER_PHONE as backend)

app.get('/config', (req, res) => {
    const pk = (process.env.FLW_PUBLIC_KEY || '').trim();
    const sk = (process.env.FLW_SECRET_KEY || '').trim();
    const ready = pk.startsWith('FLWPUBK-') && sk.startsWith('FLWSECK-') && !pk.includes('xxxxx') && !sk.includes('xxxxx');
    res.json({
        sellerPhone: process.env.SELLER_PHONE || '255766847187',
        flutterwaveKey: ready ? pk : null,
        flutterwaveReady: ready
    });
});

// SERVE HTML FILES

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'my_form.html'));
});

app.get('/shop', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// REGISTER ROUTE

app.post('/register', (req, res) => {

    console.log("REGISTER DATA:", req.body);

    const { fullname, phone, email, password } = req.body;

    // VALIDATION
    if (!fullname || !phone || !email || !password) {
        return res.send('❌ All fields are required');
    }

    // CHECK IF EMAIL EXISTS
    const checkSql = 'SELECT * FROM users WHERE email = ?';

    db.query(checkSql, [email], (checkErr, checkResult) => {

        if (checkErr) {
            console.log(checkErr);
            return res.send('❌ Database error');
        }

        if (checkResult.length > 0) {
            return res.send('❌ Registration failed');
        }

        // INSERT USER
        const insertSql = `
            INSERT INTO users(fullname, phone, email, password)
            VALUES (?, ?, ?, ?)
        `;

        db.query(
            insertSql,
            [fullname, phone, email, password],
            (err, result) => {

                if (err) {
                    console.log(err);
                    return res.send('❌ Registration failed');
                }

                console.log(result);

                return res.send('✅ Registration successful');

            }
        );

    });

});


// LOGIN ROUTE

app.post('/login', (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.send('❌ Email and password required');
    }

    const sql = `
        SELECT * FROM users
        WHERE email = ? AND password = ?
    `;

    db.query(sql, [email, password], (err, result) => {

        if (err) {
            console.log(err);
            return res.send('❌ Login failed');
        }

        if (result.length > 0) {
            const user = result[0];
            return res.redirect(`/shop?fullname=${encodeURIComponent(user.fullname)}&email=${encodeURIComponent(user.email)}`);
        } else {
            return res.send('❌ Invalid email or password');
        }

    });

});


// SUBMIT ORDER ROUTE

app.post('/submit-order', (req, res) => {

    const { user_name, email, items } = req.body;

    if (!user_name) {
        return res.json({ success: false, message: 'Please enter your name' });
    }

    if (!items || items.length === 0) {
        return res.json({ success: false, message: 'Cart is empty' });
    }

    const sql = 'INSERT INTO orders (user_name, name, price, quantity, total) VALUES ?';
    const values = items.map(item => [user_name, item.name, item.price, item.quantity, item.price * item.quantity]);

    db.query(sql, [values], (err, result) => {

        if (err) {
            console.log(err);
            return res.json({ success: false, message: 'Order failed' });
        }

        console.log('Order saved:', result);

        let waLinks = { sellerLink: null, customerLink: null };

        if (email) {
            db.query('SELECT phone FROM users WHERE email = ?', [email], (err2, rows) => {
                if (!err2 && rows.length > 0) {
                    waLinks = notifyOrder(user_name, rows[0].phone, items);
                } else {
                    console.warn('Could not look up phone for', email);
                }
            });
        }

        return res.json({ success: true, message: 'Order placed successfully!', waLinks });

    });

});


// PAYMENT ROUTES

app.post('/create-payment', (req, res) => {

    const { user_name, email, phone, amount, items } = req.body;

    if (!user_name || !email || !amount || !items) {
        return res.json({ success: false, message: 'Missing required fields' });
    }

    createPayment(user_name, email, phone || '', parseFloat(amount), items).then(result => {
        if (result.error) {
            return res.json({ success: false, message: result.error });
        }

        db.query(
            'INSERT INTO transactions (tx_ref, user_name, email, phone, amount, items) VALUES (?, ?, ?, ?, ?, ?)',
            [result.txRef, user_name, email, phone || '', amount, JSON.stringify(items)],
            (err) => {
                if (err) console.error('Failed to save transaction:', err);
            }
        );

        return res.json({ success: true, link: result.link, txRef: result.txRef });
    });

});


app.get('/payment-callback', (req, res) => {

    const { transaction_id, status, tx_ref } = req.query;

    if (status === 'successful' || status === 'completed') {
        verifyPayment(transaction_id).then(verifyRes => {
            if (verifyRes.status === 'success' && verifyRes.data?.status === 'successful') {
                db.query('UPDATE transactions SET flw_id = ?, status = ? WHERE tx_ref = ?',
                    [transaction_id, 'completed', tx_ref], (err) => {
                        if (err) console.error('Update failed:', err);
                    }
                );
                return res.redirect('/shop?payment=success');
            } else {
                db.query('UPDATE transactions SET flw_id = ?, status = ? WHERE tx_ref = ?',
                    [transaction_id, 'failed', tx_ref], (err) => {
                        if (err) console.error('Update failed:', err);
                    }
                );
                return res.redirect('/shop?payment=failed');
            }
        });
    } else {
        db.query('UPDATE transactions SET status = ? WHERE tx_ref = ?',
            ['cancelled', tx_ref], (err) => {
                if (err) console.error('Update failed:', err);
            }
        );
        return res.redirect('/shop?payment=cancelled');
    }

});


app.post('/webhook', (req, res) => {

    const signature = req.headers['verif-hash'];

    if (!verifyWebhookSignature(req.body, signature)) {
        return res.status(401).json({ status: 'error', message: 'Invalid signature' });
    }

    const { txRef, status, id } = req.body?.data || {};

    if (txRef && status === 'successful') {
        db.query('UPDATE transactions SET flw_id = ?, status = ? WHERE tx_ref = ?',
            [id, 'completed', txRef], (err) => {
                if (err) console.error('Webhook update failed:', err);
            }
        );
    }

    return res.status(200).json({ status: 'success' });

});


app.get('/payment-status', (req, res) => {

    const { txRef } = req.query;
    if (!txRef) return res.json({ status: 'unknown' });

    db.query('SELECT status FROM transactions WHERE tx_ref = ?', [txRef], (err, rows) => {
        if (err || rows.length === 0) return res.json({ status: 'unknown' });
        return res.json({ status: rows[0].status });
    });

});


// START SERVER

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
