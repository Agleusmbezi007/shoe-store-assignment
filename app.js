require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const { notifyOrder } = require('./notify');
const { createPayment, verifyPayment } = require('./payment');

const app = express();


// MIDDLEWARE

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'shoe-store-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));


// AUTH MIDDLEWARE

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/?redirect=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.redirect('/');
}


// LOGOUT ROUTE

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


// CHECK AUTH (for frontend SPA behavior)

app.get('/check-auth', (req, res) => {
    if (req.session && req.session.userId) {
        return res.json({ loggedIn: true, name: req.session.userName, email: req.session.userEmail });
    }
    res.json({ loggedIn: false });
});


// CONFIG ENDPOINT

app.get('/config', (req, res) => {
    const clean = v => (v || '').replace(/^"+|"+$/g, '').trim();
    const ak = clean(process.env.SELCOM_API_KEY);
    const as = clean(process.env.SELCOM_API_SECRET);
    const mi = clean(process.env.SELCOM_MERCHANT_ID);
    const ready = ak && as && mi && !ak.includes('xxxxx');
    res.json({
        sellerPhone: process.env.SELLER_PHONE || '255766847187',
        paymentReady: ready,
        loggedIn: !!(req.session && req.session.userId),
        isAdmin: !!(req.session && req.session.isAdmin),
        userName: req.session?.userName || ''
    });
});

// SERVE HTML FILES

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'my_form.html'));
});

app.get('/shop', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});


// REGISTER ROUTE

app.post('/register', (req, res) => {

    console.log("REGISTER DATA:", req.body);

    const { fullname, phone, email, password } = req.body;

    if (!fullname || !phone || !email || !password) {
        return res.json({ success: false, message: 'All fields are required' });
    }

    const checkSql = 'SELECT * FROM users WHERE email = ?';

    db.query(checkSql, [email], (checkErr, checkResult) => {

        if (checkErr) {
            console.log(checkErr);
            return res.json({ success: false, message: 'Database error' });
        }

        if (checkResult.length > 0) {
            return res.json({ success: false, message: 'Email already registered. Please login.' });
        }

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
                    return res.json({ success: false, message: 'Registration failed' });
                }

                console.log(result);

                return res.json({ success: true, message: 'Registration successful! You can now login.' });

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
            req.session.userId = user.id;
            req.session.userName = user.fullname;
            req.session.userEmail = user.email;
            req.session.isAdmin = user.is_admin === 1 || user.is_admin === true;
            if (req.session.isAdmin) {
                return res.redirect('/admin');
            }
            const redirect = req.query.redirect || '/shop';
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

        items.forEach(item => {
            db.query('UPDATE products SET sold = TRUE WHERE name = ?', [item.name], (err) => {
                if (err) console.error('Failed to mark product sold:', err);
            });
        });

        const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
        const txRef = 'MAN-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

        db.query(
            'INSERT INTO transactions (tx_ref, user_name, email, phone, amount, items, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [txRef, user_name, email, '', total, JSON.stringify(items), 'pending_manual'],
            (err) => { if (err) console.error('Failed to save transaction:', err); }
        );

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

        return res.json({ success: true, message: 'Order placed successfully!', waLinks, txRef });

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


app.post('/selcom-callback', (req, res) => {

    const { order_id, status, transaction_id } = req.body || {};

    if (order_id && (status === 'success' || status === 'completed')) {
        db.query('UPDATE transactions SET flw_id = ?, status = ? WHERE tx_ref = ?',
            [transaction_id || '', 'completed', order_id], (err) => {
                if (err) console.error('Callback update failed:', err);
            }
        );
    } else if (order_id) {
        db.query('UPDATE transactions SET status = ? WHERE tx_ref = ?',
            ['failed', order_id], (err) => {
                if (err) console.error('Callback update failed:', err);
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


// PRODUCTS API

app.get('/api/products', (req, res) => {
    db.query('SELECT * FROM products ORDER BY sold ASC, id ASC', (err, rows) => {
        if (err) return res.json([]);
        res.json(rows);
    });
});

app.post('/api/products', requireAuth, (req, res) => {
    const { name, price, image } = req.body;
    if (!name || !price || !image) return res.json({ success: false, message: 'All fields required' });
    db.query('INSERT INTO products (name, price, image) VALUES (?, ?, ?)', [name, price, image], (err, result) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, id: result.insertId });
    });
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
    db.query('DELETE FROM products WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true });
    });
});

app.put('/api/products/:id/unsold', requireAuth, (req, res) => {
    db.query('UPDATE products SET sold = FALSE WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true });
    });
});


// CONFIRM MANUAL PAYMENT (seller marks M-Pesa as paid)

app.post('/confirm-payment', requireAuth, (req, res) => {
    const { txRef } = req.body;
    if (!txRef) return res.json({ success: false, message: 'Missing txRef' });
    db.query('UPDATE transactions SET status = ? WHERE tx_ref = ? AND status = ?',
        ['confirmed_manual', txRef, 'pending_manual'],
        (err, result) => {
            if (err) return res.json({ success: false, message: 'Database error' });
            if (result.affectedRows === 0) return res.json({ success: false, message: 'Transaction not found or already confirmed' });
            return res.json({ success: true, message: 'Payment confirmed!' });
        }
    );
});


// LIST PENDING PAYMENTS (seller view)

app.get('/pending-payments', requireAuth, (req, res) => {
    db.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50', (err, rows) => {
        if (err) return res.json([]);
        res.json(rows);
    });
});


// START SERVER

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
