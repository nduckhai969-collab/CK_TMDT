/**
 * number-format.js
 * Tiện ích định dạng số tiền cho các ô nhập liệu có thuộc tính data-thousands.
 *
 * Được nạp bởi: jobs.html, income.html, packages.html, profile.html,
 * customer_requests.html, customer_complaint.html
 *
 * Cung cấp:
 *   readFormattedNumber(idHoacElementHoacChuoi) -> Number
 *   setFormattedNumber(idHoacElement, giaTri)   -> gán lại value đã có dấu phân cách
 *   Tự động thêm dấu phân cách hàng nghìn khi người dùng gõ vào input[data-thousands].
 */
(function () {
  'use strict';

  function resolveElement(target) {
    if (target && typeof target === 'object' && 'value' in target) return target;
    if (typeof target === 'string') return document.getElementById(target);
    return null;
  }

  // "9.500.000đ" | "9,500,000" | "9500000" | 9500000 -> 9500000
  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
    if (value === null || value === undefined) return 0;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return 0;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(amount) {
    return amount.toLocaleString('vi-VN');
  }

  function readFormattedNumber(target) {
    const element = resolveElement(target);
    return element ? toNumber(element.value) : toNumber(target);
  }

  function setFormattedNumber(target, value) {
    const element = resolveElement(target);
    if (!element) return;
    if (value === '' || value === null || value === undefined) {
      element.value = '';
      return;
    }
    element.value = formatNumber(toNumber(value));
  }

  // Định dạng ngay khi người dùng gõ, giữ nguyên vị trí con trỏ.
  function formatWhileTyping(element) {
    const raw = element.value;
    const caret = element.selectionStart;
    const digitsBeforeCaret = (raw.slice(0, caret === null ? raw.length : caret).match(/\d/g) || []).length;
    const digits = raw.replace(/\D/g, '');
    const formatted = digits ? formatNumber(Number(digits)) : '';
    element.value = formatted;

    if (caret === null || typeof element.setSelectionRange !== 'function') return;
    let position = 0;
    let seen = 0;
    while (position < formatted.length && seen < digitsBeforeCaret) {
      if (formatted[position] >= '0' && formatted[position] <= '9') seen += 1;
      position += 1;
    }
    element.setSelectionRange(position, position);
  }

  document.addEventListener('input', function (event) {
    const element = event.target;
    if (element instanceof HTMLInputElement && element.hasAttribute('data-thousands')) {
      formatWhileTyping(element);
    }
  });

  window.readFormattedNumber = readFormattedNumber;
  window.setFormattedNumber = setFormattedNumber;
})();
