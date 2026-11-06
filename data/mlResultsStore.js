const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODEL_FILES = [
  path.join(ROOT, 'models', 'aspect_detection.json'),
  path.join(ROOT, 'models', 'aspect_sentiment.json')
];
const DATASET_FILE = path.join(ROOT, 'data', 'export', 'reviews_labeled.json');

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getModelVersion() {
  const hash = crypto.createHash('sha256');
  for (const filePath of MODEL_FILES) hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function ensureMlTables(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS review_ai_analyses (
    review_id VARCHAR(191) NOT NULL,
    content TEXT NOT NULL,
    rating TINYINT UNSIGNED NULL,
    model_version CHAR(64) NOT NULL,
    analysis JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (review_id),
    INDEX idx_review_ai_model_version (model_version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS review_ml_training_runs (
    run_id CHAR(36) NOT NULL,
    model_version CHAR(64) NOT NULL,
    dataset_version CHAR(64) NOT NULL,
    train_count INT UNSIGNED NOT NULL,
    validation_count INT UNSIGNED NOT NULL,
    test_count INT UNSIGNED NOT NULL,
    results JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id),
    INDEX idx_review_ml_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function persistReviewAnalyses(connection, reviews) {
  const modelVersion = getModelVersion();
  for (const review of reviews) {
    if (!review || !review.id || !review.content || !review.aiAnalysis) continue;
    await connection.execute(
      `INSERT INTO review_ai_analyses
        (review_id, content, rating, model_version, analysis)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), rating = VALUES(rating),
         model_version = VALUES(model_version), analysis = VALUES(analysis)`,
      [String(review.id), String(review.content), Number(review.rating) || null, modelVersion, JSON.stringify(review.aiAnalysis)]
    );
  }
}

async function persistTrainingRun(connection, results) {
  const runId = crypto.randomUUID();
  const splits = results.dist || {};
  await ensureMlTables(connection);
  await connection.execute(
    `INSERT INTO review_ml_training_runs
      (run_id, model_version, dataset_version, train_count, validation_count, test_count, results)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      getModelVersion(),
      fileHash(DATASET_FILE),
      Number(splits.train?.total) || 0,
      Number(splits.val?.total) || 0,
      Number(splits.test?.total) || 0,
      JSON.stringify(results)
    ]
  );
  return runId;
}

module.exports = { ensureMlTables, persistReviewAnalyses, persistTrainingRun };
