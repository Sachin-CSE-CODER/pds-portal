-- ===============================================================
-- Tamil Nadu Public Distribution System (TN-PDS) Database Schema
-- Database: pds_db
-- ===============================================================

-- 1. Create Comprehensive Citizens Table
CREATE TABLE IF NOT EXISTS citizens (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    mobile_number VARCHAR(15) UNIQUE NOT NULL,
    smart_card_no VARCHAR(30) UNIQUE NOT NULL,
    card_type VARCHAR(30) NOT NULL,            -- 'PHH (Rice)', 'AAY (Antyodaya)', 'NPHS (Sugar)'
    family_head VARCHAR(100),
    family_members_count INT DEFAULT 4,
    district VARCHAR(50) NOT NULL,
    taluk VARCHAR(50) NOT NULL,
    fps_shop_code VARCHAR(30) NOT NULL,        -- Fair Price Shop (Ration Shop) Code
    fps_shop_name VARCHAR(100),
    rice_quota_kg INT DEFAULT 20,              -- Monthly entitlement
    sugar_quota_kg INT DEFAULT 2,
    dhal_quota_kg INT DEFAULT 1,
    oil_quota_liters INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insert Multiple Realistic Citizens Across Tamil Nadu

-- User 1: Primary Test User (Your Phone Number)
INSERT INTO citizens (
    full_name, mobile_number, smart_card_no, card_type, 
    family_head, family_members_count, district, taluk, 
    fps_shop_code, fps_shop_name, rice_quota_kg, sugar_quota_kg, dhal_quota_kg, oil_quota_liters
) VALUES (
    'Kavitha Murugan', '7904208464', '33/G/0123456', 'PHH (Rice)', 
    'Kavitha M', 4, 'Chennai', 'Mylapore', 
    'TN-FPS-0102', 'Mylapore TUCS Cooperative Society', 20, 2, 1, 1
) ON CONFLICT (mobile_number) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    smart_card_no = EXCLUDED.smart_card_no,
    card_type = EXCLUDED.card_type;

-- User 2: Coimbatore AAY Card Holder (Antyodaya Anna Yojana - Subsidized)
INSERT INTO citizens (
    full_name, mobile_number, smart_card_no, card_type, 
    family_head, family_members_count, district, taluk, 
    fps_shop_code, fps_shop_name, rice_quota_kg, sugar_quota_kg, dhal_quota_kg, oil_quota_liters
) VALUES (
    'Senthil Kumar', '9876543210', '33/K/0789012', 'AAY (Antyodaya)', 
    'Senthil Kumar', 5, 'Coimbatore', 'South', 
    'TN-FPS-0504', 'Gandhipuram Primary Agri Coop Shop', 35, 3, 2, 2
) ON CONFLICT (mobile_number) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    smart_card_no = EXCLUDED.smart_card_no,
    card_type = EXCLUDED.card_type;

-- User 3: Madurai NPHS Card Holder (Non-Priority Household - Sugar)
INSERT INTO citizens (
    full_name, mobile_number, smart_card_no, card_type, 
    family_head, family_members_count, district, taluk, 
    fps_shop_code, fps_shop_name, rice_quota_kg, sugar_quota_kg, dhal_quota_kg, oil_quota_liters
) VALUES (
    'Anitha Rajendran', '9123456780', '33/M/0456789', 'NPHS (Sugar)', 
    'Rajendran P', 3, 'Madurai', 'Central', 
    'TN-FPS-0812', 'Simmakkal Cooperative Store', 10, 4, 1, 1
) ON CONFLICT (mobile_number) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    smart_card_no = EXCLUDED.smart_card_no,
    card_type = EXCLUDED.card_type;

-- User 4: Salem PHH Card Holder
INSERT INTO citizens (
    full_name, mobile_number, smart_card_no, card_type, 
    family_head, family_members_count, district, taluk, 
    fps_shop_code, fps_shop_name, rice_quota_kg, sugar_quota_kg, dhal_quota_kg, oil_quota_liters
) VALUES (
    'Vijay Anand', '6382826805', '33/S/0998877', 'PHH (Rice)', 
    'Vijay Anand', 4, 'Salem', 'West', 
    'TN-FPS-1201', 'Suramangalam Fair Price Outlet', 20, 2, 1, 1
) ON CONFLICT (mobile_number) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    smart_card_no = EXCLUDED.smart_card_no,
    card_type = EXCLUDED.card_type;

-- User 5: Tiruchirappalli AAY Card Holder
INSERT INTO citizens (
    full_name, mobile_number, smart_card_no, card_type, 
    family_head, family_members_count, district, taluk, 
    fps_shop_code, fps_shop_name, rice_quota_kg, sugar_quota_kg, dhal_quota_kg, oil_quota_liters
) VALUES (
    'Meenakshi Sundaram', '9444112233', '33/T/0334455', 'AAY (Antyodaya)', 
    'Meenakshi S', 6, 'Tiruchirappalli', 'Srirangam', 
    'TN-FPS-1509', 'Srirangam Cooperative PDS Outlet', 35, 3, 2, 2
) ON CONFLICT (mobile_number) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    smart_card_no = EXCLUDED.smart_card_no,
    card_type = EXCLUDED.card_type;

-- ===============================================================
-- 💡 How to add any new phone number / citizen:
-- INSERT INTO citizens (full_name, mobile_number, smart_card_no, card_type, district, taluk, fps_shop_code)
-- VALUES ('Your Friend Name', 'NEW_10_DIGIT_PHONE', '33/G/9999999', 'PHH (Rice)', 'Chennai', 'Guindy', 'TN-FPS-0105');
-- ===============================================================
