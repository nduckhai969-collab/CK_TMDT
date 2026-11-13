/**
 * scripts/demo_predict.js
 * Công cụ kiểm thử trực tiếp mô hình phân tích khía cạnh & cảm xúc (Aspect-Based Sentiment)
 * Sử dụng:
 *   node scripts/demo_predict.js
 *   node scripts/demo_predict.js "Nhập câu review bất kỳ ở đây"
 */

const { predictAspects } = require('../services/aspectInference');

// Tập mẫu thử nghiệm đa dạng văn phong và cảm xúc
const DEFAULT_SAMPLES = [
  {
    type: 'Tích cực toàn diện (Khen Chất lượng & Tốc độ)',
    text: 'Thiết kế logo siêu đẹp, màu sắc sáng tạo và bạn giao file thần tốc trước deadline!'
  },
  {
    type: 'Tiêu cực toàn diện (Chê Giá cả & Thái độ)',
    text: 'Báo giá cắt cổ đắt đỏ, chặt chém khách hàng mà thái độ phục vụ lồi lõm khó chịu.'
  },
  {
    type: 'Khen - Chê tương phản (Khen Chất lượng nhưng Chê Giá)',
    text: 'Sản phẩm bàn giao rất ưng ý và chuẩn chỉ, tuy nhiên giá hơi chát so với mặt bằng chung.'
  },
  {
    type: 'Khen - Chê tương phản (Khen Giá rẻ nhưng Chê Tốc độ)',
    text: 'Chi phí cực kỳ rẻ và hợp túi tiền sinh viên, mỗi tội làm ăn rề rà chậm chạp giao trễ hẹn.'
  },
  {
    type: 'Khen Bảo hành & Hậu mãi',
    text: 'Hỗ trợ bảo hành cực kỳ tận tâm, sau bàn giao website bị lỗi bạn vẫn vào sửa miễn phí.'
  },
  {
    type: 'Chê Bảo hành & Thái độ',
    text: 'Sửa điện thoại xong về vẫn bị sọc màn hình, gọi bảo hành thì đem con bỏ chợ rồi chặn số.'
  },
  {
    type: 'Tiếng Việt Teencode / Giới trẻ',
    text: 'sp đỉnh chóp lun mn ơi, phục vụ nhiệt tình như ng nhà, ưng cái bụng ghê á.'
  },
  {
    type: 'Tiếng Việt Không Dấu',
    text: 'gia ca hop ly lam viec nhanh chong dung hen chat luong ok'
  },
  {
    type: 'Câu ngắn gọn / Cộc lốc',
    text: 'Quá đắt! Làm ăn như hạch.'
  },
  {
    type: 'Câu chung chung (Không nhắc khía cạnh cụ thể)',
    text: 'Dịch vụ tuyệt vời 5 sao, nhất định sẽ tiếp tục ủng hộ shop!'
  }
];

function formatSentiment(sent) {
  if (sent === 'pos') return '\x1b[32m✔ TÍCH CỰC (Khen / Hài lòng)\x1b[0m';
  if (sent === 'neg') return '\x1b[31m✖ TIÊU CỰC (Chê / Thất vọng)\x1b[0m';
  if (sent === 'neu') return '\x1b[33m~ TRUNG TÍNH (Bình thường)\x1b[0m';
  return 'CHƯA RÕ';
}

function runPrediction(text, label = '') {
  const res = predictAspects(text);
  console.log('--------------------------------------------------------------------------------');
  if (label) console.log(`📌 \x1b[1m[${label}]\x1b[0m`);
  console.log(`💬 \x1b[36mReview gốc:\x1b[0m "${text}"`);
  console.log(`🧹 \x1b[90mTiền xử lý:\x1b[0m "${res.preprocessed}"`);

  if (!res.aspects || res.aspects.length === 0) {
    console.log(`🎯 \x1b[35mKết quả:\x1b[0m Không phát hiện khía cạnh cụ thể (Cả 5 khía cạnh = "-")`);
  } else {
    console.log(`🎯 \x1b[35mCác khía cạnh phát hiện được:\x1b[0m`);
    res.aspects.forEach(item => {
      const asp = item.aspect;
      const sentDisplay = formatSentiment(item.sentiment);
      const detProb = (item.prob * 100).toFixed(1);
      const sentConf = (item.confidence * 100).toFixed(1);
      const details = res.details[asp] || {};
      const probs = details.sentimentProbs || {};
      const probBreakdown = `[pos: ${(probs.pos * 100 || 0).toFixed(0)}%, neg: ${(probs.neg * 100 || 0).toFixed(0)}%, neu: ${(probs.neu * 100 || 0).toFixed(0)}%]`;

      console.log(`   • Khía cạnh: \x1b[1m${asp.padEnd(9)}\x1b[0m | Xác suất khía cạnh: ${detProb.padStart(5)}% | Cảm xúc: ${sentDisplay.padEnd(36)} (Độ tin cậy: ${sentConf}%) ${probBreakdown}`);
    });
  }
}

// Nếu người dùng truyền vào câu cụ thể qua CLI
const customArg = process.argv.slice(2).join(' ').trim();

console.log('\n================================================================================');
console.log('       KIỂM THỬ TRỰC TIẾP MÔ HÌNH HỌC MÁY (ASPECT-BASED SENTIMENT)');
console.log('================================================================================');

if (customArg) {
  console.log('Chế độ: Đánh giá câu nhập từ người dùng');
  runPrediction(customArg, 'Câu nhập trực tiếp');
} else {
  console.log(`Chế độ: Chạy tự động ${DEFAULT_SAMPLES.length} trường hợp thử nghiệm phong phú\n`);
  DEFAULT_SAMPLES.forEach((sample, i) => {
    runPrediction(sample.text, `Trường hợp ${i + 1}: ${sample.type}`);
  });
}

console.log('================================================================================\n');
