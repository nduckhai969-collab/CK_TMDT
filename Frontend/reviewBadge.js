// Compact sentiment label shared by customer review pages.
function renderAiBadge(aiAnalysis) {
  if (!aiAnalysis) return '';
  const sentiment = aiAnalysis.overallSentiment;
  const positive = sentiment === 'pos';
  const negative = sentiment === 'neg';
  const color = positive ? '#15803D' : negative ? '#B91C1C' : '#475569';
  const background = positive ? '#F0FDF4' : negative ? '#FEF2F2' : '#F1F5F9';
  const border = positive ? '#BBF7D0' : negative ? '#FECACA' : '#CBD5E1';
  const label = positive ? 'Tích cực' : negative ? 'Tiêu cực' : 'Trung lập';
  const icon = positive ? 'fa-circle-check' : negative ? 'fa-circle-xmark' : 'fa-circle-info';
  return `<div class="ai-sentiment-box" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:${background};border:1px solid ${border};border-radius:8px;font-size:12px;font-weight:700;color:${color};margin-top:6px;box-shadow:0 1px 2px rgba(0,0,0,0.02)"><i class="fa-solid ${icon}" style="color:${color};margin-right:5px"></i><span>${label}</span></div>`;
}
window.renderAiBadge = renderAiBadge;
