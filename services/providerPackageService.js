const db = require('../data/db');

const DEFAULT_PACKAGES = [
  {
    id: 'PKG_BASIC',
    name: 'Gói Cơ Bản (Mặc định)',
    price: 0,
    duration: 30,
    postsCount: 3,
    serviceLimit: 3,
    proposalLimit: 10,
    boostLimit: 0,
    feeDiscountPercent: 0,
    features: ['Đăng tối đa 3 dịch vụ kỹ năng', 'Thời hạn hiển thị 30 ngày', 'Nhận đơn hàng & thanh toán Escrow', 'Hỗ trợ khách hàng tiêu chuẩn'],
    highlight: false
  },
  {
    id: 'PKG_PRO',
    name: 'Gói Chuyên Nghiệp (Pro Provider)',
    price: 199000,
    duration: 30,
    postsCount: 15,
    serviceLimit: 15,
    proposalLimit: 30,
    boostLimit: 3,
    feeDiscountPercent: 2,
    features: ['Đăng tối đa 15 dịch vụ kỹ năng', '3 lượt đẩy tin lên Top tìm kiếm mỗi tháng (7 ngày/lượt)', 'Gắn huy hiệu uy tín "PRO PROVIDER"', 'Giảm phí nền tảng từ 5% còn 3%', 'Ưu tiên hiển thị trong thời gian đẩy tin'],
    highlight: true,
    badgeText: 'PHỔ BIẾN NHẤT'
  },
  {
    id: 'PKG_VIP',
    name: 'Gói Doanh Nghiệp (VIP Elite)',
    price: 499000,
    duration: 30,
    postsCount: 0,
    serviceLimit: null,
    proposalLimit: null,
    boostLimit: 10,
    feeDiscountPercent: 4,
    features: ['Không giới hạn bài đăng dịch vụ', '10 lượt đẩy tin Hot mỗi tháng (7 ngày/lượt)', 'Huy hiệu vàng "VIP ELITE"', 'Giảm phí nền tảng từ 5% còn 1%', 'Không giới hạn lượt chào giá'],
    highlight: false
  }
];

function getPackageCatalog() {
  const custom = db.getCollection('packages') || [];
  if (Array.isArray(custom) && custom.length) {
    return custom;
  }
  return DEFAULT_PACKAGES;
}

function getPlan(provider) {
  const catalog = getPackageCatalog();
  const basicPkg = catalog.find(p => p.id === 'PKG_BASIC') || DEFAULT_PACKAGES[0];
  
  if (!provider) {
    return {
      packageId: basicPkg.id,
      package: basicPkg,
      expiresAt: null,
      daysRemaining: 0,
      feeDiscountPercent: 0,
      serviceLimit: 3,
      proposalLimit: 10,
      boostLimit: 0,
      boostsUsed: 0,
      proposalsUsed: 0
    };
  }

  let pkgId = provider.activePackage || 'PKG_BASIC';
  let expiresAt = provider.packageExpiresAt || null;

  if (expiresAt) {
    const expiryMs = Date.parse(expiresAt);
    if (Number.isFinite(expiryMs) && expiryMs <= Date.now() && pkgId !== 'PKG_BASIC') {
      pkgId = 'PKG_BASIC';
      expiresAt = null;
    }
  }

  const pkg = catalog.find(p => p.id === pkgId) || DEFAULT_PACKAGES.find(p => p.id === pkgId) || basicPkg;

  let daysRemaining = 0;
  if (expiresAt) {
    const expiryMs = Date.parse(expiresAt);
    if (Number.isFinite(expiryMs)) {
      daysRemaining = Math.max(0, Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24)));
    }
  }

  const isVip = pkg.id === 'PKG_VIP';
  const isPro = pkg.id === 'PKG_PRO';

  const serviceLimit = isVip || pkg.postsCount === 0 ? null : (Number(pkg.postsCount) || (isPro ? 15 : 3));
  const proposalLimit = isVip ? null : (isPro ? 30 : 10);
  const boostLimit = isVip ? 10 : (isPro ? 3 : 0);
  const feeDiscountPercent = isVip ? 4 : (isPro ? 2 : 0);
  const boostsUsed = Number(provider.boostsUsed || 0);

  return {
    packageId: pkg.id,
    package: pkg,
    expiresAt,
    daysRemaining,
    feeDiscountPercent,
    serviceLimit,
    proposalLimit,
    boostLimit,
    boostsUsed,
    proposalsUsed: 0
  };
}

async function repairSameDayRenewals(provider) {
  if (!provider) return;
  try {
    const purchases = (await db.getCollectionFresh('packagePurchases')) || [];
    let changed = false;

    const myPurchases = purchases.filter(item => String(item.providerId) === String(provider.id));
    const activePurchases = myPurchases.filter(item => item.status === 'Đang hoạt động');

    if (activePurchases.length > 1) {
      // Keep only the first (latest) as active
      activePurchases.slice(1).forEach(item => {
        item.status = String(item.packageId) === String(provider.activePackage) ? 'Đã gia hạn' : 'Đã thay thế';
        changed = true;
      });
    }

    if (changed) {
      if (typeof db.saveCollectionAndWait === 'function') {
        await db.saveCollectionAndWait('packagePurchases', purchases);
      } else {
        db.saveCollection('packagePurchases', purchases);
      }
    }
  } catch (err) {
    console.error('[providerPackageService] repairSameDayRenewals error:', err.message);
  }
}

function countMonthlyProposals(provider) {
  if (!provider) return 0;
  try {
    const jobRequests = db.getCollection('jobRequests') || [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const providerIds = new Set([String(provider.id), String(provider.userId)].filter(Boolean));

    let count = 0;
    jobRequests.forEach(job => {
      (job.applicants || []).forEach(applicant => {
        if (providerIds.has(String(applicant.providerId)) || providerIds.has(String(applicant.providerUserId))) {
          const createdAt = applicant.createdAt ? new Date(applicant.createdAt) : null;
          if (!createdAt || isNaN(createdAt.getTime()) || (createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear)) {
            count++;
          }
        }
      });
    });
    return count;
  } catch (err) {
    return 0;
  }
}

module.exports = {
  DEFAULT_PACKAGES,
  getPackageCatalog,
  getPlan,
  repairSameDayRenewals,
  countMonthlyProposals
};
