CREATE DATABASE IF NOT EXISTS skillrental
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE skillrental;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS users;

-- 1. BẢNG NGƯỜI DÙNG
CREATE TABLE users (
    id VARCHAR(20) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    role ENUM('Customer', 'Provider', 'Admin') NOT NULL DEFAULT 'Customer',
    password VARCHAR(255) DEFAULT '123456',
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    avatar TEXT,
    address VARCHAR(255),
    bio TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG HỒ SƠ CHUYÊN GIA
CREATE TABLE providers (
    id VARCHAR(20) NOT NULL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL UNIQUE,
    specialty VARCHAR(255),
    category VARCHAR(100),
    hourly_rate DECIMAL(15, 2) NOT NULL DEFAULT 200000.00,
    rating DECIMAL(2, 1) NOT NULL DEFAULT 5.0,
    review_count INT NOT NULL DEFAULT 0,
    completed_orders INT NOT NULL DEFAULT 0,
    location VARCHAR(255),
    verified TINYINT(1) NOT NULL DEFAULT 0,
    badge VARCHAR(50) DEFAULT 'ĐÃ XÁC MINH',
    availability_status VARCHAR(30) NOT NULL DEFAULT 'ready',
    working_hours VARCHAR(100) DEFAULT 'T2-T7, 08:00-20:00',
    bio TEXT,
    CONSTRAINT fk_providers_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG GÓI DỊCH VỤ
CREATE TABLE services (
    id VARCHAR(20) NOT NULL PRIMARY KEY,
    provider_id VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    duration VARCHAR(50) DEFAULT '3-5 ngày',
    category VARCHAR(100),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    CONSTRAINT fk_services_providers FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG ĐƠN ĐẶT LỊCH & KÝ QUỸ
CREATE TABLE orders (
    id VARCHAR(30) NOT NULL PRIMARY KEY,
    customer_id VARCHAR(20) NOT NULL,
    provider_id VARCHAR(20) NOT NULL,
    service_id VARCHAR(20),
    service_title VARCHAR(255),
    price DECIMAL(15, 2) NOT NULL,
    platform_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    escrow_deposit DECIMAL(15, 2) NOT NULL,
    escrow_status ENUM('pending', 'escrow_held', 'completed', 'refunded', 'disputed') NOT NULL DEFAULT 'pending',
    order_status ENUM('pending', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    payment_expire_at DATETIME,
    deadline DATETIME,
    note TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users (id),
    CONSTRAINT fk_orders_provider FOREIGN KEY (provider_id) REFERENCES providers (id),
    CONSTRAINT fk_orders_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG SỔ CÁI BIẾN ĐỘNG SỐ DƯ VÍ
CREATE TABLE wallet_transactions (
    id VARCHAR(30) NOT NULL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    order_id VARCHAR(30),
    type ENUM('deposit', 'escrow', 'refund', 'order_payment', 'withdraw', 'package_purchase') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2),
    method VARCHAR(50) DEFAULT 'vietqr',
    status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'completed',
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transactions_users FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_transactions_orders FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG ĐÁNH GIÁ & UY TÍN
CREATE TABLE reviews (
    id VARCHAR(20) NOT NULL PRIMARY KEY,
    order_id VARCHAR(30) NOT NULL,
    customer_id VARCHAR(20) NOT NULL,
    provider_id VARCHAR(20) NOT NULL,
    rating INT NOT NULL DEFAULT 5,
    content TEXT,
    reply TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_orders FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES users (id),
    CONSTRAINT fk_reviews_provider FOREIGN KEY (provider_id) REFERENCES providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- DỮ LIỆU MẪU
INSERT INTO users (id, name, email, phone, role, password, balance, avatar, address, bio, status) VALUES
('USR001', 'Nguyễn Văn Minh', 'minh.nguyen@example.com', '0901 234 567', 'Provider', '123456', 29500000.00, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Quận 1, TP. Hồ Chí Minh', 'Chuyên gia phát triển phần mềm và kiến trúc hạ tầng Cloud.', 'active'),
('USR002', 'Trần Ngọc Mai', 'mai.tran@example.com', '0912 345 678', 'Provider', '123456', 18500000.00, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 'Cầu Giấy, Hà Nội', 'Thiết kế giao diện người dùng UX/UI & Nhận diện thương hiệu.', 'active'),
('USR003', 'Lê Hoàng Long', 'long.le@example.com', '0988 776 655', 'Customer', '123456', 24600000.00, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Bình Thạnh, TP. Hồ Chí Minh', 'Khách hàng thường xuyên đặt các dịch vụ CNTT và Thiết kế.', 'active'),
('USR004', 'Hoàng Văn Nam', 'nam.hoang@example.com', '0933 221 100', 'Customer', '123456', 5200000.00, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 'Đống Đa, Hà Nội', 'Doanh nghiệp khởi nghiệp cần thuê chuyên gia tư vấn.', 'active'),
('USR005', 'Phạm Gia Huy', 'huy.pham@example.com', '0977 445 566', 'Provider', '123456', 34000000.00, 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200', 'Hải Châu, Đà Nẵng', 'Chuyên gia Digital Marketing, Facebook Ads và tăng trưởng SEO.', 'active'),
('USR006', 'Vũ Thị Minh', 'minh.vu@example.com', '0944 889 900', 'Customer', '123456', 18400000.00, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'Ninh Kiều, Cần Thơ', 'Cần tư vấn thiết kế và xây dựng thương hiệu cá nhân.', 'active'),
('ADM001', 'Quản Trị Viên Sàn', 'admin@skillrental.com', '0999 888 777', 'Admin', 'admin123', 0.00, 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', 'Trụ sở SkillRental', 'Quản trị viên điều hành sàn thương mại điện tử SkillRental.', 'active');

INSERT INTO providers (id, user_id, specialty, category, hourly_rate, rating, review_count, completed_orders, location, verified, badge, availability_status, bio) VALUES
('PRV001', 'USR001', 'Fullstack Web Developer & Cloud Architect', 'IT', 350000.00, 4.9, 52, 48, 'Quận 1, TP. Hồ Chí Minh', 1, 'PRO PROVIDER', 'ready', 'Hơn 6 năm kinh nghiệm xây dựng hệ thống website thương mại điện tử quy mô lớn.'),
('PRV002', 'USR002', 'Senior UI/UX Designer & Brand Identity', 'Design', 280000.00, 4.8, 41, 39, 'Cầu Giấy, Hà Nội', 1, 'PRO PROVIDER', 'ready', 'Chuyên thiết kế Design System Figma, Mobile App và bộ nhận diện thương hiệu doanh nghiệp.'),
('PRV003', 'USR005', 'Digital Marketing Specialist & SEO Growth', 'Marketing', 220000.00, 4.7, 38, 35, 'Hải Châu, Đà Nẵng', 1, 'VIP ELITE', 'ready', 'Tối ưu quảng cáo Google Ads, Meta Ads và SEO tổng thể mang lại chuyển đổi cao.');

INSERT INTO services (id, provider_id, title, price, duration, category, description, status) VALUES
('SVC001', 'PRV001', 'Thiết kế website chuẩn SEO & Tối ưu tốc độ tải trang', 4500000.00, '5-7 ngày', 'IT', 'Bao gồm thiết kế 5-7 trang chuẩn SEO Onpage, tốc độ < 2s, bàn giao mã nguồn gốc.', 'active'),
('SVC002', 'PRV002', 'Thiết kế Logo & Bộ nhận diện thương hiệu trọn gói', 2800000.00, '3-5 ngày', 'Design', 'Bao gồm 3 phương án Logo độc quyền, Guideline màu sắc, Font chữ và ấn phẩm văn phòng.', 'active'),
('SVC003', 'PRV003', 'Tối ưu hóa chiến dịch quảng cáo Facebook Ads & Google Ads', 3200000.00, '10 ngày', 'Marketing', 'Thiết lập chiến dịch, A/B Testing mẫu quảng cáo, target chuẩn tệp khách hàng tiềm năng.', 'active'),
('SVC004', 'PRV001', 'Xây dựng ứng dụng di động Flutter đa nền tảng', 8000000.00, '14-21 ngày', 'IT', 'Lập trình ứng dụng Android và iOS với giao diện đẹp mắt và hiệu năng cao.', 'active');

INSERT INTO orders (id, customer_id, provider_id, service_id, service_title, price, platform_fee, escrow_deposit, escrow_status, order_status, payment_status, payment_expire_at, deadline, note, created_at) VALUES
('ORD001', 'USR003', 'PRV001', 'SVC001', 'Thiết kế website chuẩn SEO & Tối ưu tốc độ tải trang', 4500000.00, 225000.00, 4725000.00, 'escrow_held', 'processing', 'paid', NULL, '2026-11-05 17:00:00', 'Cần tích hợp thanh toán tự động qua VietQR.', '2026-10-20 09:30:00'),
('ORD002', 'USR006', 'PRV002', 'SVC002', 'Thiết kế Logo & Bộ nhận diện thương hiệu trọn gói', 2800000.00, 140000.00, 2940000.00, 'completed', 'completed', 'paid', NULL, '2026-10-24 17:00:00', 'Phong cách tối giản hiện đại cho thương hiệu mỹ phẩm sạch.', '2026-10-18 14:15:00'),
('ORD003', 'USR004', 'PRV003', 'SVC003', 'Tối ưu hóa chiến dịch quảng cáo Facebook Ads & Google Ads', 3200000.00, 160000.00, 3360000.00, 'pending', 'pending', 'unpaid', '2026-10-27 10:00:00', '2026-11-10 17:00:00', 'Đang chờ khách hàng thanh toán ký quỹ.', '2026-10-26 10:00:00');

INSERT INTO wallet_transactions (id, user_id, order_id, type, amount, balance_after, method, status, description, created_at) VALUES
('TXN001', 'USR003', NULL, 'deposit', 5000000.00, 5000000.00, 'vietqr', 'completed', 'Nạp tiền vào ví SkillRental qua VietQR', '2026-10-20 09:00:00'),
('TXN002', 'USR003', 'ORD001', 'escrow', -4725000.00, 275000.00, 'wallet', 'completed', 'Ký quỹ đơn hàng ORD001 (Thiết kế website)', '2026-10-20 09:30:00'),
('TXN003', 'USR006', 'ORD002', 'escrow', -2940000.00, 18400000.00, 'wallet', 'completed', 'Ký quỹ đơn hàng ORD002 (Thiết kế Logo)', '2026-10-18 14:15:00'),
('TXN004', 'USR002', 'ORD002', 'order_payment', 2800000.00, 18500000.00, 'wallet', 'completed', 'Nhận tiền thanh toán giải ngân đơn hàng ORD002', '2026-10-24 18:00:00');

INSERT INTO reviews (id, order_id, customer_id, provider_id, rating, content, reply, created_at) VALUES
('REV001', 'ORD002', 'USR006', 'PRV002', 5, 'Thiết kế bộ logo rất ưng ý, hoàn thành đúng hẹn và hỗ trợ chỉnh sửa nhiệt tình!', 'Cảm ơn bạn đã tin tưởng dịch vụ của mình, chúc bạn kinh doanh hồng phát!', '2026-10-24 18:30:00');