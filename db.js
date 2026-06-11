const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:\n', err.message);
        return;
    }
    console.log('🚀 Successfully connected to your TiDB Cloud Cluster!');

    connection.query('SELECT "Database is Active!" AS status', (error, results) => {
        if (error) {
            console.error('❌ Query execution failed:', error.message);
        } else {
            console.log('📊 Cluster Response:', results[0].status);
        }

        connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fullname VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_name VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                quantity INT NOT NULL,
                total DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        connection.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tx_ref VARCHAR(255) NOT NULL UNIQUE,
                flw_id VARCHAR(255),
                user_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'TZS',
                status VARCHAR(50) DEFAULT 'pending',
                items JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                image VARCHAR(500) NOT NULL,
                sold BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Failed to create tables:', err.message);
            } else {
                console.log('Tables ready');
                seedProducts(connection);
                seedAdmin(connection);
            }
        });
    });
});

function seedProducts(conn) {
    const initial = [
        ['Nike Air', 50, 'images/pexels-styves-exantus-7162424-6412694.jpg'],
        ['Adidas Runner', 45, 'images/pexels-marcio-carvalho-1334537412-28879459.jpg'],
        ['Puma Classic', 40, 'images/pexels-victor-filemon-lopez-sanchez-3289921-15036819.jpg'],
        ['Yeezy Boost', 60, 'images/yeezybustas-jordan-shoes-1777572_1920.jpg'],
        ['Stark Sneakers', 48, 'images/starkvisuals-sneakers-3714730_1920.jpg'],
        ['Mega Shock', 55, 'images/megashock-jordan-4657349_1920.jpg'],
        ['Marzuk Sneakers', 42, 'images/marzuk-sneakers-5578127_1920.jpg'],
        ['Marzuk Nike', 52, 'images/marzuk-nike-5644799.jpg'],
        ['Lovechin Special', 38, 'images/lovechin-ai-generated-8644121.png'],
        ['Grailify Nike', 47, 'images/grailify-nike-5226091_1920.jpg'],
        ['Grailify Classic', 44, 'images/grailify-nike-5041718_1920.jpg'],
        ['Deanmoth Tennis', 35, 'images/deanmoth-tennis-7968714_1920.png'],
        ['Alexa Baby Shoes', 25, 'images/alexas_fotos-baby-shoes-974715_1920.jpg']
    ];

    conn.query('SELECT COUNT(*) AS cnt FROM products', (err, result) => {
        if (err || result[0].cnt > 0) return;
        const sql = 'INSERT INTO products (name, price, image) VALUES ?';
        conn.query(sql, [initial], (err2) => {
            if (err2) console.error('Seed failed:', err2.message);
            else console.log('Products seeded: ' + initial.length);
        });
    });
}

function seedAdmin(conn) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@shoestore.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    conn.query('SELECT id FROM users WHERE email = ?', [adminEmail], (err, result) => {
        if (err || result.length > 0) return;
        conn.query(
            'INSERT INTO users (fullname, phone, email, password, is_admin) VALUES (?, ?, ?, ?, TRUE)',
            ['Admin', '0000000000', adminEmail, adminPass],
            (err2) => {
                if (err2) console.error('Admin seed failed:', err2.message);
                else console.log('Admin account created: ' + adminEmail);
            }
        );
    });
}

module.exports = connection;
