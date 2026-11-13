/**
 * scripts/evaluateRecommender.js
 * Ứng dụng Gợi ý thông minh theo khía cạnh (PHẦN 3 - MỤC 7):
 * 1. Tổng hợp aspectScores (thang 1-5) cho từng Provider & Service từ kết quả dự đoán của mô hình ML.
 * 2. Làm mượt Bayesian (Bayesian Smoothing) cho các Provider cold-start (< 5 review).
 * 3. Tính điểm price cho Service dựa trên giá niêm yết so với mặt bằng chung của danh mục.
 * 4. Xếp hạng Top-K theo aspectWeights của 8 chân dung khách hàng (Customer Personas).
 * 5. Đo lường và so sánh NDCG@K và Precision@K so với baseline sắp xếp theo rating trung bình.
 * 6. Tuân thủ nghiêm ngặt ràng buộc an toàn: hỗ trợ --dry-run (mặc định), --clean, chỉ cập nhật reco-eval.
 */

const fs = require('fs');
const path = require('path');
const { predictAspects } = require('../services/aspectInference');
const { PROVIDER_PERSONAS, CUSTOMER_PERSONAS } = require('../data/personas');

const DB_FILE = path.join(__dirname, '..', 'data', 'database.json');
const REVIEWS_FILE = path.join(__dirname, '..', 'data', 'export', 'reviews_labeled.json');
const REPORT_OUT = path.join(__dirname, '..', 'reports', 'recommender_eval.json');

const ASPECTS = ['quality', 'price', 'speed', 'attitude', 'warranty'];
const SENTIMENT_SCORE = {
  pos: 5.0,
  neu: 3.0,
  neg: 1.0
};

// Đọc tham số dòng lệnh
const ARGS = process.argv.slice(2);
const IS_CLEAN = ARGS.includes('--clean');
const IS_APPLY = ARGS.includes('--apply');
const IS_DRY_RUN = ARGS.includes('--dry-run') || (!IS_APPLY && !IS_CLEAN);

function computeBayesianSmooth(sampleSum, sampleCount, globalMean, m = 3) {
  if (sampleCount === 0) return globalMean;
  return (sampleSum + m * globalMean) / (sampleCount + m);
}

function computeDCG(relevanceScores, k) {
  let dcg = 0.0;
  for (let i = 0; i < Math.min(k, relevanceScores.length); i++) {
    const rel = relevanceScores[i];
    dcg += (Math.pow(2, rel) - 1.0) / Math.log2(i + 2); // i + 2 vì i chạy từ 0 -> log2(rank + 1)
  }
  return dcg;
}

function computeNDCG(actualRels, idealRels, k) {
  const dcg = computeDCG(actualRels, k);
  const idcg = computeDCG(idealRels, k);
  if (idcg === 0.0) return 0.0;
  return dcg / idcg;
}

function computePrecisionAtK(rankedItems, relThreshold, k) {
  const topK = rankedItems.slice(0, k);
  const relevantCount = topK.filter(item => item.trueUtility >= relThreshold).length;
  return relevantCount / k;
}

function main() {
  console.log('==================================================================');
  console.log('  HỆ THỐNG GỢI Ý THEO KHÍA CẠNH & ĐÁNH GIÁ PERSONA (PHẦN 3)       ');
  console.log(`  Chế độ hoạt động: ${IS_CLEAN ? 'CLEAN (Dọn dẹp aspectScores)' : IS_APPLY ? 'APPLY (Cập nhật database.json)' : 'DRY-RUN (Mặc định - Chỉ tính toán & báo cáo)'}`);
  console.log('==================================================================\n');

  if (!fs.existsSync(DB_FILE)) {
    console.error(`[Lỗi] Không tìm thấy cơ sở dữ liệu: ${DB_FILE}`);
    process.exit(1);
  }

  const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  // Xử lý cờ --clean: reset aspectScores trên reco-eval về null
  if (IS_CLEAN) {
    console.log('[Clean] Đang khôi phục aspectScores = null cho các bản ghi seedTag: "reco-eval"...');
    let provCleaned = 0;
    let svcCleaned = 0;
    dbData.providers.forEach(p => {
      if (p.seedTag === 'reco-eval' && p.aspectScores !== null) {
        p.aspectScores = null;
        provCleaned++;
      }
    });
    dbData.services.forEach(s => {
      if (s.seedTag === 'reco-eval' && s.aspectScores !== null) {
        s.aspectScores = null;
        svcCleaned++;
      }
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
    console.log(`✓ Đã xóa aspectScores trên ${provCleaned} Provider và ${svcCleaned} Service reco-eval.`);
    console.log('Dữ liệu đã đưa về trạng thái sạch ban đầu.');
    return;
  }

  // 1. Nạp và dự đoán khía cạnh trên toàn bộ review bằng mô hình ML
  const allReviews = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  console.log(`[ML Inference] Chạy suy luận trên ${allReviews.length} review bằng aspectInference.js...`);

  const providerAspectStats = {};
  PROVIDER_PERSONAS.forEach((p, idx) => {
    const prvId = `PRV_RECO_${String(idx + 1).padStart(3, '0')}`;
    providerAspectStats[prvId] = {
      id: prvId,
      name: p.name,
      category: p.category,
      reviewCount: 0,
      aspectSums: { quality: 0, price: 0, speed: 0, attitude: 0, warranty: 0 },
      aspectCounts: { quality: 0, price: 0, speed: 0, attitude: 0, warranty: 0 }
    };
  });

  allReviews.forEach(r => {
    const prvId = r.providerId;
    if (providerAspectStats[prvId]) {
      providerAspectStats[prvId].reviewCount++;
      const mlRes = predictAspects(r.content);
      mlRes.aspects.forEach(asp => {
        const score = SENTIMENT_SCORE[asp.sentiment] || 3.0;
        providerAspectStats[prvId].aspectSums[asp.aspect] += score;
        providerAspectStats[prvId].aspectCounts[asp.aspect]++;
      });
    }
  });

  // 2. Tính trung bình toàn cục (Global Means) cho Bayesian smoothing
  const globalSums = { quality: 0, price: 0, speed: 0, attitude: 0, warranty: 0 };
  const globalCounts = { quality: 0, price: 0, speed: 0, attitude: 0, warranty: 0 };
  Object.values(providerAspectStats).forEach(st => {
    if (st.reviewCount >= 5) { // Chỉ lấy các provider đủ dữ liệu làm prior
      ASPECTS.forEach(a => {
        globalSums[a] += st.aspectSums[a];
        globalCounts[a] += st.aspectCounts[a];
      });
    }
  });

  const globalMeans = {};
  ASPECTS.forEach(a => {
    globalMeans[a] = globalCounts[a] > 0 ? (globalSums[a] / globalCounts[a]) : 3.5;
  });
  console.log('\n[Bayesian Prior] Điểm trung bình toàn cục (Global Means):',
    Object.fromEntries(Object.entries(globalMeans).map(([k, v]) => [k, Number(v.toFixed(2))])));

  // 3. Tính aspectScores cuối cùng cho từng Provider (có Bayesian smoothing cho cold-start < 5 review)
  const computedProviderScores = {};
  console.log('\n--- TỔNG HỢP ASPECT SCORES CHO 24 PROVIDER PERSONAS ---');
  Object.values(providerAspectStats).forEach(st => {
    const isColdStart = st.reviewCount < 5;
    const scores = {};
    ASPECTS.forEach(a => {
      const rawMean = st.aspectCounts[a] > 0 ? (st.aspectSums[a] / st.aspectCounts[a]) : globalMeans[a];
      let finalScore;
      if (isColdStart) {
        // Áp dụng Bayesian Smoothing với m = 3
        finalScore = computeBayesianSmooth(st.aspectSums[a], st.aspectCounts[a], globalMeans[a], 3);
      } else {
        // Provider đủ mẫu: làm mượt nhẹ với m = 1 để tránh cực đoan
        finalScore = computeBayesianSmooth(st.aspectSums[a], st.aspectCounts[a], globalMeans[a], 1);
      }
      scores[a] = Math.round(finalScore * 10) / 10;
    });

    computedProviderScores[st.id] = scores;
    const coldTag = isColdStart ? ' [COLD-START]' : '';
    console.log(`  ${st.id} | ${st.name.padEnd(20)} | Reviews: ${String(st.reviewCount).padStart(2)}${coldTag.padEnd(14)} -> ${JSON.stringify(scores)}`);
  });

  // 4. Tính điểm Price cho Services theo danh mục
  console.log('\n[Service Scores] Tính toán aspectScores cho dịch vụ (Price dựa trên mặt bằng giá)...');
  const catPrices = {};
  dbData.services.forEach(s => {
    if (s.seedTag === 'reco-eval') {
      if (!catPrices[s.category]) catPrices[s.category] = [];
      catPrices[s.category].push(s.price);
    }
  });

  const catAvgPrices = {};
  Object.keys(catPrices).forEach(cat => {
    const sum = catPrices[cat].reduce((a, b) => a + b, 0);
    catAvgPrices[cat] = sum / catPrices[cat].length;
  });

  const computedServiceScores = {};
  dbData.services.forEach(s => {
    if (s.seedTag === 'reco-eval') {
      const pScores = computedProviderScores[s.providerId] || { quality: 3.5, price: 3.5, speed: 3.5, attitude: 3.5, warranty: 3.5 };
      const avgPrice = catAvgPrices[s.category] || s.price;
      
      // Price score: giá thấp hơn trung bình -> điểm cao (rẻ); giá cao hơn -> điểm thấp (đắt)
      // Tỷ lệ price / avgPrice: 0.5 -> 5.0 sao; 1.0 -> 3.5 sao; 1.5 -> 2.0 sao; >= 2.0 -> 1.0 sao
      let priceRatio = s.price / avgPrice;
      let svcPriceScore = 5.0 - (priceRatio - 0.5) * 3.0;
      svcPriceScore = Math.max(1.0, Math.min(5.0, svcPriceScore));
      svcPriceScore = Math.round(svcPriceScore * 10) / 10;

      computedServiceScores[s.id] = {
        quality: pScores.quality,
        price: svcPriceScore,
        speed: pScores.speed,
        attitude: pScores.attitude,
        warranty: pScores.warranty
      };
    }
  });

  // 5. Xếp hạng Top-K & Đánh giá NDCG@K, Precision@K cho 8 Customer Personas
  console.log('\n==================================================================');
  console.log('  ĐÁNH GIÁ GỢI Ý TRÊN 8 CHÂN DUNG KHÁCH HÀNG (PERSONA EVALUATION) ');
  console.log('==================================================================\n');

  // Lấy danh sách 24 provider có groundTruth aspectProfile
  const providersList = PROVIDER_PERSONAS.map((p, idx) => {
    const prvId = `PRV_RECO_${String(idx + 1).padStart(3, '0')}`;
    const dbProv = dbData.providers.find(dp => dp.id === prvId);
    return {
      id: prvId,
      name: p.name,
      category: p.category,
      rating: dbProv ? dbProv.rating : 4.5,
      completedOrders: dbProv ? dbProv.completedOrders : 10,
      trueAspects: p.aspectProfile, // Ground Truth năng lực thật của persona
      predictedAspects: computedProviderScores[prvId]
    };
  });

  const evaluationSummary = [];

  CUSTOMER_PERSONAS.forEach(cust => {
    const weights = cust.aspectWeights;

    // Tính Utility thật (Ground Truth Relevance) của từng Provider với Customer này
    const evaluatedProviders = providersList.map(prov => {
      let trueUtility = 0.0;
      let predictedScore = 0.0;
      ASPECTS.forEach(a => {
        trueUtility += (weights[a] || 0) * (prov.trueAspects[a] || 3.0);
        predictedScore += (weights[a] || 0) * (prov.predictedAspects[a] || 3.0);
      });
      return {
        ...prov,
        trueUtility,
        predictedScore
      };
    });

    // 1. Ranking lý tưởng (Ideal Ranking theo True Utility)
    const idealRanking = [...evaluatedProviders].sort((a, b) => b.trueUtility - a.trueUtility);
    const idealRels = idealRanking.map(p => p.trueUtility);

    // 2. Ranking theo Mô hình Đề Xuất (Aspect-Based Recommender)
    const recommenderRanking = [...evaluatedProviders].sort((a, b) => b.predictedScore - a.predictedScore);
    const recommenderRels = recommenderRanking.map(p => p.trueUtility);

    // 3. Ranking theo Baseline (Sắp xếp theo Rating sao trung bình truyền thống)
    const baselineRanking = [...evaluatedProviders].sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.completedOrders - a.completedOrders;
    });
    const baselineRels = baselineRanking.map(p => p.trueUtility);

    // Ngưỡng coi là "Relevant" cho Precision@K: Top 30% provider phù hợp nhất (trueUtility >= p70)
    const sortedUtilities = [...idealRels].sort((a, b) => a - b);
    const p70Utility = sortedUtilities[Math.floor(sortedUtilities.length * 0.70)];

    // Tính metric
    const ndcg3_reco = computeNDCG(recommenderRels, idealRels, 3);
    const ndcg3_base = computeNDCG(baselineRels, idealRels, 3);
    const ndcg5_reco = computeNDCG(recommenderRels, idealRels, 5);
    const ndcg5_base = computeNDCG(baselineRels, idealRels, 5);
    const ndcg10_reco = computeNDCG(recommenderRels, idealRels, 10);
    const ndcg10_base = computeNDCG(baselineRels, idealRels, 10);

    const prec3_reco = computePrecisionAtK(recommenderRanking, p70Utility, 3);
    const prec3_base = computePrecisionAtK(baselineRanking, p70Utility, 3);
    const prec5_reco = computePrecisionAtK(recommenderRanking, p70Utility, 5);
    const prec5_base = computePrecisionAtK(baselineRanking, p70Utility, 5);

    evaluationSummary.push({
      code: cust.code,
      name: cust.name,
      personaDesc: cust.personaDesc,
      weights,
      ndcg3_reco, ndcg3_base,
      ndcg5_reco, ndcg5_base,
      ndcg10_reco, ndcg10_base,
      prec3_reco, prec3_base,
      prec5_reco, prec5_base,
      top3_reco: recommenderRanking.slice(0, 3).map(p => `${p.name} (Điểm: ${p.predictedScore.toFixed(2)})`),
      top3_base: baselineRanking.slice(0, 3).map(p => `${p.name} (⭐${p.rating})`)
    });

    console.log(`[Persona ${cust.code}] ${cust.name} (${cust.personaDesc.slice(0, 50)}...)`);
    console.log(`  Trọng số: ${JSON.stringify(weights)}`);
    console.log(`  Top 3 Gợi ý Khía Cạnh: ${recommenderRanking.slice(0, 3).map(p => `${p.name} (${p.predictedScore.toFixed(2)})`).join(', ')}`);
    console.log(`  Top 3 Baseline Rating:  ${baselineRanking.slice(0, 3).map(p => `${p.name} (⭐${p.rating})`).join(', ')}`);
    console.log(`  -> NDCG@3:     Recommender = ${ndcg3_reco.toFixed(4)} vs Baseline = ${ndcg3_base.toFixed(4)} (${ndcg3_reco >= ndcg3_base ? '+' : ''}${((ndcg3_reco - ndcg3_base) * 100).toFixed(1)}%)`);
    console.log(`  -> NDCG@5:     Recommender = ${ndcg5_reco.toFixed(4)} vs Baseline = ${ndcg5_base.toFixed(4)} (${ndcg5_reco >= ndcg5_base ? '+' : ''}${((ndcg5_reco - ndcg5_base) * 100).toFixed(1)}%)`);
    console.log(`  -> Precision@3: Recommender = ${prec3_reco.toFixed(2)}  vs Baseline = ${prec3_base.toFixed(2)}`);
    console.log(`  -> Precision@5: Recommender = ${prec5_reco.toFixed(2)}  vs Baseline = ${prec5_base.toFixed(2)}\n`);
  });

  // Tính trung bình toàn bộ 8 Personas
  const avgNdcg3_reco = evaluationSummary.reduce((s, r) => s + r.ndcg3_reco, 0) / 8;
  const avgNdcg3_base = evaluationSummary.reduce((s, r) => s + r.ndcg3_base, 0) / 8;
  const avgNdcg5_reco = evaluationSummary.reduce((s, r) => s + r.ndcg5_reco, 0) / 8;
  const avgNdcg5_base = evaluationSummary.reduce((s, r) => s + r.ndcg5_base, 0) / 8;
  const avgNdcg10_reco = evaluationSummary.reduce((s, r) => s + r.ndcg10_reco, 0) / 8;
  const avgNdcg10_base = evaluationSummary.reduce((s, r) => s + r.ndcg10_base, 0) / 8;

  const avgPrec3_reco = evaluationSummary.reduce((s, r) => s + r.prec3_reco, 0) / 8;
  const avgPrec3_base = evaluationSummary.reduce((s, r) => s + r.prec3_base, 0) / 8;
  const avgPrec5_reco = evaluationSummary.reduce((s, r) => s + r.prec5_reco, 0) / 8;
  const avgPrec5_base = evaluationSummary.reduce((s, r) => s + r.prec5_base, 0) / 8;

  console.log('==================================================================');
  console.log('TỔNG HỢP HIỆU NĂNG GỢI Ý TRUNG BÌNH TRÊN 8 CUSTOMER PERSONAS:');
  console.log(`- NDCG@3:      Recommender = ${avgNdcg3_reco.toFixed(4)} | Baseline = ${avgNdcg3_base.toFixed(4)} | Tăng trưởng: +${((avgNdcg3_reco - avgNdcg3_base) * 100).toFixed(2)}%`);
  console.log(`- NDCG@5:      Recommender = ${avgNdcg5_reco.toFixed(4)} | Baseline = ${avgNdcg5_base.toFixed(4)} | Tăng trưởng: +${((avgNdcg5_reco - avgNdcg5_base) * 100).toFixed(2)}%`);
  console.log(`- NDCG@10:     Recommender = ${avgNdcg10_reco.toFixed(4)} | Baseline = ${avgNdcg10_base.toFixed(4)} | Tăng trưởng: +${((avgNdcg10_reco - avgNdcg10_base) * 100).toFixed(2)}%`);
  console.log(`- Precision@3: Recommender = ${avgPrec3_reco.toFixed(4)} | Baseline = ${avgPrec3_base.toFixed(4)} | Tăng trưởng: +${((avgPrec3_reco - avgPrec3_base) * 100).toFixed(2)}%`);
  console.log(`- Precision@5: Recommender = ${avgPrec5_reco.toFixed(4)} | Baseline = ${avgPrec5_base.toFixed(4)} | Tăng trưởng: +${((avgPrec5_reco - avgPrec5_base) * 100).toFixed(2)}%`);
  console.log('==================================================================\n');

  // Lưu file báo cáo kết quả Recommender
  const reportData = {
    globalMeans,
    computedProviderScores,
    computedServiceScores,
    summaryMetrics: {
      avgNdcg3_reco, avgNdcg3_base,
      avgNdcg5_reco, avgNdcg5_base,
      avgNdcg10_reco, avgNdcg10_base,
      avgPrec3_reco, avgPrec3_base,
      avgPrec5_reco, avgPrec5_base
    },
    personasEvaluation: evaluationSummary
  };
  fs.writeFileSync(REPORT_OUT, JSON.stringify(reportData, null, 2), 'utf8');
  console.log(`[Báo cáo] Đã xuất chi tiết đánh giá: ${REPORT_OUT}`);

  // Cập nhật database.json nếu có cờ --apply
  if (IS_APPLY) {
    console.log('\n[Apply] Ghi dữ liệu aspectScores vào database.json cho các bản ghi seedTag: "reco-eval"...');
    let provUpdated = 0;
    let svcUpdated = 0;
    dbData.providers.forEach(p => {
      if (p.seedTag === 'reco-eval' && computedProviderScores[p.id]) {
        p.aspectScores = computedProviderScores[p.id];
        provUpdated++;
      }
    });
    dbData.services.forEach(s => {
      if (s.seedTag === 'reco-eval' && computedServiceScores[s.id]) {
        s.aspectScores = computedServiceScores[s.id];
        svcUpdated++;
      }
    });

    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
    console.log(`✓ Đã cập nhật thành công ${provUpdated} Provider và ${svcUpdated} Service trong database.json.`);
  } else {
    console.log('\n[Lưu ý] Chạy ở chế độ DRY-RUN (Mặc định). File database.json KHÔNG bị sửa đổi.');
    console.log('Để ghi điểm vào database.json, chạy lại với: node scripts/evaluateRecommender.js --apply');
  }
}

main();
