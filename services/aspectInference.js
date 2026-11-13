/**
 * services/aspectInference.js
 * Dịch vụ suy luận mô hình học máy Aspect-Based Sentiment Analysis trên Node.js.
 * Tương thích 100% với scikit-learn Logistic Regression (TF-IDF word + char_wb).
 */

const fs = require('fs');
const path = require('path');
const { preprocessText, normalizeTextBase, removeAccents } = require('./aspectPreprocess');

const MODEL_DIR = path.join(__dirname, '..', 'models');
const DET_MODEL_PATH = path.join(MODEL_DIR, 'aspect_detection.json');
const SENT_MODEL_PATH = path.join(MODEL_DIR, 'aspect_sentiment.json');
const OVERALL_MODEL_PATH = path.join(MODEL_DIR, 'review_overall_nb.json');
const ASPECT_MODEL_PATH = path.join(MODEL_DIR, 'review_aspects_nb.json');

let detModel = null;
let sentModel = null;
let overallModel = null;
let aspectModel = null;
let loadedModelSignature = '';

function loadModels() {
  for (const modelPath of [DET_MODEL_PATH, SENT_MODEL_PATH]) {
    if (!fs.existsSync(modelPath)) throw new Error(`Không tìm thấy file mô hình tại ${modelPath}`);
  }
  const modelPaths = [DET_MODEL_PATH, SENT_MODEL_PATH, OVERALL_MODEL_PATH, ASPECT_MODEL_PATH].filter(fs.existsSync);
  const signature = modelPaths
    .map(modelPath => `${fs.statSync(modelPath).mtimeMs}:${fs.statSync(modelPath).size}`)
    .join('|');
  if (signature !== loadedModelSignature) {
    detModel = JSON.parse(fs.readFileSync(DET_MODEL_PATH, 'utf8'));
    sentModel = JSON.parse(fs.readFileSync(SENT_MODEL_PATH, 'utf8'));
    overallModel = fs.existsSync(OVERALL_MODEL_PATH)
      ? JSON.parse(fs.readFileSync(OVERALL_MODEL_PATH, 'utf8')) : null;
    aspectModel = fs.existsSync(ASPECT_MODEL_PATH)
      ? JSON.parse(fs.readFileSync(ASPECT_MODEL_PATH, 'utf8')) : null;
    loadedModelSignature = signature;
  }
}

/**
 * Tách n-gram từ (1-3 gram) theo chuẩn scikit-learn với token_pattern r'(?u)\b\w+\b'
 */
function extractWordNgrams(text) {
  const tokens = text.match(/[\p{L}\p{N}_]+/gu) || [];
  const ngrams = [...tokens];
  const nTokens = tokens.length;
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= nTokens - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
  }
  return ngrams;
}

/**
 * Tách char_wb n-gram (2-5 gram) theo chuẩn scikit-learn _char_wb_ngrams
 */
function extractCharWbNgrams(text) {
  const minN = 2;
  const maxN = 5;
  const ngrams = [];
  const words = text.trim().split(/\s+/);

  for (const rawW of words) {
    if (!rawW) continue;
    // Chuyển sang mảng unicode code-points để xử lý chuẩn emoji và ký tự đặc biệt
    const wChars = Array.from(` ${rawW} `);
    const wLen = wChars.length;
    for (let n = minN; n <= maxN; n++) {
      let offset = 0;
      ngrams.push(wChars.slice(offset, offset + n).join(''));
      while (offset + n < wLen) {
        offset++;
        ngrams.push(wChars.slice(offset, offset + n).join(''));
      }
      if (offset === 0) break;
    }
  }
  return ngrams;
}

/**
 * Tính vector TF-IDF thưa (sparse) có L2-norm = 1.0 với sublinear_tf=True
 * Trả về Map: featureIndex -> normalizedTfIdfValue
 */
function vectorizeSparse(ngrams, vocab, idfArray) {
  const counts = new Map();
  for (const ng of ngrams) {
    const idx = vocab[ng];
    if (idx !== undefined) {
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
  }

  if (counts.size === 0) {
    return new Map();
  }

  let sumSquares = 0.0;
  const rawTfidf = new Map();
  for (const [idx, count] of counts.entries()) {
    // sublinear_tf = True: tf = 1.0 + Math.log(count)
    const tf = 1.0 + Math.log(count);
    const val = tf * idfArray[idx];
    rawTfidf.set(idx, val);
    sumSquares += val * val;
  }

  const norm = Math.sqrt(sumSquares);
  if (norm === 0.0) {
    return new Map();
  }

  const sparseVec = new Map();
  for (const [idx, val] of rawTfidf.entries()) {
    sparseVec.set(idx, val / norm);
  }
  return sparseVec;
}

/**
 * Tính tích vô hướng giữa vector đặc trưng thưa và vector hệ số dày
 */
function dotProduct(sparseVec, denseCoef) {
  let sum = 0.0;
  for (const [idx, val] of sparseVec.entries()) {
    sum += val * denseCoef[idx];
  }
  return sum;
}

/**
 * Hàm hàm Sigmoid
 */
function sigmoid(z) {
  return 1.0 / (1.0 + Math.exp(-z));
}

/**
 * Hàm Softmax
 */
function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(z => Math.exp(z - maxLogit));
  const sumExps = exps.reduce((acc, val) => acc + val, 0.0);
  return exps.map(val => val / sumExps);
}

function predictMulticlass(model, wordSparse, charSparse) {
  const probs = model.classes.map(cls => {
    const weights = model.class_weights[cls];
    const score = weights.intercept + dotProduct(wordSparse, weights.word_coef) + dotProduct(charSparse, weights.char_coef);
    return [cls, score];
  });
  const normalized = softmax(probs.map(([, score]) => score));
  let bestIndex = 0;
  for (let i = 1; i < normalized.length; i++) if (normalized[i] > normalized[bestIndex]) bestIndex = i;
  return { label: probs[bestIndex][0], confidence: normalized[bestIndex], probabilities: Object.fromEntries(probs.map(([cls], i) => [cls, normalized[i]])) };
}

function predictNaiveBayes(model, rawText) {
  if (!model) return null;
  const normalized = normalizeTextBase(String(rawText || ''));
  const words = `${normalized} ${removeAccents(normalized)}`.match(/[\p{L}\p{N}_]+/gu) || [];
  const features = [...words];
  for (let i = 0; i + 1 < words.length; i++) features.push(`${words[i]} ${words[i + 1]}`);
  const counts = new Map();
  for (const feature of features) {
    const index = model.vocabulary[feature];
    if (index !== undefined) counts.set(index, (counts.get(index) || 0) + 1);
  }
  const scores = model.classes.map(label => {
    let score = model.priors[label];
    const likelihoods = model.likelihoods[label];
    for (const [index, count] of counts) score += count * likelihoods[index];
    return score;
  });
  const temperature = Number(model.temperature) || 1;
  const probabilities = softmax(scores.map(score => score / temperature));
  let best = 0;
  for (let i = 1; i < probabilities.length; i++) if (probabilities[i] > probabilities[best]) best = i;
  const confidence = probabilities[best];
  return {
    label: model.classes[best],
    confidence,
    probabilities: Object.fromEntries(model.classes.map((label, i) => [label, probabilities[i]]))
  };
}

function predictNaiveBayesAspects(rawText) {
  if (!aspectModel?.models) return null;
  const aspects = [];
  const details = {};
  for (const aspect of Object.keys(aspectModel.models)) {
    const prediction = predictNaiveBayes(aspectModel.models[aspect], rawText);
    const present = prediction.label !== 'none';
    details[aspect] = {
      present,
      prob: 1 - (prediction.probabilities.none || 0),
      threshold: null
    };
    if (!present) continue;
    details[aspect].sentiment = prediction.label;
    details[aspect].sentimentConfidence = prediction.confidence;
    details[aspect].sentimentProbs = prediction.probabilities;
    aspects.push({ aspect, sentiment: prediction.label, confidence: prediction.confidence, prob: details[aspect].prob });
  }
  return { aspects, details };
}

/**
 * Suy luận trích xuất khía cạnh và cực tính từ chuỗi đánh giá tiếng Việt
 * @param {string} rawText Nội dung nhận xét
 * @returns {object} Kết quả phân tích chi tiết
 */
function predictAspects(rawText) {
  loadModels();

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      rawText: rawText || '',
      preprocessed: '',
      aspects: [],
      scores: {}
    };
  }

  const cleanText = preprocessText(rawText);

  // 1. Trích xuất đặc trưng word & char_wb
  const wordNgrams = extractWordNgrams(cleanText);
  const charNgrams = extractCharWbNgrams(cleanText);

  const wordSparse = vectorizeSparse(
    wordNgrams,
    detModel.word_features.vocab,
    detModel.word_features.idf
  );
  const charSparse = vectorizeSparse(
    charNgrams,
    detModel.char_features.vocab,
    detModel.char_features.idf
  );

  let detectedAspects = [];
  let aspectDetails = {};
  const overallSentiment = predictNaiveBayes(overallModel, rawText)
    || (sentModel.overall ? predictMulticlass(sentModel.overall, wordSparse, charSparse) : null);
  const aspectPrediction = predictNaiveBayesAspects(rawText);
  if (aspectPrediction) {
    detectedAspects = aspectPrediction.aspects;
    aspectDetails = aspectPrediction.details;
  }

  // 2. Tác vụ A: Nhận diện khía cạnh (Aspect Detection)
  for (const aspect of aspectPrediction ? [] : detModel.aspects) {
    const weights = detModel.weights[aspect];
    const threshold = detModel.thresholds[aspect] || 0.5;

    const z = weights.intercept +
      dotProduct(wordSparse, weights.word_coef) +
      dotProduct(charSparse, weights.char_coef);

    const prob = sigmoid(z);
    const isPresent = prob >= threshold;

    aspectDetails[aspect] = {
      present: isPresent,
      prob: prob,
      threshold: threshold
    };

    // 3. Tác vụ B: Dự đoán cực tính nếu khía cạnh xuất hiện
    if (isPresent) {
      const sentWeights = sentModel.weights[aspect];
      const classes = sentWeights.classes; // e.g. ['neg', 'neu', 'pos']
      const sentimentPrediction = predictMulticlass(sentWeights, wordSparse, charSparse);
      const bestSentiment = sentimentPrediction.label;
      const probsByClass = sentimentPrediction.probabilities;
      aspectDetails[aspect].sentiment = bestSentiment;
      aspectDetails[aspect].sentimentConfidence = sentimentPrediction.confidence;
      aspectDetails[aspect].sentimentProbs = probsByClass;

      detectedAspects.push({
        aspect: aspect,
        sentiment: bestSentiment,
        confidence: sentimentPrediction.confidence,
        prob: prob
      });
    }
  }

  return {
    rawText,
    preprocessed: cleanText,
    aspects: detectedAspects,
    details: aspectDetails,
    overallSentiment: overallSentiment?.label || null,
    overallConfidence: overallSentiment?.confidence || 0,
    overallProbabilities: overallSentiment?.probabilities || null
  };
}

module.exports = {
  predictAspects,
  loadModels,
  extractWordNgrams,
  extractCharWbNgrams,
  vectorizeSparse
};
