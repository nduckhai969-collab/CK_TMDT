/**
 * ============================================================================
 * SkillRental Platform - MySQL Database Connection Pool
 * File: data/mysql.js
 * ============================================================================
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// 1. Khởi tạo Connection Pool kết nối MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', // Nhập mật khẩu MySQL của bạn nếu có
  database: process.env.DB_NAME || 'skillrental',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// 2. Hàm kiểm tra kết nối khi khởi động
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('====================================================');
    console.log('✅ KẾT NỐI CƠ SỞ DỮ LIỆU MYSQL THÀNH CÔNG!');
    console.log(`   - Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
    console.log(`   - Database: ${process.env.DB_NAME || 'skillrental'}`);
    console.log('====================================================');
    connection.release();
    return true;
  } catch (error) {
    console.error('====================================================');
    console.error('❌ LỖI KẾT NỐI MYSQL:', error.message);
    console.error('   Vui lòng kiểm tra lại Username, Password hoặc cổng 3306.');
    console.error('====================================================');
    return false;
  }
}

// 3. Hàm truy vấn dữ liệu an toàn
async function query(sql, params = []) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('[MySQL Error]:', error.message);
    throw error;
  }
}

// 4. Hàm giao dịch Transaction (Dùng cho Nạp tiền, Ký quỹ - tự Rollback nếu lỗi)
async function transaction(callback) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection
};