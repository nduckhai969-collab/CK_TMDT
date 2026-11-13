const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeTextBase, removeAccents } = require('../services/aspectPreprocess');

const root = path.join(__dirname, '..');
const csvPath = path.join(root, 'data', 'export', 'binh_luan_dich_vu_600_aspect.csv');
const reviewPath = path.join(root, 'data', 'export', 'reviews_labeled.json');
const modelPath = path.join(root, 'models', 'review_overall_nb.json');
const aspectModelPath = path.join(root, 'models', 'review_aspects_nb.json');
const reportPath = path.join(root, 'reports', 'overall_sentiment_metrics.json');
const aspectReportPath = path.join(root, 'reports', 'review_aspects_metrics.json');
const classes = ['positive', 'negative', 'neutral'];
const aspectClasses = ['pos', 'neg', 'neu', 'none'];
const aspectColumns = { quality: 'chat_luong', price: 'gia', speed: 'toc_do', attitude: 'thai_do', warranty: 'bao_hanh' };
const alpha = 0.5;
const minDocumentFrequency = 2;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (quoted) throw new Error(`Unclosed CSV quote in ${csvPath}`);
  const [headers, ...records] = rows;
  return records.filter(record => record.some(value => value.trim() !== '')).map(record =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, '').trim(), record[index] || ''])));
}

function tokenize(text) {
  const normalized = normalizeTextBase(String(text || ''));
  const variants = `${normalized} ${removeAccents(normalized)}`;
  const words = variants.match(/[\p{L}\p{N}_]+/gu) || [];
  const features = [...words];
  for (let i = 0; i + 1 < words.length; i++) features.push(`${words[i]} ${words[i + 1]}`);
  return features;
}

function splitCsvRows(rows) {
  const categories = [...new Set(rows.map(row => row.category.trim() || 'uncategorized'))].sort();
  if (categories.length < 4) throw new Error('Need at least four categories for a grouped train/validation/test split.');
  const trainEnd = Math.floor(categories.length * 0.67);
  const valEnd = Math.min(categories.length - 1, trainEnd + Math.max(1, Math.round(categories.length * 0.17)));
  const splitByCategory = new Map();
  categories.slice(0, trainEnd).forEach(category => splitByCategory.set(category, 'train'));
  categories.slice(trainEnd, valEnd).forEach(category => splitByCategory.set(category, 'validation'));
  categories.slice(valEnd).forEach(category => splitByCategory.set(category, 'test'));
  return {
    categories,
    rows: rows.map(row => ({
      ...row,
      id: row.id.trim(), text: row.text.trim(), label: row.label.trim().toLowerCase(),
      category: row.category.trim() || 'uncategorized',
      split: splitByCategory.get(row.category.trim() || 'uncategorized'),
      source: 'binh_luan_dich_vu_600_aspect.csv'
    }))
  };
}

function trainModel(trainingRows) {
  const docFrequency = new Map();
  const docsByClass = Object.fromEntries(classes.map(label => [label, 0]));
  const tokenCounts = Object.fromEntries(classes.map(label => [label, new Map()]));
  const totalTokens = Object.fromEntries(classes.map(label => [label, 0]));

  for (const row of trainingRows) {
    if (!classes.includes(row.label)) continue;
    const features = tokenize(row.text);
    docsByClass[row.label] += 1;
    for (const token of new Set(features)) docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    for (const token of features) {
      const counts = tokenCounts[row.label];
      counts.set(token, (counts.get(token) || 0) + 1);
      totalTokens[row.label] += 1;
    }
  }

  const vocabulary = [...docFrequency].filter(([, count]) => count >= minDocumentFrequency).map(([token]) => token).sort();
  const priors = {};
  const likelihoods = {};
  for (const label of classes) {
    priors[label] = Math.log(docsByClass[label] / trainingRows.length);
    const denominator = totalTokens[label] + alpha * vocabulary.length;
    likelihoods[label] = vocabulary.map(token => Math.log(((tokenCounts[label].get(token) || 0) + alpha) / denominator));
  }
  return { version: 1, algorithm: 'multinomial-naive-bayes', classes, alpha, minDocumentFrequency, temperature: 1,
    ngramRange: [1, 2], vocabulary: Object.fromEntries(vocabulary.map((token, index) => [token, index])),
    priors, likelihoods, trainingCounts: docsByClass, trainingSize: trainingRows.length,
    trainingSources: ['reviews_labeled.json', 'binh_luan_dich_vu_600_aspect.csv'] };
}

function trainAspectClassifier(rows, balancedPrior = true) {
  const counts = Object.fromEntries(aspectClasses.map(label => [label, new Map()]));
  const totals = Object.fromEntries(aspectClasses.map(label => [label, 0]));
  const docCounts = Object.fromEntries(aspectClasses.map(label => [label, 0]));
  const df = new Map();
  for (const row of rows) {
    if (!aspectClasses.includes(row.label)) continue;
    const features = tokenize(row.text);
    docCounts[row.label]++;
    for (const token of new Set(features)) df.set(token, (df.get(token) || 0) + 1);
    for (const token of features) {
      counts[row.label].set(token, (counts[row.label].get(token) || 0) + 1);
      totals[row.label]++;
    }
  }
  const vocabulary = [...df].filter(([, count]) => count >= minDocumentFrequency).map(([token]) => token).sort();
  const priors = {}, likelihoods = {};
  for (const label of aspectClasses) {
    priors[label] = balancedPrior ? -Math.log(aspectClasses.length)
      : Math.log((docCounts[label] + alpha) / (rows.length + alpha * aspectClasses.length));
    const denominator = totals[label] + alpha * vocabulary.length;
    likelihoods[label] = vocabulary.map(token => Math.log(((counts[label].get(token) || 0) + alpha) / denominator));
  }
  return { algorithm: 'multinomial-naive-bayes', classes: aspectClasses, alpha, minDocumentFrequency,
    vocabulary: Object.fromEntries(vocabulary.map((token, index) => [token, index])), priors, likelihoods,
    trainingCounts: docCounts, trainingSize: rows.length };
}

function predictWithModel(model, text) {
  const counts = new Map();
  for (const token of tokenize(text)) {
    const index = model.vocabulary[token];
    if (index !== undefined) counts.set(index, (counts.get(index) || 0) + 1);
  }
  const scores = model.classes.map(label => {
    let score = model.priors[label];
    for (const [index, count] of counts) score += count * model.likelihoods[label][index];
    return score;
  });
  const temperature = Number(model.temperature) || 1;
  const scaledScores = scores.map(score => score / temperature);
  const max = Math.max(...scaledScores), exp = scaledScores.map(score => Math.exp(score - max));
  const sum = exp.reduce((total, value) => total + value, 0);
  const probabilities = exp.map(value => value / sum);
  const best = probabilities.indexOf(Math.max(...probabilities));
  return { label: model.classes[best], confidence: probabilities[best], probabilities: Object.fromEntries(model.classes.map((label, index) => [label, probabilities[index]])) };
}

function multiclassMetrics(rows, predictor, labels) {
  const matrix = Object.fromEntries(labels.map(label => [label, Object.fromEntries(labels.map(other => [other, 0]))]));
  let correct = 0;
  for (const row of rows) {
    const predicted = predictor(row.text).label;
    matrix[row.label][predicted]++;
    if (predicted === row.label) correct++;
  }
  const f1 = {};
  for (const label of labels) {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + (actual === label ? 0 : matrix[actual][label]), 0);
    const fn = labels.reduce((sum, predicted) => sum + (predicted === label ? 0 : matrix[label][predicted]), 0);
    f1[label] = 2 * tp / (2 * tp + fp + fn || 1);
  }
  return { count: rows.length, accuracy: rows.length ? correct / rows.length : 0,
    macroF1: Object.values(f1).reduce((sum, value) => sum + value, 0) / labels.length, f1, confusionMatrix: matrix };
}

function aspectPresenceMetrics(rows, predictor) {
  let tp = 0, fp = 0, fn = 0;
  for (const row of rows) {
    const actual = row.label !== 'none';
    const predicted = predictor(row.text).label !== 'none';
    if (actual && predicted) tp++;
    else if (predicted) fp++;
    else if (actual) fn++;
  }
  return { count: rows.length, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1),
    f1: 2 * tp / (2 * tp + fp + fn || 1) };
}

function aspectPolarityMetrics(rows, predictor) {
  const labels = ['pos', 'neg', 'neu'];
  const present = rows.filter(row => row.label !== 'none');
  const matrix = Object.fromEntries(labels.map(label => [label, Object.fromEntries([...labels, 'none'].map(other => [other, 0]))]));
  let correct = 0;
  for (const row of present) {
    const predicted = predictor(row.text).label;
    matrix[row.label][predicted]++;
    if (predicted === row.label) correct++;
  }
  const f1 = {};
  for (const label of labels) {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + (actual === label ? 0 : matrix[actual][label]), 0);
    const fn = labels.reduce((sum, predicted) => sum + (predicted === label ? 0 : matrix[label][predicted]), 0);
    f1[label] = 2 * tp / (2 * tp + fp + fn || 1);
  }
  return { count: present.length, accuracy: present.length ? correct / present.length : 0,
    macroF1: Object.values(f1).reduce((sum, value) => sum + value, 0) / labels.length, f1, confusionMatrix: matrix };
}

function predict(model, text) {
  const features = tokenize(text);
  const counts = new Map();
  for (const feature of features) {
    const index = model.vocabulary[feature];
    if (index !== undefined) counts.set(index, (counts.get(index) || 0) + 1);
  }
  const scores = model.classes.map(label => {
    let score = model.priors[label];
    for (const [index, count] of counts) score += count * model.likelihoods[label][index];
    return score;
  });
  const temperature = Number(model.temperature) || 1;
  const scaledScores = scores.map(score => score / temperature);
  const max = Math.max(...scaledScores);
  const exp = scaledScores.map(score => Math.exp(score - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const probabilities = exp.map(value => value / sum);
  const best = probabilities.indexOf(Math.max(...probabilities));
  // Naive Bayes posterior is overconfident; temper it before it can affect reputation.
  const confidence = probabilities[best];
  return { label: model.classes[best], confidence, probabilities: Object.fromEntries(model.classes.map((label, i) => [label, probabilities[i]])) };
}

function fitTemperature(model, rows) {
  let bestTemperature = 1;
  let bestLoss = Infinity;
  for (const temperature of [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48]) {
    model.temperature = temperature;
    const loss = rows.reduce((sum, row) => {
      const predicted = predict(model, row.text);
      return sum - Math.log(Math.max(1e-12, predicted.probabilities[row.label]));
    }, 0) / rows.length;
    if (loss < bestLoss) { bestLoss = loss; bestTemperature = temperature; }
  }
  model.temperature = bestTemperature;
  return { temperature: bestTemperature, validationLogLoss: bestLoss };
}

function metrics(rows, model) {
  const matrix = Object.fromEntries(classes.map(label => [label, Object.fromEntries(classes.map(other => [other, 0]))]));
  let correct = 0;
  for (const row of rows) {
    const predicted = predict(model, row.text).label;
    matrix[row.label][predicted] += 1;
    if (predicted === row.label) correct += 1;
  }
  const f1 = {};
  for (const label of classes) {
    const tp = matrix[label][label];
    const fp = classes.reduce((sum, actual) => sum + (actual === label ? 0 : matrix[actual][label]), 0);
    const fn = classes.reduce((sum, predicted) => sum + (predicted === label ? 0 : matrix[label][predicted]), 0);
    f1[label] = 2 * tp / (2 * tp + fp + fn || 1);
  }
  return { count: rows.length, accuracy: rows.length ? correct / rows.length : 0,
    macroF1: Object.values(f1).reduce((sum, value) => sum + value, 0) / classes.length, f1, confusionMatrix: matrix };
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

const sourceRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const validCsv = sourceRows.filter(row => row.text.trim() && classes.includes(row.label.trim().toLowerCase()));
const grouped = splitCsvRows(validCsv);
const existing = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  .filter(row => row.split === 'train' && classes.includes(row.groundTruth?.overallSentiment))
  .map(row => ({ text: row.content, label: row.groundTruth.overallSentiment, source: 'reviews_labeled.json' }));
const trainingRows = [...existing, ...grouped.rows.filter(row => row.split === 'train')];
const validationRows = grouped.rows.filter(row => row.split === 'validation');
const testRows = [
  ...JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
    .filter(row => row.split === 'test' && classes.includes(row.groundTruth?.overallSentiment))
    .map(row => ({ text: row.content, label: row.groundTruth.overallSentiment, source: 'reviews_labeled.json' })),
  ...grouped.rows.filter(row => row.split === 'test')
];
const model = trainModel(trainingRows);
const calibration = fitTemperature(model, validationRows);
const validationMetrics = metrics(validationRows, model);
const testMetrics = metrics(testRows, model);
const perSource = {};
for (const source of [...new Set(testRows.map(row => row.source))]) perSource[source] = metrics(testRows.filter(row => row.source === source), model);
const report = {
  dataset: path.basename(csvPath), sourceRows: sourceRows.length, validRows: validCsv.length,
  categoryCount: grouped.categories.length, categoriesBySplit: {
    train: grouped.categories.filter(category => grouped.rows.find(row => row.category === category)?.split === 'train'),
    validation: grouped.categories.filter(category => grouped.rows.find(row => row.category === category)?.split === 'validation'),
    test: grouped.categories.filter(category => grouped.rows.find(row => row.category === category)?.split === 'test')
  },
  splitCounts: { training: trainingRows.length, validation: validationRows.length,
    test: testRows.length, testNewDataset: grouped.rows.filter(row => row.split === 'test').length },
  classCounts: Object.fromEntries(classes.map(label => [label, trainingRows.filter(row => row.label === label).length])),
  calibration, validation: validationMetrics, test: testMetrics, testBySource: perSource,
  datasetSha256: sha256(csvPath)
};

const existingAspectRows = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
const manualAspectSamples = [];
for (const manualPath of [path.join(root, 'data', 'handwritten', 'annotator_A.csv'), path.join(root, 'data', 'handwritten', 'review_seed.csv')]) {
  if (!fs.existsSync(manualPath)) continue;
  for (const row of parseCsv(fs.readFileSync(manualPath, 'utf8'))) {
    const id = (row.id || '').trim(), text = (row.text || '').trim();
    if (!id || !text || /^(DEMO_|EXAMPLE_)/i.test(id)) continue;
    const annotations = [];
    for (const aspect of Object.keys(aspectColumns)) {
      const label = (row[aspect] || '-').trim().toLowerCase();
      if (['pos', 'neg', 'neu'].includes(label)) annotations.push({ aspect, sentiment: label });
      else if (!['', '-'].includes(label)) throw new Error(`Invalid manual aspect label ${id}/${aspect}: ${label}`);
    }
    manualAspectSamples.push({ id, content: text, split: 'train', groundTruth: { aspects: annotations } });
  }
}
function projectAspectSamples(samples, source) {
  return samples.flatMap(sample => Object.entries(aspectColumns).map(([aspect]) => {
    const annotation = (sample.groundTruth?.aspects || []).find(item => item.aspect === aspect);
    return { id: sample.id, text: sample.content, aspect, label: annotation?.sentiment || 'none', split: sample.split, source };
  }));
}
const csvAspectRows = grouped.rows.flatMap(row => Object.entries(aspectColumns).map(([aspect, column]) => {
  const labelMap = { positive: 'pos', negative: 'neg', neutral: 'neu', none: 'none' };
  const label = labelMap[(row[column] || 'none').trim().toLowerCase()];
  if (!label) throw new Error(`Invalid ${column} label in row ${row.id}: ${row[column]}`);
  return { id: row.id, text: row.text, aspect, label, split: row.split, source: 'binh_luan_dich_vu_600_aspect.csv' };
}));
const existingAspectTrain = projectAspectSamples([
  ...existingAspectRows.filter(row => row.split === 'train'),
  ...manualAspectSamples
], 'reviews_labeled.json+handwritten');
const existingAspectValidation = projectAspectSamples(existingAspectRows.filter(row => row.split === 'val'), 'reviews_labeled.json');
const existingAspectTest = projectAspectSamples(existingAspectRows.filter(row => row.split === 'test'), 'reviews_labeled.json');
const aspectModel = { version: 1, algorithm: 'multinomial-naive-bayes', aspectColumns,
  classes: aspectClasses, models: {}, trainingSources: ['reviews_labeled.json', 'binh_luan_dich_vu_600_aspect.csv'] };
const aspectReport = { dataset: path.basename(csvPath), splitCategories: report.categoriesBySplit,
  counts: { train: csvAspectRows.filter(row => row.split === 'train').length,
    validation: csvAspectRows.filter(row => row.split === 'validation').length,
    test: csvAspectRows.filter(row => row.split === 'test').length }, byAspect: {} };
for (const aspect of Object.keys(aspectColumns)) {
  const trainingAspectRows = [
    ...existingAspectTrain.filter(row => row.aspect === aspect),
    ...csvAspectRows.filter(row => row.aspect === aspect && row.split === 'train')
  ];
  const validationAspectRows = [
    ...existingAspectValidation.filter(row => row.aspect === aspect),
    ...csvAspectRows.filter(row => row.aspect === aspect && row.split === 'validation')
  ];
  const testAspectRows = [
    ...existingAspectTest.filter(row => row.aspect === aspect),
    ...csvAspectRows.filter(row => row.aspect === aspect && row.split === 'test')
  ];
  const classifier = trainAspectClassifier(trainingAspectRows);
  const calibration = fitTemperature(classifier, validationAspectRows);
  aspectModel.models[aspect] = classifier;
  const predictor = text => predictWithModel(classifier, text);
  aspectReport.byAspect[aspect] = {
    calibration,
    trainLabelCounts: Object.fromEntries(aspectClasses.map(label => [label, trainingAspectRows.filter(row => row.label === label).length])),
    validation: multiclassMetrics(validationAspectRows, predictor, aspectClasses),
    test: multiclassMetrics(testAspectRows, predictor, aspectClasses),
    presenceTest: aspectPresenceMetrics(testAspectRows, predictor),
    polarityTest: aspectPolarityMetrics(testAspectRows, predictor),
    testBySource: Object.fromEntries([...new Set(testAspectRows.map(row => row.source))].map(source => [source,
      ({ allLabels: multiclassMetrics(testAspectRows.filter(row => row.source === source), predictor, aspectClasses),
        presence: aspectPresenceMetrics(testAspectRows.filter(row => row.source === source), predictor),
        polarity: aspectPolarityMetrics(testAspectRows.filter(row => row.source === source), predictor) })]))
  };
}

fs.writeFileSync(modelPath, JSON.stringify(model));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
fs.writeFileSync(aspectModelPath, JSON.stringify(aspectModel));
fs.writeFileSync(aspectReportPath, JSON.stringify(aspectReport, null, 2));
console.log(JSON.stringify({ modelPath, aspectModelPath, aspectReportPath, reportPath,
  aspectReport, vocabularySize: Object.keys(model.vocabulary).length,
  calibration: report.calibration, splitCounts: report.splitCounts, validation: report.validation, test: report.test, testBySource: report.testBySource }, null, 2));
