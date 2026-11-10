require('dotenv').config();
const mysql = require('mysql2/promise');

const passwordsToTry = [
  process.env.MYSQL_PASSWORD,
  process.env.DB_PASSWORD,
  '',            // Mặc định của XAMPP / Laragon (không có mật khẩu)
  'root',        // Mặc định phổ biến của MySQL Installer / Docker
  '123456',
  '12345678',
  'admin'
].filter((v, idx, arr) => v !== undefined && arr.indexOf(v) === idx);

async function check() {
  console.log('========================================================');
  console.log('🔍 ĐANG CHẨN ĐOÁN KẾT NỐI MYSQL TRÊN MÁY BẠN...');
  console.log('========================================================');
  console.log(`- Host: ${process.env.MYSQL_HOST || '127.0.0.1'}`);
  console.log(`- Port: ${process.env.MYSQL_PORT || 3306}`);
  console.log(`- User: ${process.env.MYSQL_USER || 'root'}`);
  console.log(`- Mật khẩu hiện tại trong .env: "${process.env.MYSQL_PASSWORD || ''}"`);
  console.log('--------------------------------------------------------');

  let workingPassword = null;
  let connection = null;

  for (const pass of passwordsToTry) {
    try {
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'root',
        password: pass
      });
      workingPassword = pass;
      connection = conn;
      console.log(`✅ KẾT NỐI THÀNH CÔNG với mật khẩu: "${pass === '' ? '(để trống - không có mật khẩu)' : pass}"`);
      break;
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        console.error('❌ KHÔNG THỂ KẾT NỐI (ECONNREFUSED): MySQL chưa được bật!');
        console.error('👉 Vui lòng mở XAMPP / Laragon / Services và bấm [Start] MySQL.');
        process.exit(1);
      }
      console.log(`❌ Thử mật khẩu "${pass === '' ? '(rỗng)' : pass}": Không đúng (${err.code})`);
    }
  }

  if (connection && workingPassword !== null) {
    console.log('--------------------------------------------------------');
    console.log('🔎 ĐANG KIỂM TRA DATABASE "skillrental"...');
    const [dbs] = await connection.query('SHOW DATABASES');
    const dbNames = dbs.map(d => Object.values(d)[0].toLowerCase());
    
    if (dbNames.includes('skillrental')) {
      console.log('✅ Database "skillrental" ĐÃ TỒN TẠI!');
    } else {
      console.log('⚠️ Database "skillrental" CHƯA TỒN TẠI. Đang tự động tạo...');
      await connection.query('CREATE DATABASE IF NOT EXISTS skillrental CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      console.log('✅ ĐÃ TỰ ĐỘNG TẠO DATABASE "skillrental" THÀNH CÔNG!');
    }

    await connection.end();

    console.log('========================================================');
    console.log('🎉 HƯỚNG DẪN CẤU HÌNH .ENV ĐỂ CHẠY SERVER:');
    console.log('========================================================');
    console.log(`Hãy mở file .env và đặt dòng MYSQL_PASSWORD như sau:`);
    console.log(`MYSQL_PASSWORD=${workingPassword}`);
    console.log('Sau đó chạy lại lệnh:');
    console.log('  npm run seed');
    console.log('  npm start');
    console.log('========================================================');
  } else {
    console.log('========================================================');
    console.log('⚠️ Không có mật khẩu nào trong danh sách khớp.');
    console.log('👉 Vui lòng kiểm tra lại mật khẩu MySQL lúc bạn cài đặt hoặc kiểm tra tài khoản root.');
    console.log('========================================================');
  }
}

check().catch(err => {
  console.error('Lỗi kiểm tra:', err.message);
});
