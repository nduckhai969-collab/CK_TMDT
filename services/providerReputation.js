const POSITIVE = new Set(['pos', 'positive']);
const NEGATIVE = new Set(['neg', 'negative']);

function classifyReview(review) {
  const sentiment = String(review?.aiAnalysis?.overallSentiment || '').toLowerCase();
  if (POSITIVE.has(sentiment)) return 'pos';
  if (NEGATIVE.has(sentiment)) return 'neg';
  if (sentiment === 'neutral' || sentiment === 'neu') return 'neu';
  return null;
}

function scoreReview(review) {
  const sentiment = classifyReview(review);
  const confidence = Number(review?.aiAnalysis?.overallConfidence) || 0;
  const reputationEligible = (sentiment === 'pos' || sentiment === 'neg') && confidence >= 68;
  return {
    sentiment,
    sentimentConfidence: confidence,
    reputationEligible,
    reputationPoints: reputationEligible ? (sentiment === 'pos' ? 1 : -1) : 0
  };
}

function calculateProviderReputation(reviews = []) {
  let positiveReviewCount = 0;
  let negativeReviewCount = 0;
  let reputationPoints = 0;
  let eligibleReviewCount = 0;
  for (const review of reviews) {
    const { sentiment, reputationEligible, reputationPoints: points } = scoreReview(review);
    if (reputationEligible) eligibleReviewCount += 1;
    if (reputationEligible && sentiment === 'pos') positiveReviewCount += 1;
    if (reputationEligible && sentiment === 'neg') negativeReviewCount += 1;
    reputationPoints += points;
  }
  // Neutral prior of five positive and five negative reviews prevents one review
  // from pushing a new provider straight to either end of the 0–100 scale.
  const reputationScore = eligibleReviewCount
    ? Math.round(Math.max(0, Math.min(100, 50 + (50 * reputationPoints) / (eligibleReviewCount + 10))))
    : 50;
  return { reputationPoints, reputationScore, positiveReviewCount, negativeReviewCount };
}

function addReviewSentimentPoints(review) {
  return { ...review, ...scoreReview(review) };
}

function attachProviderReputation(provider, reviews = []) {
  return { ...provider, ...calculateProviderReputation(reviews) };
}

module.exports = { classifyReview, scoreReview, calculateProviderReputation, addReviewSentimentPoints, attachProviderReputation };
