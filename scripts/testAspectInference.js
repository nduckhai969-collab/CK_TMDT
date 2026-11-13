/**
 * scripts/testAspectInference.js
 * Kiểm thử đối soát suy luận Aspect-Based Sentiment Analysis giữa Node.js và Python:
 * - So sánh 20 câu mẫu đại diện đa dạng văn phong.
 * - Kiểm tra sai lệch xác suất (Probability Difference) < 1e-6.
 * - Đảm bảo nhãn dự đoán (aspects & sentiments) khớp 100%.
 */

const fs = require('fs');
const path = require('path');
const { predictAspects } = require('../services/aspectInference');

const SAMPLES_FILE = path.join(__dirname, '..', 'ml', 'python_inference_samples.json');

function main() {
  console.log('==================================================================');
  console.log('  KIỂM THỬ ĐỐI SOÁT SUY LUẬN GIỮA NODE.JS VÀ PYTHON (20 MẪU)      ');
  console.log('==================================================================\n');

  if (!fs.existsSync(SAMPLES_FILE)) {
    console.error(`[Lỗi] Không tìm thấy file mẫu đối chuẩn tại: ${SAMPLES_FILE}`);
    process.exit(1);
  }

  const samples = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
  console.log(`Đã nạp ${samples.length} mẫu kiểm thử từ Python.\n`);

  let maxAspectProbDiff = 0.0;
  let maxSentProbDiff = 0.0;
  let labelMismatches = 0;
  const tolerance = 1e-6;

  samples.forEach((s, idx) => {
    const nodeRes = predictAspects(s.content);
    console.log(`[Mẫu ${String(idx + 1).padStart(2, '0')}] (${s.id} - ${s.style})`);
    console.log(`  Content: "${s.content.slice(0, 80)}${s.content.length > 80 ? '...' : ''}"`);

    // 1. So sánh Tác vụ A: Aspect Detection Probabilities
    const aspects = ['quality', 'price', 'speed', 'attitude', 'warranty'];
    for (const a of aspects) {
      const pyProb = s.aspect_probs[a];
      const nodeProb = nodeRes.details[a].prob;
      const diff = Math.abs(pyProb - nodeProb);
      if (diff > maxAspectProbDiff) maxAspectProbDiff = diff;

      const pyPred = s.aspect_preds[a];
      const nodePred = nodeRes.details[a].present;
      if (pyPred !== nodePred) {
        console.error(`  ❌ LỆCH NHÃN ASPECT ${a}: Python=${pyPred}, Node=${nodePred}`);
        labelMismatches++;
      }

      if (diff >= tolerance) {
        console.error(`  ❌ LỆCH XÁC SUẤT ASPECT ${a}: Python=${pyProb.toFixed(8)}, Node=${nodeProb.toFixed(8)}, Diff=${diff.toExponential(3)}`);
      }
    }

    // 2. So sánh Tác vụ B: Aspect Sentiment Probabilities
    for (const a of aspects) {
      const pySentProbs = s.sentiment_probs[a];
      const nodeAspect = nodeRes.details[a];
      if (nodeAspect.present) {
        for (const [cls, pyP] of Object.entries(pySentProbs)) {
          const nodeP = nodeAspect.sentimentProbs[cls];
          const diff = Math.abs(pyP - nodeP);
          if (diff > maxSentProbDiff) maxSentProbDiff = diff;

          if (diff >= tolerance) {
            console.error(`  ❌ LỆCH XÁC SUẤT SENTIMENT ${a}:${cls}: Python=${pyP.toFixed(8)}, Node=${nodeP.toFixed(8)}, Diff=${diff.toExponential(3)}`);
          }
        }
      }
    }

    const detected = nodeRes.aspects.map(a => `${a.aspect}:${a.sentiment}(p=${a.prob.toFixed(2)})`).join(', ');
    console.log(`  => Node Dự đoán: [${detected || 'Không phát hiện khía cạnh'}]\n`);
  });

  console.log('------------------------------------------------------------------');
  console.log('KẾT QUẢ ĐỐI SOÁT CHI TIẾT:');
  console.log(`- Sai lệch lớn nhất xác suất Khía cạnh (Aspect Prob Max Diff): ${maxAspectProbDiff.toExponential(4)}`);
  console.log(`- Sai lệch lớn nhất xác suất Cực tính (Sentiment Prob Max Diff): ${maxSentProbDiff.toExponential(4)}`);
  console.log(`- Ngưỡng cho phép (Tolerance):                                  ${tolerance.toExponential(1)}`);
  console.log(`- Số lượng bất đồng nhất nhãn (Label Mismatches):             ${labelMismatches}`);
  console.log('------------------------------------------------------------------');

  if (maxAspectProbDiff < tolerance && maxSentProbDiff < tolerance && labelMismatches === 0) {
    console.log('✅ THÀNH CÔNG RỰC RỠ: Node.js khớp hoàn hảo với Python (sai lệch < 1e-6)!');
    process.exit(0);
  } else {
    console.error('❌ THẤT BẠI: Sai lệch vượt quá ngưỡng cho phép 1e-6.');
    process.exit(1);
  }
}

main();
