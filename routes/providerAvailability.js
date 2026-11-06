const TIME_SLOTS = [
  { label: '10:00 - 12:00', start: 10 * 60, end: 12 * 60, period: 'morning' },
  { label: '12:00 - 14:00', start: 12 * 60, end: 14 * 60, period: 'afternoon' },
  { label: '18:00 - 20:00', start: 18 * 60, end: 20 * 60, period: 'evening' },
  { label: '20:00 - 22:00', start: 20 * 60, end: 22 * 60, period: 'evening' }
];

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function dayKey(date) {
  return WEEK_DAYS[(date.getDay() + 6) % 7];
}

function allowedDayKeys(workingHours = '') {
  const normalized = String(workingHours).toUpperCase().replace(/\s/g, '');
  const dayRange = normalized.match(/(T[2-7]|CN)-(T[2-7]|CN)/);
  if (dayRange) {
    const start = WEEK_DAYS.indexOf(dayRange[1]);
    const end = WEEK_DAYS.indexOf(dayRange[2]);
    if (start >= 0 && end >= start) return WEEK_DAYS.slice(start, end + 1);
  }
  return WEEK_DAYS.filter(day => normalized.includes(day));
}

function workingTimeRange(workingHours = '') {
  const match = String(workingHours).match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { start: Number(match[1]) * 60 + Number(match[2]), end: Number(match[3]) * 60 + Number(match[4]) };
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activeBookedSlots(orders, providerId, date) {
  const activeStatuses = new Set(['processing', 'pending', 'accepted', 'requested']);
  const key = dateKey(date);
  return new Set((orders || [])
    .filter(order => order.providerId === providerId && order.scheduledDate === key && activeStatuses.has(String(order.orderStatus || '').toLowerCase()))
    .map(order => order.scheduledTime)
    .filter(Boolean));
}

function slotsForDate(provider, date, orders = [], now = new Date()) {
  if (!provider || ['busy', 'unavailable', 'offline', 'inactive', 'paused'].includes(String(provider.availabilityStatus || '').toLowerCase())) return [];

  const curKey = dateKey(date);

  // 1. Kiểm tra chế độ nghỉ phép (Vacation Mode)
  if (provider.vacation && provider.vacation.active && provider.vacation.from && provider.vacation.to) {
    if (curKey >= provider.vacation.from && curKey <= provider.vacation.to) {
      return [];
    }
  }

  // 2. Kiểm tra ngày ngoại lệ theo tháng (Date Exceptions / Specific Date Overrides)
  const exceptions = provider.dateExceptions || (provider.schedule && provider.schedule.dateExceptions);
  let forceAvailable = false;
  if (exceptions && exceptions[curKey]) {
    const ex = exceptions[curKey];
    if (ex === 'off' || ex.status === 'off' || ex.closed === true) {
      return []; // Khóa bận ngày cụ thể này
    }
    if (ex === 'available' || ex.status === 'available') {
      forceAvailable = true; // Mở rảnh ngày cụ thể này
    }
  }

  const weekday = dayKey(date);
  const scheduleRows = provider.schedule && Array.isArray(provider.schedule.slots) ? provider.schedule.slots : null;
  const row = scheduleRows && scheduleRows.find(slot => slot.day === weekday);

  const dayIsAvailable = forceAvailable || (row
    ? (row.morning || row.afternoon || row.evening)
    : (provider.workingHours ? allowedDayKeys(provider.workingHours).includes(weekday) : false));
  if (!dayIsAvailable) return [];

  const range = (row || forceAvailable) ? null : workingTimeRange(provider.workingHours);
  const booked = activeBookedSlots(orders, provider.id, date);
  const isToday = dateKey(date) === dateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return TIME_SLOTS.filter(slot => {
    if (!forceAvailable && row && !row[slot.period]) return false;
    if (range && (slot.start < range.start || slot.end > range.end)) return false;
    if (isToday && slot.start <= nowMinutes) return false;
    if (booked.has(slot.label)) return false;
    return true;
  }).map(slot => slot.label);
}

module.exports = { TIME_SLOTS, slotsForDate, dateKey };
