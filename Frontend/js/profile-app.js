/**
 * ============================================================
 * SkillRental Platform - Provider Profile & Availability App
 * profile-app.js
 * ============================================================
 */

let currentMode = 'ready';
let currentProviderData = null;
let providerServices = [];

// Tab switching between profile sub-views
function switchSection(targetId, tabEl) {
  document.querySelectorAll('.profile-sub-view').forEach(view => {
    view.style.display = 'none';
  });
  const activeView = document.getElementById(targetId);
  if (activeView) {
    activeView.style.display = 'block';
  }

  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.remove('active');
  });
  if (tabEl) {
    tabEl.classList.add('active');
  }
}

// Modal helpers
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// Toast alert
function showToast(msg) {
  const toast = document.getElementById('toastBox');
  const toastMsg = document.getElementById('toastMsg');
  if (toast && toastMsg) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

// Trigger provider avatar upload safely without event bubbling recursion
function triggerProviderAvatarUpload(e) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
  }
  const input = document.getElementById('providerAvatarFileInput');
  if (input) input.click();
}
window.triggerProviderAvatarUpload = triggerProviderAvatarUpload;

// Upload provider cover file
async function uploadProviderCoverFile(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  const isValidImg = file.type ? file.type.toLowerCase().startsWith('image/') : /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (!isValidImg) {
    showToast('Chỉ hỗ trợ file ảnh định dạng JPG, PNG hoặc WebP!');
    input.value = '';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast('Ảnh bìa có dung lượng tối đa 15 MB!');
    input.value = '';
    return;
  }

  // Preview ảnh bìa ngay lập tức
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      const coverEl = document.querySelector('.profile-cover');
      if (coverEl) {
        coverEl.style.backgroundImage = `url("${e.target.result}")`;
        coverEl.style.backgroundSize = 'cover';
        coverEl.style.backgroundPosition = 'center';
      }
    };
    reader.readAsDataURL(file);
  } catch (_) {}

  try {
    showToast('Đang tải ảnh bìa lên hệ thống...');
    const res = await window.providerApi.uploadCover(file);
    if (res && res.success && res.cover) {
      const coverEl = document.querySelector('.profile-cover');
      if (coverEl) {
        coverEl.style.backgroundImage = `url("${res.cover}")`;
        coverEl.style.backgroundSize = 'cover';
        coverEl.style.backgroundPosition = 'center';
      }
      const iCover = document.getElementById('inputCoverUrl');
      if (iCover) iCover.value = res.cover;
      if (currentProviderData) currentProviderData.cover = res.cover;
      try {
        localStorage.setItem('SKILLRENTAL_PROVIDER_COVER', res.cover);
        ['SKILLRENTAL_CURRENT_USER', 'SKILLRENTAL_PROVIDER_USER'].forEach(key => {
          const uRaw = sessionStorage.getItem(key);
          const uObj = uRaw ? JSON.parse(uRaw) : {};
          uObj.cover = res.cover;
          if (!uObj.role) uObj.role = 'Provider';
          sessionStorage.setItem(key, JSON.stringify(uObj));
        });
      } catch (_) {}
      showToast('Đã đổi ảnh bìa thành công!');
    } else {
      showToast(res?.message || 'Không thể lưu ảnh bìa!');
    }
  } catch (err) {
    console.error('Lỗi upload cover:', err);
    showToast('Có lỗi xảy ra khi tải ảnh bìa!');
  } finally {
    input.value = '';
  }
}

// Upload provider avatar file
async function uploadProviderAvatarFile(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  const isValidImg = file.type ? file.type.toLowerCase().startsWith('image/') : /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (!isValidImg) {
    showToast('Chỉ hỗ trợ file ảnh định dạng JPG, PNG hoặc WebP!');
    input.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Ảnh đại diện có dung lượng tối đa 10 MB!');
    input.value = '';
    return;
  }

  // Preview ảnh đại diện ngay lập tức
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewData = e.target.result;
      const avatarEl = document.querySelector('.profile-avatar-lg');
      if (avatarEl) {
        avatarEl.innerHTML = `<img src="${previewData}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      }
      const sideAvatar = document.querySelector('.sidebar-profile .avatar');
      if (sideAvatar) {
        sideAvatar.innerHTML = `<img src="${previewData}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      }
    };
    reader.readAsDataURL(file);
  } catch (_) {}

  try {
    showToast('Đang tải ảnh đại diện lên hệ thống...');
    const res = await window.providerApi.uploadAvatar(file);
    if (res && res.success && res.avatar) {
      const avatarEl = document.querySelector('.profile-avatar-lg');
      if (avatarEl) {
        avatarEl.innerHTML = `<img src="${res.avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      }
      const sideAvatar = document.querySelector('.sidebar-profile .avatar');
      if (sideAvatar) {
        sideAvatar.innerHTML = `<img src="${res.avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      }
      const iAvt = document.getElementById('inputAvatarUrl');
      if (iAvt) iAvt.value = res.avatar;
      if (currentProviderData) currentProviderData.avatar = res.avatar;
      try {
        localStorage.setItem('SKILLRENTAL_PROVIDER_AVATAR', res.avatar);
        ['SKILLRENTAL_CURRENT_USER', 'SKILLRENTAL_PROVIDER_USER'].forEach(key => {
          const uRaw = sessionStorage.getItem(key);
          const uObj = uRaw ? JSON.parse(uRaw) : {};
          uObj.avatar = res.avatar;
          if (!uObj.role) uObj.role = 'Provider';
          sessionStorage.setItem(key, JSON.stringify(uObj));
        });
        if (typeof window.currentUser === 'object' && window.currentUser) {
          window.currentUser.avatar = res.avatar;
        }
      } catch (_) {}
      showToast('Đã đổi ảnh đại diện thành công!');
    } else {
      showToast(res?.message || 'Không thể lưu ảnh đại diện!');
    }
  } catch (err) {
    console.error('Lỗi upload avatar:', err);
    showToast('Có lỗi xảy ra khi tải ảnh đại diện!');
  } finally {
    input.value = '';
  }
}

// Save profile changes (Backend connected)
async function saveProfileChanges() {
  const name = document.getElementById('inputName')?.value?.trim();
  const phone = document.getElementById('inputPhone')?.value?.trim();
  const headline = document.getElementById('inputHeadline')?.value?.trim();
  const category = document.getElementById('inputCategory')?.value;
  const location = document.getElementById('inputLocation')?.value?.trim();
  const avatar = document.getElementById('inputAvatarUrl')?.value?.trim();
  const cover = document.getElementById('inputCoverUrl')?.value?.trim();
  const bio = document.getElementById('inputBio')?.value?.trim();

  if (name) {
    const vName = document.getElementById('viewName');
    if (vName) vName.innerText = name;
  }
  if (phone) {
    const vPhone = document.getElementById('viewPhone');
    if (vPhone) vPhone.innerText = phone;
  }
  if (headline) {
    const vHead = document.getElementById('viewHeadline');
    if (vHead) vHead.innerText = headline;
  }
  if (location) {
    const vLoc = document.getElementById('viewLocation');
    if (vLoc) vLoc.innerText = location;
  }
  if (bio) {
    const vBio = document.getElementById('viewBio');
    if (vBio) vBio.innerHTML = '<p>' + escapeHtml(bio).replace(/\n/g, '<br>') + '</p>';
  }
  if (avatar) {
    const avatarEl = document.querySelector('.profile-avatar-lg');
    if (avatarEl) {
      avatarEl.innerHTML = `<img src="${avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
    const sideAvatar = document.querySelector('.sidebar-profile .avatar');
    if (sideAvatar) {
      sideAvatar.innerHTML = `<img src="${avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
  }
  if (cover) {
    const coverEl = document.querySelector('.profile-cover');
    if (coverEl) {
      coverEl.style.backgroundImage = `url("${cover}")`;
      coverEl.style.backgroundSize = 'cover';
      coverEl.style.backgroundPosition = 'center';
    }
  }

  try {
    if (window.providerApi) {
      const payload = {
        name,
        phone,
        specialty: headline,
        category,
        location,
        bio
      };
      if (avatar) payload.avatar = avatar;
      if (cover) payload.cover = cover;
      await window.providerApi.updateProfile(payload);

      if (currentProviderData) {
        if (name) currentProviderData.name = name;
        if (phone) currentProviderData.phone = phone;
        if (headline) currentProviderData.specialty = headline;
        if (category) currentProviderData.category = category;
        if (location) currentProviderData.location = location;
        if (bio) currentProviderData.bio = bio;
        if (avatar) currentProviderData.avatar = avatar;
        if (cover) currentProviderData.cover = cover;
      }

      ['SKILLRENTAL_CURRENT_USER', 'SKILLRENTAL_PROVIDER_USER'].forEach(key => {
        try {
          const uRaw = sessionStorage.getItem(key);
          const uObj = uRaw ? JSON.parse(uRaw) : {};
          if (name) uObj.name = name;
          if (phone) uObj.phone = phone;
          if (headline) uObj.specialty = headline;
          if (avatar) uObj.avatar = avatar;
          if (cover) uObj.cover = cover;
          sessionStorage.setItem(key, JSON.stringify(uObj));
        } catch (_) {}
      });
    }
  } catch (e) {
    console.warn('Backend sync warning:', e);
  }

  closeModal('editProfileModal');
  showToast('Đã lưu thông tin hồ sơ Provider thành công!');
}

// Add new skill (Backend connected)
async function addNewSkill() {
  const name = document.getElementById('inputSkillName')?.value?.trim();
  const group = document.getElementById('inputSkillGroup')?.value || 'primary';
  const level = document.getElementById('inputSkillLevel')?.value || 'intermediate';

  if (!name) {
    alert('Vui lòng nhập tên kỹ năng!');
    return;
  }

  const levelMap = {
    expert: { label: 'Chuyên gia (Expert)', cls: 'level-expert' },
    intermediate: { label: 'Thành thạo (Intermediate)', cls: 'level-intermediate' },
    beginner: { label: 'Cơ bản (Beginner)', cls: 'level-beginner' }
  };

  const targetList = group === 'primary' 
    ? document.getElementById('primarySkillsList') 
    : document.getElementById('secondarySkillsList');

  if (targetList) {
    const item = document.createElement('div');
    item.className = 'skill-card-item';
    item.innerHTML = `
      <div class="skill-info">
        <div class="skill-name"><i class="fa-solid fa-code" style="color: var(--primary);"></i> ${escapeHtml(name)}</div>
        <div style="display:flex; gap: 8px; align-items:center; margin-top: 4px;">
          <span class="skill-badge-level ${levelMap[level].cls}">${levelMap[level].label}</span>
          <span class="badge badge-neutral" style="font-size: 10px;">Vừa thêm</span>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" style="padding: 0 8px; color: var(--danger);" onclick="deleteSkill(this, '${escapeHtml(name)}')">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    targetList.prepend(item);
  }

  const inputSkillName = document.getElementById('inputSkillName');
  if (inputSkillName) inputSkillName.value = '';

  try {
    if (window.providerApi) {
      await window.providerApi.addSkill(name, level, group);
    }
  } catch (e) {
    console.warn('Backend skill add error:', e);
  }

  closeModal('addSkillModal');
  showToast(`Đã thêm thành công kỹ năng "${name}"!`);
}

async function deleteSkill(btn, skillName) {
  if (confirm('Bạn có chắc chắn muốn xóa kỹ năng này khỏi hồ sơ?')) {
    const card = btn.closest('.skill-card-item');
    if (card) card.remove();
    if (skillName && window.providerApi) {
      try {
        await window.providerApi.deleteSkill(skillName);
      } catch (e) {
        console.warn('Backend skill delete error:', e);
      }
    }
    showToast('Đã gỡ bỏ kỹ năng thành công!');
  }
}

// Save hourly rate (Backend connected)
async function saveHourlyRate() {
  const val = typeof readFormattedNumber === 'function' ? readFormattedNumber('inputHourlyRateVal') : document.getElementById('inputHourlyRateVal')?.value;
  const minWeeklyHours = Number(document.getElementById('inputMinWeeklyHours')?.value || 0);
  if (val || minWeeklyHours) {
    const formatted = Number(val).toLocaleString('vi-VN') + 'đ';
    const displayEl = document.getElementById('displayHourlyRate');
    if (displayEl && val) {
      displayEl.innerHTML = `${formatted} <span style="font-size: 15px; color: var(--text-muted); font-weight: 500;">/ giờ làm việc</span>`;
    }
    try {
      if (window.providerApi) {
        const payload = { minWeeklyHours: minWeeklyHours || null };
        if (val) payload.hourlyRate = Number(val);
        const response = await window.providerApi.updateProfile(payload);
        if (!response?.success) throw new Error(response?.message || 'Không thể cập nhật thông tin đơn giá.');
        if (currentProviderData) Object.assign(currentProviderData, payload);
      }
    } catch (e) {
      console.warn('Backend hourly rate update error:', e);
      showToast(e.message || 'Không thể cập nhật thông tin đơn giá.');
      return;
    }
  }
  const weeklyHoursSummary = document.getElementById('weeklyHoursSummary');
  if (weeklyHoursSummary) weeklyHoursSummary.textContent = minWeeklyHours ? `Tối thiểu ${minWeeklyHours} giờ/tuần.` : 'Chưa thiết lập số giờ tối thiểu mỗi tuần.';
  closeModal('editHourlyModal');
  showToast('Đã cập nhật thông tin nhận việc theo giờ.');
}

// Availability status switcher (Backend connected)
async function setStatusMode(mode, saveToBackend = true) {
  if (mode === 'inactive') mode = 'paused';
  currentMode = mode;
  const btnReady = document.getElementById('statusReady');
  const btnLimited = document.getElementById('statusLimited');
  const btnPaused = document.getElementById('statusPaused');
  const banner = document.getElementById('vacationBanner');
  const headerBadge = document.getElementById('headerStatusBadge');

  if (btnReady) btnReady.className = 'status-pill-option';
  if (btnLimited) btnLimited.className = 'status-pill-option';
  if (btnPaused) btnPaused.className = 'status-pill-option';

  if (mode === 'ready') {
    if (btnReady) btnReady.classList.add('active');
    if (banner) banner.style.display = 'none';
    if (headerBadge) {
      headerBadge.className = 'badge badge-success';
      headerBadge.innerHTML = '<span class="badge-dot"></span> Đang Sẵn Sàng Nhận Việc';
    }
    if (saveToBackend) showToast('Trạng thái: Đang sẵn sàng nhận việc!');
  } else if (mode === 'limited') {
    if (btnLimited) btnLimited.classList.add('active-limited');
    if (banner) banner.style.display = 'none';
    if (headerBadge) {
      headerBadge.className = 'badge badge-warning';
      headerBadge.innerHTML = '<span class="badge-dot"></span> Nhận Việc Có Giới Hạn';
    }
    if (saveToBackend) showToast('Trạng thái: Nhận việc có giới hạn!');
  } else if (mode === 'paused') {
    if (btnPaused) btnPaused.classList.add('active-paused');
    if (banner) banner.style.display = 'flex';
    if (headerBadge) {
      headerBadge.className = 'badge badge-danger';
      headerBadge.innerHTML = '<span class="badge-dot"></span> Đang Tạm Dừng / Nghỉ Phép';
    }
    if (saveToBackend) showToast('Trạng thái: Tạm dừng nhận đơn!');
  }

  if (!saveToBackend) return;

  try {
    if (window.providerApi) {
      await window.providerApi.updateAvailability(mode);
    }
  } catch (e) {
    console.warn('Backend availability status error:', e);
  }
}

async function toggleHourlyAvailability(toggle) {
  if (!currentProviderData) return;
  try {
    const res = await window.providerApi.updateProfile({ hourlyEnabled: Boolean(toggle.checked) });
    if (!res?.success) throw new Error(res?.message || 'Không thể cập nhật trạng thái nhận việc theo giờ.');
    currentProviderData.hourlyEnabled = Boolean(toggle.checked);
    const badge = document.getElementById('hourlyStatusBadge');
    if (badge) {
      badge.textContent = toggle.checked ? 'Đang bật nhận việc theo giờ' : 'Chưa bật nhận việc theo giờ';
      badge.className = `badge ${toggle.checked ? 'badge-success' : 'badge-neutral'}`;
    }
    showToast(toggle.checked ? 'Đã bật nhận việc theo giờ.' : 'Đã tắt nhận việc theo giờ.');
  } catch (error) {
    toggle.checked = !toggle.checked;
    showToast(error.message || 'Không thể cập nhật trạng thái nhận việc theo giờ.');
  }
}

async function saveBookingRules() {
  const leadTime = Number(document.getElementById('inputLeadTime')?.value || 0);
  const maxProjects = Number(document.getElementById('inputMaxProjects')?.value || 0);
  const payload = {};
  if (leadTime) payload.leadTime = leadTime;
  if (maxProjects && document.getElementById('inputMaxProjects')?.dataset.touched === 'true') payload.maxProjects = maxProjects;
  if (!Object.keys(payload).length) return;
  try {
    const result = await window.providerApi.updateAvailability(payload);
    if (!result?.success) throw new Error(result?.message || 'Không thể lưu quy tắc nhận đơn.');
    if (currentProviderData) Object.assign(currentProviderData, payload);
    showToast('Đã lưu quy tắc nhận đơn.');
  } catch (error) {
    showToast(error.message || 'Không thể lưu quy tắc nhận đơn.');
  }
}

// Toggle single slot in schedule matrix
function toggleSlot(cell) {
  if (cell.classList.contains('available')) {
    cell.classList.remove('available');
    cell.classList.add('busy');
    cell.textContent = 'Bận';
  } else {
    cell.classList.remove('busy');
    cell.classList.add('available');
    cell.textContent = 'Rảnh (Sẵn sàng)';
  }
}

// Bulk schedule actions
function setAllSlots(isAvailable) {
  document.querySelectorAll('.slot-cell').forEach(cell => {
    if (isAvailable) {
      cell.className = 'slot-cell available';
      cell.textContent = 'Rảnh (Sẵn sàng)';
    } else {
      cell.className = 'slot-cell busy';
      cell.textContent = 'Bận';
    }
  });
  showToast(isAvailable ? 'Đã bật rảnh tất cả các khung giờ!' : 'Đã đặt lại toàn bộ lịch làm việc!');
}

function setBusinessHoursOnly() {
  const rows = document.querySelectorAll('#scheduleTableBody tr');
  rows.forEach((row, rIdx) => {
    const cells = row.querySelectorAll('.slot-cell');
    cells.forEach((cell, cIdx) => {
      if (cIdx < 5 && (rIdx === 0 || rIdx === 1)) {
        cell.className = 'slot-cell available';
        cell.textContent = 'Rảnh (Sẵn sàng)';
      } else {
        cell.className = 'slot-cell busy';
        cell.textContent = 'Bận';
      }
    });
  });
  showToast('Đã áp dụng lịch làm việc Giờ Hành Chính (T2 - T6)!');
}

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function renderScheduleMatrix(slots) {
  if (!Array.isArray(slots)) slots = [];
  const tbody = document.getElementById('scheduleTableBody');
  if (!tbody) return;
  if (tbody.querySelectorAll('tr').length < 3) {
    const shifts = [
      { key: 'morning', name: 'Ca Sáng', time: '08:00 - 12:00', icon: 'fa-sun', color: '#F59E0B' },
      { key: 'afternoon', name: 'Ca Chiều', time: '13:30 - 17:30', icon: 'fa-cloud-sun', color: '#3B82F6' },
      { key: 'evening', name: 'Ca Tối', time: '19:00 - 22:00', icon: 'fa-moon', color: '#6366F1' }
    ];
    tbody.innerHTML = shifts.map(shift => `<tr><td class="schedule-time-col"><div style="font-weight:700;color:var(--secondary);"><i class="fa-solid ${shift.icon}" style="color:${shift.color};margin-right:4px;"></i> ${shift.name}</div><div style="font-size:11px;color:var(--text-muted);">${shift.time}</div></td>${WEEK_DAYS.map(() => '<td><div class="slot-cell busy" onclick="toggleSlot(this)">Chưa mở lịch</div></td>').join('')}</tr>`).join('');
  }
  const rows = document.querySelectorAll('#scheduleTableBody tr');
  if (rows.length < 3) return;

  WEEK_DAYS.forEach((day, dIdx) => {
    const slotObj = slots.find(s => s.day === day);
    if (!slotObj) {
      [0, 1, 2].forEach((rowIndex) => {
        const cell = rows[rowIndex]?.querySelectorAll('.slot-cell')[dIdx];
        if (cell) { cell.className = 'slot-cell busy'; cell.textContent = 'Chưa mở lịch'; }
      });
      return;
    }

    const morningCell = rows[0]?.querySelectorAll('.slot-cell')[dIdx];
    if (morningCell) setSlotCellStatus(morningCell, !!slotObj.morning);

    const afternoonCell = rows[1]?.querySelectorAll('.slot-cell')[dIdx];
    if (afternoonCell) setSlotCellStatus(afternoonCell, !!slotObj.afternoon);

    const eveningCell = rows[2]?.querySelectorAll('.slot-cell')[dIdx];
    if (eveningCell) setSlotCellStatus(eveningCell, !!slotObj.evening);
  });
}

function setSlotCellStatus(cell, isAvail) {
  if (isAvail) {
    cell.className = 'slot-cell available';
    cell.textContent = 'Rảnh (Sẵn sàng)';
  } else {
    cell.className = 'slot-cell busy';
    cell.textContent = 'Bận';
  }
}

async function saveWeeklyScheduleMatrix() {
  const rows = document.querySelectorAll('#scheduleTableBody tr');
  if (rows.length < 3) return;

  const slots = WEEK_DAYS.map((day, dIdx) => {
    const morningCell = rows[0]?.querySelectorAll('.slot-cell')[dIdx];
    const afternoonCell = rows[1]?.querySelectorAll('.slot-cell')[dIdx];
    const eveningCell = rows[2]?.querySelectorAll('.slot-cell')[dIdx];
    return {
      day,
      morning: morningCell ? morningCell.classList.contains('available') : true,
      afternoon: afternoonCell ? afternoonCell.classList.contains('available') : true,
      evening: eveningCell ? eveningCell.classList.contains('available') : false
    };
  });

  try {
    if (window.providerApi) {
      await window.providerApi.updateAvailability({ schedule: { slots } });
    }
    showToast('Đã lưu cấu hình ma trận lịch làm việc hàng tuần!');
  } catch (e) {
    console.warn('Lỗi khi lưu ma trận lịch:', e);
    showToast('Có lỗi xảy ra khi lưu lịch làm việc!');
  }
}

async function saveVacationSchedule() {
  const from = document.getElementById('inputVacationFrom')?.value;
  const to = document.getElementById('inputVacationTo')?.value;
  const message = document.getElementById('inputVacationMsg')?.value;

  if (!from || !to) {
    alert('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc nghỉ phép!');
    return;
  }

  if (to < from) {
    alert('Ngày kết thúc nghỉ phép không thể trước ngày bắt đầu!');
    return;
  }

  const vacation = {
    active: true,
    from,
    to,
    message
  };

  try {
    if (window.providerApi) {
      await window.providerApi.updateAvailability({ vacation, mode: 'paused' });
    }
    setStatusMode('paused', false);
    showToast('Đã kích hoạt chế độ nghỉ phép từ ' + from + ' đến ' + to + '!');
  } catch (e) {
    console.warn('Lỗi lưu lịch nghỉ phép:', e);
    showToast('Có lỗi xảy ra khi lưu lịch nghỉ phép!');
  }
}

function renderServicesList(services) {
  const container = document.getElementById('packagesContainer');
  if (!container) return;
  const serviceList = Array.isArray(services) ? services : [];
  const publicCount = serviceList.filter(service => service.status !== 'inactive').length;
  const countLabel = document.getElementById('serviceCountSummary');
  if (countLabel) {
    countLabel.textContent = publicCount === serviceList.length
      ? `${publicCount} gói đang hiển thị`
      : `${publicCount} đang hiển thị · ${serviceList.length} tổng`;
  }

  if (serviceList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: #fff; border: 1px dashed var(--border-color); border-radius: 12px;">
        <i class="fa-solid fa-box-open" style="font-size: 36px; color: var(--text-muted); margin-bottom: 12px;"></i>
        <div style="font-weight: 600; color: var(--secondary);">Chưa có gói dịch vụ nào</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Hãy tạo gói dịch vụ đầu tiên để khách hàng có thể đặt lịch ngay!</div>
        <button class="btn btn-primary btn-sm" style="margin-top: 14px;" onclick="openCreateServiceModal()">
          <i class="fa-solid fa-plus"></i> Tạo Gói Ngay
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = serviceList.map(s => {
    const priceFormatted = Number(s.price || 0).toLocaleString('vi-VN') + 'đ';
    const duration = s.duration || s.deliveryTime || '3-5 ngày';
    const lines = (s.description || '').split('\n').filter(l => l.trim().length > 0);
    const featuresHtml = lines.map(line => `<li><i class="fa-solid fa-check" style="color: var(--primary);"></i> ${escapeHtml(line)}</li>`).join('');

    return `
      <div class="package-card" data-service-id="${s.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <span class="badge badge-neutral" style="width: fit-content;">${escapeHtml(s.category || 'Dịch vụ')}</span>
          ${s.status === 'inactive' ? '<span class="badge badge-warning" style="font-size:11px;">Đang ẩn với khách hàng</span>' : ''}
          <span class="badge badge-success" style="font-size: 11px;"><i class="fa-solid fa-clock"></i> ${escapeHtml(duration)}</span>
        </div>
        <div style="font-weight: 700; font-size: 17px; margin-top: 10px; color: var(--secondary);">${escapeHtml(s.title || s.name || 'Gói dịch vụ')}</div>
        <div class="package-price" style="color: var(--primary); margin: 8px 0;">${priceFormatted}</div>
        
        <ul class="package-feature-list" style="margin-top: 12px; min-height: 80px;">
          ${featuresHtml || '<li><i class="fa-solid fa-check" style="color: var(--primary);"></i> Dịch vụ chuyên nghiệp bàn giao đúng hẹn</li>'}
        </ul>

        <div style="display:flex; gap:8px; margin-top: 16px;">
          <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openEditServiceModal('${s.id}')">
            <i class="fa-solid fa-pen"></i> Chỉnh Sửa
          </button>
          <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: #FECACA;" onclick="deletePackageService('${s.id}')">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderProviderProfileCollections(provider) {
  const skills = Array.isArray(provider.skills) ? provider.skills : [];
  const normalizeSkill = skill => typeof skill === 'string' ? { name: skill, group: 'primary' } : (skill || {});
  const skillItems = skills.map(normalizeSkill).filter(skill => skill.name || skill.skill);
  const renderSkill = skill => {
    const name = String(skill.name || skill.skill || '');
    const encodedName = encodeURIComponent(name).replace(/'/g, '%27');
    return `<div class="skill-card-item"><div class="skill-info"><div class="skill-name"><i class="fa-solid fa-code" style="color:var(--primary);"></i> ${escapeHtml(name)}</div>${skill.level ? `<span class="skill-badge-level level-${escapeHtml(skill.level)}" style="margin-top:4px;width:fit-content;">${escapeHtml(skill.levelLabel || skill.level)}</span>` : ''}</div><button class="btn btn-outline btn-sm" style="padding:0 8px;color:var(--danger);" onclick="deleteSkill(this, decodeURIComponent('${encodedName}'))"><i class="fa-solid fa-trash"></i></button></div>`;
  };
  const primary = document.getElementById('primarySkillsList');
  const secondary = document.getElementById('secondarySkillsList');
  const primarySkills = skillItems.filter(skill => skill.group !== 'secondary');
  const secondarySkills = skillItems.filter(skill => skill.group === 'secondary');
  if (primary) primary.innerHTML = primarySkills.length ? primarySkills.map(renderSkill).join('') : '<div style="color:var(--text-muted);font-size:13px;">Chưa có kỹ năng chuyên môn.</div>';
  if (secondary) secondary.innerHTML = secondarySkills.length ? secondarySkills.map(renderSkill).join('') : '<div style="color:var(--text-muted);font-size:13px;">Chưa có kỹ năng bổ trợ.</div>';
  const skillCount = document.getElementById('primarySkillsCount');
  if (skillCount) skillCount.textContent = `${primarySkills.length} kỹ năng`;

  const certifications = Array.isArray(provider.certifications) ? provider.certifications : [];
  const certList = document.getElementById('certificationsList');
  if (certList) certList.innerHTML = certifications.length
    ? certifications.map(cert => {
      const item = typeof cert === 'string' ? { name: cert } : (cert || {});
      return `<div class="cert-item-card"><div class="cert-icon-box"><i class="fa-solid fa-certificate"></i></div><div class="cert-content"><div class="cert-name">${escapeHtml(item.name || item.title || 'Chứng chỉ')}</div>${item.issuer || item.organization ? `<div class="cert-org">${escapeHtml(item.issuer || item.organization)}</div>` : ''}${item.issuedAt || item.date || item.id ? `<div class="cert-meta">${item.issuedAt || item.date ? `<span>Cấp: ${escapeHtml(item.issuedAt || item.date)}</span>` : ''}${item.id ? `<span>ID: ${escapeHtml(item.id)}</span>` : ''}</div>` : ''}</div>${item.verified ? '<span class="badge badge-success">Đã xác minh</span>' : ''}</div>`;
    }).join('') : '<div style="color:var(--text-muted);font-size:13px;">Chưa có chứng chỉ được cập nhật.</div>';

  const experienceItems = [...(Array.isArray(provider.experiences) ? provider.experiences : []), ...(Array.isArray(provider.education) ? provider.education : [])];
  const experienceSection = document.getElementById('experienceSection');
  const experienceList = document.getElementById('experienceList');
  if (experienceSection && experienceList) {
    experienceSection.style.display = experienceItems.length ? '' : 'none';
    experienceList.innerHTML = experienceItems.map(item => `<div style="display:flex;gap:12px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--primary);margin-top:6px;"></div><div><div style="font-weight:600;font-size:14px;">${escapeHtml(item.title || item.position || item.degree || item.name || '')}${item.organization || item.company || item.school ? ` • ${escapeHtml(item.organization || item.company || item.school)}` : ''}</div><div style="font-size:12px;color:var(--text-muted);">${escapeHtml(item.period || [item.from, item.to].filter(Boolean).join(' - '))}</div>${item.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(item.description)}</div>` : ''}</div></div>`).join('');
  }

  const links = provider.portfolioLinks || provider.links || {};
  const portfolio = document.getElementById('portfolioLinks');
  const linkEntries = Array.isArray(links) ? links : Object.entries(links).map(([label, url]) => ({ label, url }));
  const validLinks = linkEntries.map(link => typeof link === 'string' ? { label: link, url: link } : link).filter(link => {
    try { return ['http:', 'https:'].includes(new URL(link.url).protocol); } catch (_) { return false; }
  });
  if (portfolio) portfolio.innerHTML = validLinks.length ? validLinks.map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="justify-content:flex-start;gap:10px;"><i class="fa-solid fa-link" style="width:18px;"></i> ${escapeHtml(link.label || link.url)}</a>`).join('') : '<span style="color:var(--text-muted);font-size:13px;">Chưa có liên kết portfolio.</span>';
}

function openCreateServiceModal() {
  const idEl = document.getElementById('inputPackageId');
  if (idEl) idEl.value = '';
  const titleEl = document.getElementById('inputPackageTitle');
  if (titleEl) titleEl.value = '';
  const priceEl = document.getElementById('inputPackagePrice');
  if (priceEl) priceEl.value = '';
  const durEl = document.getElementById('inputPackageDuration');
  if (durEl) durEl.value = '3-5 ngày';
  const catEl = document.getElementById('inputPackageCategory');
  if (catEl) catEl.value = 'IT';
  const descEl = document.getElementById('inputPackageDesc');
  if (descEl) descEl.value = 'Bàn giao đúng tiến độ cam kết\nHỗ trợ chỉnh sửa theo yêu cầu\nTư vấn giải pháp miễn phí';
  const title = document.querySelector('#editPackageModal .modal-header div');
  if (title) title.innerHTML = '<i class="fa-solid fa-plus-circle" style="color: var(--primary);"></i> Tạo Gói Dịch Vụ Mới';
  openModal('editPackageModal');
}

function openEditServiceModal(id) {
  const s = providerServices.find(item => String(item.id) === String(id));
  if (!s) return;
  const idEl = document.getElementById('inputPackageId');
  if (idEl) idEl.value = s.id;
  const titleEl = document.getElementById('inputPackageTitle');
  if (titleEl) titleEl.value = s.title || s.name || '';
  const priceEl = document.getElementById('inputPackagePrice');
  if (priceEl) priceEl.value = s.price || '';
  const durEl = document.getElementById('inputPackageDuration');
  if (durEl) durEl.value = s.duration || s.deliveryTime || '';
  const catEl = document.getElementById('inputPackageCategory');
  if (catEl && s.category) catEl.value = s.category;
  const descEl = document.getElementById('inputPackageDesc');
  if (descEl) descEl.value = s.description || '';
  const title = document.querySelector('#editPackageModal .modal-header div');
  if (title) title.innerHTML = '<i class="fa-solid fa-box-archive" style="color: var(--primary);"></i> Chỉnh Sửa Gói Dịch Vụ';
  openModal('editPackageModal');
}

async function savePackageService() {
  const id = document.getElementById('inputPackageId')?.value;
  const title = document.getElementById('inputPackageTitle')?.value?.trim();
  const price = Number(document.getElementById('inputPackagePrice')?.value);
  const duration = document.getElementById('inputPackageDuration')?.value?.trim();
  const category = document.getElementById('inputPackageCategory')?.value;
  const description = document.getElementById('inputPackageDesc')?.value?.trim();

  if (!title) {
    alert('Vui lòng nhập tên gói dịch vụ!');
    return;
  }
  if (!price || price <= 0) {
    alert('Vui lòng nhập giá dịch vụ hợp lệ!');
    return;
  }

  const payload = {
    title,
    name: title,
    price,
    duration,
    category,
    description
  };

  try {
    if (id) {
      await window.providerApi.updateService(id, payload);
      showToast('Đã cập nhật gói dịch vụ thành công!');
    } else {
      await window.providerApi.createService(payload);
      showToast('Đã tạo gói dịch vụ mới thành công!');
    }
    closeModal('editPackageModal');
    await loadProviderProfile();
  } catch (e) {
    console.warn('Lỗi lưu gói dịch vụ:', e);
    showToast('Có lỗi khi lưu gói dịch vụ!');
  }
}

async function deletePackageService(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa gói dịch vụ này? Khách hàng sẽ không thể đặt gói này nữa.')) {
    return;
  }
  try {
    await window.providerApi.deleteService(id);
    showToast('Đã xóa gói dịch vụ thành công!');
    await loadProviderProfile();
  } catch (e) {
    console.warn('Lỗi xóa dịch vụ:', e);
    showToast('Có lỗi khi xóa gói dịch vụ!');
  }
}

async function loadProviderProfile() {
  // 1. Render tức thời từ LocalStorage để không bao giờ bị chớp ảnh cũ hoặc hiển thị '--'
  // Profile pictures come from the authenticated Provider record. Shared browser
  // keys can otherwise leak one account's avatar or cover into another account.
  const localAvatar = '';
  const localCover = '';

  if (localAvatar) {
    const avatarEl = document.querySelector('.profile-avatar-lg');
    if (avatarEl) {
      avatarEl.innerHTML = `<img src="${localAvatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
    const sideAvatar = document.querySelector('.sidebar-profile .avatar');
    if (sideAvatar) {
      sideAvatar.innerHTML = `<img src="${localAvatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
    const iAvt = document.getElementById('inputAvatarUrl');
    if (iAvt && !iAvt.value) iAvt.value = localAvatar;
  }

  if (localCover) {
    const coverEl = document.querySelector('.profile-cover');
    if (coverEl) {
      coverEl.style.backgroundImage = `url("${localCover}")`;
      coverEl.style.backgroundSize = 'cover';
      coverEl.style.backgroundPosition = 'center';
    }
    const iCover = document.getElementById('inputCoverUrl');
    if (iCover && !iCover.value) iCover.value = localCover;
  }

  try {
    const packagesContainer = document.getElementById('packagesContainer');
    const countLabel = document.getElementById('serviceCountSummary');
    if (packagesContainer) packagesContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--text-muted);">Đang tải gói dịch vụ...</div>';
    if (countLabel) countLabel.textContent = 'Đang tải...';
    if (!window.providerApi) throw new Error('Không thể kết nối tới dữ liệu gói dịch vụ.');
    const res = await window.providerApi.getProfile();
    if (!res || !res.success || !res.provider) throw new Error(res?.message || 'Không tải được hồ sơ dịch vụ.');

    currentProviderData = res.provider;
    providerServices = res.services || [];

    const p = res.provider;

    // Ưu tiên bảo toàn ảnh mới của người dùng (LocalStorage là chân lý của phiên làm việc)
    if (localAvatar) {
      p.avatar = localAvatar;
      try {
        window.providerApi.updateProfile({ avatar: localAvatar });
      } catch (_) {}
    } else if (p.avatar) {
      try {
        localStorage.setItem('SKILLRENTAL_PROVIDER_AVATAR', p.avatar);
      } catch (_) {}
    }

    if (localCover) {
      p.cover = localCover;
      try {
        window.providerApi.updateProfile({ cover: localCover });
      } catch (_) {}
    } else if (p.cover) {
      try {
        localStorage.setItem('SKILLRENTAL_PROVIDER_COVER', p.cover);
      } catch (_) {}
    }

    // Compute dynamic initials or render avatar photo
    const nameParts = String(p.name || '').trim().split(/\s+/);
    const initials = nameParts.length >= 2 
      ? (nameParts[nameParts.length - 2][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : (nameParts[0] ? nameParts[0].slice(0, 2).toUpperCase() : 'SR');

    // Render cover photo
    const coverEl = document.querySelector('.profile-cover');
    if (coverEl) {
      if (p.cover && p.cover.trim()) {
        coverEl.style.backgroundImage = `url("${p.cover}")`;
        coverEl.style.backgroundSize = 'cover';
        coverEl.style.backgroundPosition = 'center';
      } else if (!localCover) {
        coverEl.style.backgroundImage = '';
      }
    }
    const iCover = document.getElementById('inputCoverUrl');
    if (iCover) iCover.value = p.cover || localCover || '';

    const iAvt = document.getElementById('inputAvatarUrl');
    if (iAvt) iAvt.value = p.avatar || localAvatar || '';

    const iPhone = document.getElementById('inputPhone');
    if (iPhone) iPhone.value = p.phone || '';

    const iCat = document.getElementById('inputCategory');
    if (iCat && p.category) iCat.value = p.category;

    const avatarEl = document.querySelector('.profile-avatar-lg');
    if (avatarEl) {
      const displayAvatar = p.avatar || localAvatar;
      if (displayAvatar && displayAvatar.trim()) {
        avatarEl.innerHTML = `<img src="${displayAvatar}" alt="${p.name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        avatarEl.textContent = initials;
      }
    }

    const sideAvatar = document.querySelector('.sidebar-profile .avatar');
    if (sideAvatar) {
      const displayAvatar = p.avatar || localAvatar;
      if (displayAvatar && displayAvatar.trim()) {
        sideAvatar.innerHTML = `<img src="${displayAvatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        sideAvatar.textContent = initials;
      }
    }
    const sideName = document.querySelector('.sidebar-profile .profile-name');
    if (sideName && p.name) sideName.textContent = p.name;
    const sideRole = document.querySelector('.sidebar-profile .profile-role');
    if (sideRole && (p.specialty || p.headline)) sideRole.textContent = p.specialty || p.headline;

    const vEmail = document.getElementById('viewEmail');
    if (vEmail) vEmail.textContent = p.email || 'Chưa cập nhật email';
    const vPhone = document.getElementById('viewPhone');
    if (vPhone) vPhone.textContent = p.phone || 'Chưa cập nhật số điện thoại';
    const phoneBadge = document.getElementById('verifiedPhoneValue');
    if (phoneBadge) phoneBadge.textContent = p.phoneVerified ? 'Đã xác minh' : (p.phone || 'Chưa cập nhật');
    const emailBadge = document.getElementById('verifiedEmailBadge');
    if (emailBadge) emailBadge.textContent = p.emailVerified ? 'Đã xác minh' : 'Chưa xác minh';
    const identityBadge = document.getElementById('identityVerificationBadge');
    if (identityBadge) identityBadge.textContent = p.verified ? 'Đã xác minh' : 'Chưa xác minh';
    const profileIdentityBadge = document.getElementById('profileIdentityBadge');
    if (profileIdentityBadge) profileIdentityBadge.textContent = p.verified ? 'Đã xác minh danh tính' : 'Chưa xác minh danh tính';
    const bankBadge = document.getElementById('bankAccountBadge');
    if (bankBadge) bankBadge.textContent = p.bankName || p.bankAccount?.bank || 'Chưa cập nhật';
    const vJoin = document.getElementById('viewJoinDate');
    if (vJoin) vJoin.textContent = p.createdAt || p.joinDate ? 'Tham gia: ' + (p.createdAt || p.joinDate) : 'Chưa có thông tin ngày tham gia';
    const rEl = document.getElementById('statRatingDisplay');
    if (rEl) rEl.innerHTML = Number(p.reviewCount || p.reviews || 0) ? `${Number(p.rating || 0).toFixed(1)} ⭐ <span style="font-size:13px;font-weight:500;color:var(--text-muted);">(${Number(p.reviewCount || p.reviews || 0)})</span>` : 'Chưa có đánh giá';
    const oEl = document.getElementById('statOrdersDisplay');
    if (oEl) oEl.innerHTML = `${Number(p.completedOrders || 0)} <span style="font-size:12px;font-weight:500;color:var(--text-muted);">dự án</span>`;
    const responseRate = document.getElementById('statResponseRateDisplay');
    if (responseRate) responseRate.textContent = p.responseRate != null ? `${p.responseRate}%` : 'Chưa có dữ liệu';
    const onTimeRate = document.getElementById('statOnTimeRateDisplay');
    if (onTimeRate) onTimeRate.textContent = p.onTimeRate != null ? `${p.onTimeRate}%` : 'Chưa có dữ liệu';
    const displayName = String(p.name || '').trim();
    const vName = document.getElementById('viewName');
    if (vName) vName.innerText = displayName || 'Chưa cập nhật tên';
    const iName = document.getElementById('inputName');
    if (iName) iName.value = displayName;
    const sidebarName = document.querySelector('.sidebar-profile .profile-name');
    if (sidebarName) sidebarName.textContent = displayName || 'Chưa cập nhật tên';
    const headline = p.specialty || p.headline || '';
    const vHead = document.getElementById('viewHeadline');
    if (vHead) vHead.innerText = headline || 'Chưa cập nhật chức danh';
    const iHead = document.getElementById('inputHeadline');
    if (iHead) iHead.value = headline;
    const location = p.location || '';
    const vLoc = document.getElementById('viewLocation');
    if (vLoc) vLoc.innerText = location || 'Chưa cập nhật địa điểm';
    const iLoc = document.getElementById('inputLocation');
    if (iLoc) iLoc.value = location;
    const iCategory = document.getElementById('inputCategory');
    if (iCategory) iCategory.value = p.category || '';
    const languages = Array.isArray(p.languages) ? p.languages.join(', ') : (p.languages || '');
    const languagesWrap = document.getElementById('viewLanguagesWrap');
    const languagesEl = document.getElementById('viewLanguages');
    if (languagesWrap) languagesWrap.style.display = languages ? '' : 'none';
    if (languagesEl) languagesEl.textContent = languages;
    const bio = String(p.bio || '');
    const vBio = document.getElementById('viewBio');
    if (vBio) vBio.innerHTML = bio ? '<p>' + escapeHtml(bio).replace(/\n/g, '<br>') + '</p>' : 'Chưa có phần giới thiệu.';
    const iBio = document.getElementById('inputBio');
    if (iBio) iBio.value = bio;
    {
      const vRate = document.getElementById('displayHourlyRate');
      if (vRate) vRate.innerHTML = p.hourlyRate ? `${Number(p.hourlyRate).toLocaleString('vi-VN')}đ <span style="font-size: 15px; color: var(--text-muted); font-weight: 500;">/ giờ làm việc</span>` : 'Chưa cập nhật đơn giá';
      const iRate = document.getElementById('inputHourlyRateVal');
      if (iRate) iRate.value = p.hourlyRate ? Number(p.hourlyRate).toLocaleString('vi-VN') : '';
    }

    const mode = p.mode || p.availabilityStatus || 'ready';
    setStatusMode(mode, false);

    const completionFields = [p.name, p.phone, p.specialty || p.headline, p.category, p.location, p.bio, p.avatar, p.cover, p.skills?.length, p.hourlyRate];
    const completion = Math.round(completionFields.filter(value => value !== undefined && value !== null && value !== '' && value !== 0).length / completionFields.length * 100);
    const completionBar = document.getElementById('profileCompletenessBar');
    const completionValue = document.getElementById('profileCompletenessValue');
    if (completionBar) completionBar.style.width = `${completion}%`;
    if (completionValue) completionValue.textContent = `${completion}%`;
    const completionHint = document.getElementById('profileCompletenessHint');
    if (completionHint) completionHint.textContent = completion === 100 ? 'Hồ sơ đã được cập nhật đầy đủ.' : 'Hãy cập nhật thông tin còn thiếu để hoàn thiện hồ sơ.';

    const hourlyToggle = document.getElementById('hourlyAvailabilityToggle');
    if (hourlyToggle) hourlyToggle.checked = p.hourlyEnabled !== undefined ? Boolean(p.hourlyEnabled) : Boolean(p.hourlyRate);
    const hourlyStatusBadge = document.getElementById('hourlyStatusBadge');
    if (hourlyStatusBadge) {
      const hourlyEnabled = p.hourlyEnabled !== undefined ? Boolean(p.hourlyEnabled) : Boolean(p.hourlyRate);
      hourlyStatusBadge.textContent = hourlyEnabled ? 'Đang bật nhận việc theo giờ' : 'Chưa bật nhận việc theo giờ';
      hourlyStatusBadge.className = `badge ${hourlyEnabled ? 'badge-success' : 'badge-neutral'}`;
    }
    const weeklyHours = document.getElementById('inputMinWeeklyHours');
    const weeklyHoursSummary = document.getElementById('weeklyHoursSummary');
    if (weeklyHours) weeklyHours.value = p.minWeeklyHours || '';
    if (weeklyHoursSummary) weeklyHoursSummary.textContent = p.minWeeklyHours ? `Tối thiểu ${p.minWeeklyHours} giờ/tuần.` : 'Chưa thiết lập số giờ tối thiểu mỗi tuần.';
    const leadTimeInput = document.getElementById('inputLeadTime');
    if (leadTimeInput) leadTimeInput.value = p.leadTime || '';
    const maxProjects = Number(p.maxProjects || p.maxConcurrentProjects || 0);
    const maxProjectsInput = document.getElementById('inputMaxProjects');
    const maxProjectsValue = document.getElementById('maxProjectValue');
    if (maxProjectsInput) {
      maxProjectsInput.dataset.touched = 'false';
      if (maxProjects > 0) maxProjectsInput.value = String(Math.min(10, Math.max(1, maxProjects)));
    }
    if (maxProjectsValue) maxProjectsValue.textContent = maxProjects > 0 ? `${maxProjects} Dự án` : 'Chưa thiết lập';

    if (p.vacation) {
      if (p.vacation.from && document.getElementById('inputVacationFrom')) {
        document.getElementById('inputVacationFrom').value = p.vacation.from;
      }
      if (p.vacation.to && document.getElementById('inputVacationTo')) {
        document.getElementById('inputVacationTo').value = p.vacation.to;
      }
      if (p.vacation.message && document.getElementById('inputVacationMsg')) {
        document.getElementById('inputVacationMsg').value = p.vacation.message;
      }
    }

    if (p.schedule && p.schedule.slots) {
      renderScheduleMatrix(p.schedule.slots);
    }

    renderProviderProfileCollections(p);

    renderServicesList(providerServices);

    const badgeEl = document.getElementById('displayProviderCodeBadge');
    if (badgeEl) badgeEl.textContent = p.id ? 'Mã: ' + p.id : 'Mã: Chưa cấp';
    const linkEl = document.getElementById('linkPublicProfile');
    if (linkEl) {
      const publicUrl = p.id ? `customer_provider.html?id=${encodeURIComponent(p.id)}` : '#';
      linkEl.href = publicUrl;
      const textEl = document.getElementById('linkPublicProfileText'); if (textEl) textEl.textContent = publicUrl; else linkEl.textContent = publicUrl;
    }

    try {
      ['SKILLRENTAL_CURRENT_USER', 'SKILLRENTAL_PROVIDER_USER'].forEach(key => {
        const uRaw = sessionStorage.getItem(key);
        if (uRaw) {
          const uObj = JSON.parse(uRaw);
          if (p.avatar) uObj.avatar = p.avatar;
          if (p.cover) uObj.cover = p.cover;
          if (p.name) uObj.name = p.name;
          sessionStorage.setItem(key, JSON.stringify(uObj));
        }
      });
    } catch (_) {}

    providerDateExceptions = (p.dateExceptions && typeof p.dateExceptions === 'object') ? JSON.parse(JSON.stringify(p.dateExceptions)) : {};
    drawProviderMonthlyCalendar();
  } catch (err) {
    console.warn('Lỗi nạp thông tin hồ sơ provider:', err);
    const packagesContainer = document.getElementById('packagesContainer');
    const countLabel = document.getElementById('serviceCountSummary');
    if (packagesContainer) packagesContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--danger);">Không tải được gói dịch vụ. Vui lòng tải lại trang.</div>';
    if (countLabel) countLabel.textContent = 'Chưa tải được';
  }
}

let providerMonthCalendar = new Date();
let providerDateExceptions = {};

function previewPublicProfile() {
  if (currentProviderData && currentProviderData.id) {
    window.open(`customer_provider.html?id=${encodeURIComponent(currentProviderData.id)}`, '_blank');
  } else {
    showToast('Chưa có mã hồ sơ để xem trước.');
  }
}
window.previewPublicProfile = previewPublicProfile;

function copyPublicBookingLink() {
  if (!currentProviderData || !currentProviderData.id) {
    showToast('Chưa nạp xong thông tin Provider!');
    return;
  }
  const url = `${window.location.origin}/customer_provider.html?id=${encodeURIComponent(currentProviderData.id)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Đã sao chép link hồ sơ công khai vào clipboard!');
    }).catch(() => {
      prompt('Sao chép link dưới đây để gửi cho khách:', url);
    });
  } else {
    prompt('Sao chép link dưới đây để gửi cho khách:', url);
  }
}
window.copyPublicBookingLink = copyPublicBookingLink;

function changeProviderMonth(delta) {
  providerMonthCalendar.setMonth(providerMonthCalendar.getMonth() + delta);
  drawProviderMonthlyCalendar();
}
window.changeProviderMonth = changeProviderMonth;

function resetProviderMonthToCurrent() {
  providerMonthCalendar = new Date();
  drawProviderMonthlyCalendar();
}
window.resetProviderMonthToCurrent = resetProviderMonthToCurrent;

function drawProviderMonthlyCalendar() {
  const container = document.getElementById('providerMonthlyCalendarGrid');
  const titleEl = document.getElementById('providerMonthTitle');
  if (!container) return;

  const year = providerMonthCalendar.getFullYear();
  const month = providerMonthCalendar.getMonth();

  if (titleEl) {
    titleEl.textContent = `Tháng ${month + 1}, ${year}`;
  }

  container.innerHTML = '';

  const dayHeaders = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  dayHeaders.forEach(dh => {
    const h = document.createElement('div');
    h.className = 'provider-cal-day-header';
    h.textContent = dh;
    container.appendChild(h);
  });

  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDayOfWeek; i++) {
    const empty = document.createElement('div');
    empty.style.minHeight = '68px';
    container.appendChild(empty);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const scheduleSlots = (currentProviderData && currentProviderData.schedule && Array.isArray(currentProviderData.schedule.slots))
    ? currentProviderData.schedule.slots
    : null;

  const vacation = currentProviderData?.vacation;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const weekdayIdx = (dateObj.getDay() + 6) % 7;
    const weekdayKey = WEEK_DAYS[weekdayIdx];

    const isPast = iso < todayKey;
    const inVacation = vacation && vacation.active && vacation.from && vacation.to && (iso >= vacation.from && iso <= vacation.to);

    const weekRow = scheduleSlots ? scheduleSlots.find(s => s.day === weekdayKey) : null;
    const weeklyAvailable = weekRow ? (weekRow.morning || weekRow.afternoon || weekRow.evening) : true;

    const exception = providerDateExceptions[iso];
    let isBusy = false;
    let isAvail = false;
    let statusText = '';
    let cellClass = '';

    if (inVacation) {
      cellClass = 'is-vacation';
      statusText = 'Nghỉ phép';
    } else if (exception) {
      if (exception === 'off' || exception.status === 'off' || exception.closed) {
        cellClass = 'is-busy';
        isBusy = true;
        statusText = 'Khóa bận';
      } else {
        cellClass = 'is-available';
        isAvail = true;
        statusText = 'Mở rảnh (Ngoại lệ)';
      }
    } else if (weeklyAvailable) {
      cellClass = 'is-available';
      isAvail = true;
      statusText = 'Rảnh tuần';
    } else {
      cellClass = 'is-holiday';
      statusText = 'Nghỉ định kỳ';
    }

    if (isPast) {
      cellClass += ' is-past';
    }

    const cell = document.createElement('div');
    cell.className = `provider-cal-cell ${cellClass}`;
    cell.dataset.date = iso;
    cell.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="provider-cal-date-num">${d}</span>
        ${iso === todayKey ? '<span style="font-size:10px; font-weight:800; color:var(--primary);">Hôm nay</span>' : ''}
      </div>
      <div>
        <span class="provider-cal-status-tag" style="${inVacation ? 'background:#FEF3C7; color:#92400E;' : isBusy ? 'background:#FEE2E2; color:#DC2626;' : isAvail ? 'background:#DCFCE7; color:#15803D;' : 'background:#F1F5F9; color:#64748B;'}">
          ${statusText}
        </span>
      </div>
    `;

    if (!isPast && !inVacation) {
      cell.title = 'Nhấp để Đổi Trạng Thái (Mở Rảnh / Khóa Bận)';
      cell.onclick = () => {
        toggleDateException(iso, isAvail);
      };
    } else if (inVacation) {
      cell.title = 'Ngày này đang trong kỳ nghỉ phép chung của bạn';
    }

    container.appendChild(cell);
  }
}
window.drawProviderMonthlyCalendar = drawProviderMonthlyCalendar;

function toggleDateException(iso, currentlyAvailable) {
  if (currentlyAvailable) {
    providerDateExceptions[iso] = { status: 'off', reason: 'Khóa bận đột xuất' };
    showToast(`Đã đổi ngày ${iso} thành KHÓA BẬN! Hãy nhấn "Lưu Lịch Ngoại Lệ Tháng".`);
  } else {
    providerDateExceptions[iso] = { status: 'available' };
    showToast(`Đã đổi ngày ${iso} thành MỞ RẢNH! Hãy nhấn "Lưu Lịch Ngoại Lệ Tháng".`);
  }
  drawProviderMonthlyCalendar();
}

async function saveMonthlyDateExceptions() {
  try {
    if (window.providerApi) {
      await window.providerApi.updateAvailability({ dateExceptions: providerDateExceptions });
      if (currentProviderData) {
        currentProviderData.dateExceptions = { ...providerDateExceptions };
      }
      showToast('Đã lưu lịch ngoại lệ tháng thành công! Khách hàng sẽ thấy các ngày cập nhật ngay lập tức.');
    }
  } catch (e) {
    console.warn('Lỗi lưu ngày ngoại lệ:', e);
    showToast('Lỗi khi lưu lịch ngoại lệ tháng!');
  }
}
window.saveMonthlyDateExceptions = saveMonthlyDateExceptions;

function clearAllDateExceptions() {
  if (!confirm('Bạn có chắc muốn xóa tất cả tùy chỉnh ngày ngoại lệ trong tháng này và quay về lịch tuần mặc định?')) {
    return;
  }
  providerDateExceptions = {};
  drawProviderMonthlyCalendar();
  showToast('Đã đặt lại ngoại lệ. Hãy bấm "Lưu Lịch Ngoại Lệ Tháng" để áp dụng.');
}
window.clearAllDateExceptions = clearAllDateExceptions;

// Auto-activate tab from URL hash if present
window.addEventListener('hashchange', () => {
  const rawH = window.location.hash.replace('#', ''); const hash = rawH === 'services' ? 'uc31-services' : (rawH === 'profile' ? 'uc29-profile' : (rawH === 'skills' ? 'uc30-skills' : (rawH === 'availability' ? 'uc32-availability' : rawH)));
  if (hash && document.getElementById(hash)) {
    const tabEl = document.querySelector(`.tab-item[onclick*="${hash}"]`);
    switchSection(hash, tabEl);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadProviderProfile();
  const rawH = window.location.hash.replace('#', ''); const hash = rawH === 'services' ? 'uc31-services' : (rawH === 'profile' ? 'uc29-profile' : (rawH === 'skills' ? 'uc30-skills' : (rawH === 'availability' ? 'uc32-availability' : rawH)));
  if (hash && document.getElementById(hash)) {
    const tabEl = document.querySelector(`.tab-item[onclick*="${hash}"]`);
    switchSection(hash, tabEl);
  }
});
