function formatDateTime(date) {
  const d = new Date(date);
  const DD = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const YYYY = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${DD}/${MM}/${YYYY} ${HH}:${mm}`;
}

module.exports = {
  formatDateTime
};
