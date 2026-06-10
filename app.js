require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();


// MIDDLEWARE

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


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

    const { user_name, items } = req.body;

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
        return res.json({ success: true, message: 'Order placed successfully!' });

    });

});


// START SERVER

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
