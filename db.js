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
        `, (err) => {
            if (err) {
                console.error('Failed to create tables:', err.message);
            } else {
                console.log('Tables ready');
            }
        });
    });
});

module.exports = connection;
