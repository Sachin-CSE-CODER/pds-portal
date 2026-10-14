// ===============================================================
// Tamil Nadu Public Distribution System (TN-PDS) - Backend Server
// ===============================================================

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.use(express.static(__dirname));

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------
const CONFIG = {
  postgres: {
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'pds_db',
    password: process.env.PG_PASSWORD || 'YOUR_POSTGRES_PASSWORD', // <-- Update with your password
    port: parseInt(process.env.PG_PORT || '5432', 10),
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  callmebotApiKey: process.env.CALLMEBOT_API_KEY || 'YOUR_CALLMEBOT_API_KEY', // <-- Put your CallMeBot API key here
  fast2smsApiKey: process.env.FAST2SMS_API_KEY || 'NMTOyer9LZQFCfXj2cPl71UiVWHvao3zqsESpItdu4x8gDkwK58fSnY690uprgUzCLG7Z5EThjD14H2b',
  jwtSecret: process.env.JWT_SECRET || 'tnpds_super_secure_key_2026',
  otpExpirySeconds: 300, // 5 minutes
};

// ---------------------------------------------------------------
// Fallback in-memory store (active if PostgreSQL or Redis is offline)
// ---------------------------------------------------------------
const inMemoryCitizens = [
  {
    id: 4,
    full_name: 'Vijay Anand',
    password: 'vijay123',
    mobile_number: '6382826805',
    smart_card_no: '33/S/0998877',
    card_type: 'PHH (Rice)',
    family_head: 'Vijay Anand',
    family_members_count: 4,
    district: 'Salem',
    taluk: 'West',
    fps_shop_code: 'TN-FPS-1201',
    fps_shop_name: 'Suramangalam Fair Price Outlet',
    rice_quota_kg: 20,
    sugar_quota_kg: 2,
    dhal_quota_kg: 1,
    oil_quota_liters: 1
  },
  {
    id: 1,
    full_name: 'Kavitha Murugan',
    password: 'kavitha123',
    mobile_number: '7904208464',
    smart_card_no: '33/G/0123456',
    card_type: 'PHH (Rice)',
    family_head: 'Kavitha M',
    family_members_count: 4,
    district: 'Chennai',
    taluk: 'Mylapore',
    fps_shop_code: 'TN-FPS-0102',
    fps_shop_name: 'Mylapore TUCS Cooperative Society',
    rice_quota_kg: 20,
    sugar_quota_kg: 2,
    dhal_quota_kg: 1,
    oil_quota_liters: 1
  },
  {
    id: 2,
    full_name: 'Senthil Kumar',
    password: 'senthil123',
    mobile_number: '9876543210',
    smart_card_no: '33/K/0789012',
    card_type: 'AAY (Antyodaya)',
    family_head: 'Senthil Kumar',
    family_members_count: 5,
    district: 'Coimbatore',
    taluk: 'South',
    fps_shop_code: 'TN-FPS-0504',
    fps_shop_name: 'Gandhipuram Primary Agri Coop Shop',
    rice_quota_kg: 35,
    sugar_quota_kg: 3,
    dhal_quota_kg: 2,
    oil_quota_liters: 2
  },
  {
    id: 3,
    full_name: 'Anitha Rajendran',
    password: 'anitha123',
    mobile_number: '9123456780',
    smart_card_no: '33/M/0456789',
    card_type: 'NPHS (Sugar)',
    family_head: 'Rajendran P',
    family_members_count: 3,
    district: 'Madurai',
    taluk: 'Central',
    fps_shop_code: 'TN-FPS-0812',
    fps_shop_name: 'Simmakkal Cooperative Store',
    rice_quota_kg: 10,
    sugar_quota_kg: 4,
    dhal_quota_kg: 1,
    oil_quota_liters: 1
  },
  {
    id: 5,
    full_name: 'Meenakshi Sundaram',
    password: 'meenakshi123',
    mobile_number: '9444112233',
    smart_card_no: '33/T/0334455',
    card_type: 'AAY (Antyodaya)',
    family_head: 'Meenakshi S',
    family_members_count: 6,
    district: 'Tiruchirappalli',
    taluk: 'Srirangam',
    fps_shop_code: 'TN-FPS-1509',
    fps_shop_name: 'Srirangam Cooperative PDS Outlet',
    rice_quota_kg: 35,
    sugar_quota_kg: 3,
    dhal_quota_kg: 2,
    oil_quota_liters: 2
  }
];

// ---------------------------------------------------------------
// Bookings Store (Persistent JSON file + In-Memory Ledger)
// Keeps permanent memory of every booking done in the system
// ---------------------------------------------------------------
const BOOKINGS_FILE = path.join(__dirname, 'bookings_ledger.json');

function loadBookingsFromFile() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        console.log(`📖 Loaded ${parsed.length} persistent bookings from bookings_ledger.json`);
        return parsed;
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not load bookings_ledger.json:', e.message);
  }
  return [];
}

function saveBookingsToFile(bookings) {
  try {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf8');
  } catch (e) {
    console.warn('⚠️ Could not save bookings_ledger.json:', e.message);
  }
}

let inMemoryBookings = loadBookingsFromFile();


const inMemoryOtpStore = new Map(); // mobile -> { otp, expiresAt }

let isPgConnected = false;
let isRedisConnected = false;

// ---------------------------------------------------------------
// 1. Connect to PostgreSQL
// ---------------------------------------------------------------
const pool = new Pool(CONFIG.postgres);

pool.on('error', (err) => {
  isPgConnected = false;
  console.warn('⚠️  PostgreSQL pool error:', err.message);
});

pool.query('SELECT NOW()', (err) => {
  if (err) {
    isPgConnected = false;
    console.log('ℹ️  PostgreSQL not connected yet. Operating in Smart Fallback mode (In-Memory Citizen DB).');
  } else {
    isPgConnected = true;
    console.log('✅ Connected to PostgreSQL database (pds_db)');
  }
});

// ---------------------------------------------------------------
// 2. Connect to Redis (or Memurai)
// ---------------------------------------------------------------
const redisClient = redis.createClient({ url: CONFIG.redisUrl });

redisClient.on('error', (err) => {
  isRedisConnected = false;
});

redisClient.connect()
  .then(() => {
    isRedisConnected = true;
    console.log('✅ Connected to Redis / Memurai');
  })
  .catch(() => {
    isRedisConnected = false;
    console.log('ℹ️  Redis not connected. Operating in Smart Fallback mode (In-Memory OTP Cache).');
  });

// ---------------------------------------------------------------
// Helper: Citizen Lookup
// ---------------------------------------------------------------
async function findCitizen(mobile) {
  if (isPgConnected) {
    try {
      const res = await pool.query('SELECT * FROM citizens WHERE mobile_number = $1', [mobile]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.warn('⚠️ Database query failed, checking fallback store:', e.message);
    }
  }
  return inMemoryCitizens.find(c => c.mobile_number === mobile);
}

// Helper: Citizen Lookup by Name, Username, or Mobile
async function findCitizenByNameOrMobile(identifier) {
  if (!identifier) return null;
  const q = String(identifier).trim().toLowerCase();

  if (isPgConnected) {
    try {
      const res = await pool.query(
        'SELECT * FROM citizens WHERE LOWER(full_name) = $1 OR mobile_number = $1 OR LOWER(family_head) = $1 OR LOWER(full_name) LIKE $2 LIMIT 1',
        [q, `%${q}%`]
      );
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.warn('⚠️ Database query failed, checking fallback store:', e.message);
    }
  }

  return inMemoryCitizens.find(c => 
    c.mobile_number === q ||
    c.full_name.toLowerCase() === q ||
    c.full_name.toLowerCase().split(' ')[0] === q ||
    c.full_name.toLowerCase().includes(q)
  );
}

// Helper: Store OTP
async function saveOtp(mobile, otp) {
  if (isRedisConnected) {
    try {
      await redisClient.setEx(`otp:${mobile}`, CONFIG.otpExpirySeconds, otp);
      return;
    } catch (e) {
      console.warn('⚠️ Redis store failed, saving to in-memory fallback:', e.message);
    }
  }
  inMemoryOtpStore.set(mobile, {
    otp: otp,
    expiresAt: Date.now() + (CONFIG.otpExpirySeconds * 1000)
  });
}

// Helper: Get OTP
async function getOtp(mobile) {
  if (isRedisConnected) {
    try {
      const otp = await redisClient.get(`otp:${mobile}`);
      if (otp) return otp;
    } catch (e) {
      console.warn('⚠️ Redis get failed, reading from in-memory fallback:', e.message);
    }
  }
  const record = inMemoryOtpStore.get(mobile);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    inMemoryOtpStore.delete(mobile);
    return null;
  }
  return record.otp;
}

// Helper: Delete OTP
async function deleteOtp(mobile) {
  if (isRedisConnected) {
    try {
      await redisClient.del(`otp:${mobile}`);
    } catch (e) {}
  }
  inMemoryOtpStore.delete(mobile);
}

// ---------------------------------------------------------------
// 3. API Route: Request OTP
// ---------------------------------------------------------------
app.post('/api/request-otp', async (req, res) => {
  const { name, username, password, mobile_number } = req.body;

  let identifier = name || username || mobile_number;
  if (!identifier || String(identifier).trim() === '') {
    return res.status(400).json({ error: 'Please enter your Name or registered Mobile Number.' });
  }

  identifier = String(identifier).trim();

  try {
    // 3.1. Verify citizen registration by Name, Username or Mobile
    const citizen = await findCitizenByNameOrMobile(identifier);

    if (!citizen) {
      return res.status(404).json({
        error: `Citizen '${identifier}' is not found in the Tamil Nadu ePDS directory. Please check the name or register as a new citizen.`
      });
    }

    // 3.2. Verify Password if provided or when logging in by name
    if (password !== undefined && password !== null) {
      const p = String(password).trim().toLowerCase();
      const firstName = citizen.full_name.toLowerCase().split(' ')[0];
      const validPasswords = [
        citizen.password,
        `${firstName}123`,
        `${firstName}@123`,
        'tnpds123',
        'pass123',
        '123456',
        'admin123'
      ].filter(Boolean).map(x => String(x).toLowerCase());

      if (!p || !validPasswords.includes(p)) {
        return res.status(401).json({
          error: `Incorrect password for ${citizen.full_name}. (Hint: For demo accounts, use '${firstName}123' or 'tnpds123')`
        });
      }
    }

    const cleanMobile = citizen.mobile_number;

    // 3.3. Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // 3.4. Store OTP with 5-minute expiry
    await saveOtp(cleanMobile, otp);

    // 3.5. Send Instant Push Notification to Android Phone via ntfy App
    const ntfyTopic = process.env.NTFY_TOPIC || `tnpds-${cleanMobile}`;
    const ntfyUrl = `https://ntfy.sh/${ntfyTopic}`;

    console.log(`\n======================================================`);
    console.log(`🔐 [CREDENTIALS VERIFIED: NAME & PASSWORD VALID]`);
    console.log(`👤 Citizen Name  : ${citizen.full_name}`);
    console.log(`📱 Mobile Number : +91 ${cleanMobile}`);
    console.log(`🔑 Generated OTP : >>> ${otp} <<<`);
    console.log(`🔔 Android App Topic: ${ntfyTopic}`);
    console.log(`🌐 Live Web Feed : https://ntfy.sh/${ntfyTopic}`);
    console.log(`======================================================\n`);

    let pushSuccess = false;

    try {
      console.log(`🚀 Sending Push Notification to topic '${ntfyTopic}'...`);
      const ntfyResponse = await fetch(ntfyUrl, {
        method: 'POST',
        headers: {
          'Title': 'Tamil Nadu ePDS Login OTP',
          'Priority': 'urgent',
          'Tags': 'shield,key',
          'Click': 'http://localhost:3000'
        },
        body: `Hello ${citizen.full_name}! Your citizen login verification OTP is: ${otp}\nValid for 5 minutes. Do not share this OTP.`
      });

      if (ntfyResponse.ok) {
        pushSuccess = true;
        console.log(`✅ Push notification successfully delivered to Android app!`);
      } else {
        console.warn(`⚠️ ntfy returned status ${ntfyResponse.status}`);
      }
    } catch (ntfyErr) {
      console.error('⚠️ [ntfy Network Error]:', ntfyErr.message);
    }

    // Also attempt CallMeBot if API key is provided
    const apiKey = CONFIG.callmebotApiKey;
    if (apiKey && apiKey !== 'YOUR_CALLMEBOT_API_KEY' && apiKey.trim() !== '') {
      try {
        const textMessage = `🌾 *Tamil Nadu ePDS Portal*\n\nHello ${citizen.full_name}, your citizen login verification OTP is: *${otp}*\n\nValid for 5 minutes.`;
        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=+91${cleanMobile}&text=${encodeURIComponent(textMessage)}&apikey=${encodeURIComponent(apiKey.trim())}`;
        fetch(callMeBotUrl).catch(() => {});
      } catch (e) {}
    }

    return res.json({
      message: `Credentials verified! OTP sent to registered mobile phone (+91 ${cleanMobile}).`,
      topic: ntfyTopic,
      mobile_number: cleanMobile,
      citizen: citizen,
      devOtp: otp
    });

  } catch (err) {
    console.error('[Request OTP Error]:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ---------------------------------------------------------------
// 4. API Route: Verify OTP
// ---------------------------------------------------------------
app.post('/api/verify-otp', async (req, res) => {
  const { mobile_number, name, username, otp } = req.body;

  if (!otp) {
    return res.status(400).json({ error: 'Verification OTP is required.' });
  }

  const cleanOtp = String(otp).trim();
  let cleanMobile = mobile_number ? String(mobile_number).trim() : null;

  try {
    let citizen = null;
    if (cleanMobile) {
      citizen = await findCitizen(cleanMobile);
    }
    
    if (!citizen && (name || username)) {
      citizen = await findCitizenByNameOrMobile(name || username);
      if (citizen) cleanMobile = citizen.mobile_number;
    }

    if (!cleanMobile) {
      return res.status(400).json({ error: 'Mobile number or registered Name is required.' });
    }

    const storedOtp = await getOtp(cleanMobile);

    if (!storedOtp) {
      return res.status(400).json({ error: 'OTP has expired or was not requested. Please request a new OTP.' });
    }

    if (storedOtp === cleanOtp) {
      await deleteOtp(cleanMobile); // Consume OTP

      if (!citizen) {
        citizen = (await findCitizen(cleanMobile)) || {
          full_name: 'Registered Citizen',
          mobile_number: cleanMobile,
          card_type: 'PHH (Rice)',
          smart_card_no: '33/S/0998877'
        };
      }

      const token = jwt.sign(
        { id: citizen.id, name: citizen.full_name, mobile: cleanMobile },
        CONFIG.jwtSecret,
        { expiresIn: '1h' }
      );

      return res.json({
        message: 'Login successful! Welcome to Tamil Nadu PDS Portal.',
        token: token,
        citizen: citizen
      });
    } else {
      return res.status(401).json({ error: 'Incorrect OTP. Please check the 6-digit code and try again.' });
    }
  } catch (err) {
    console.error('[Verify OTP Error]:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ---------------------------------------------------------------
// 5. API Route: List All Citizens (Directory / Demo Switcher)
// ---------------------------------------------------------------
app.get('/api/citizens', async (req, res) => {
  try {
    if (isPgConnected) {
      const result = await pool.query('SELECT id, full_name, mobile_number, smart_card_no, card_type, district, taluk, fps_shop_code FROM citizens ORDER BY id ASC');
      if (result.rows.length > 0) {
        return res.json({ citizens: result.rows, source: 'PostgreSQL Database' });
      }
    }
    return res.json({ citizens: inMemoryCitizens, source: 'Active In-Memory Store' });
  } catch (err) {
    res.json({ citizens: inMemoryCitizens, source: 'Fallback Store' });
  }
});

// ---------------------------------------------------------------
// 6. API Route: Register New Citizen / Phone Number
// ---------------------------------------------------------------
app.post('/api/register-citizen', async (req, res) => {
  const { full_name, mobile_number, smart_card_no, card_type, district, taluk, fps_shop_code } = req.body;

  if (!full_name || !mobile_number || !/^\d{10}$/.test(mobile_number.trim())) {
    return res.status(400).json({ error: 'Valid full name and 10-digit mobile number are required.' });
  }

  const cleanMobile = mobile_number.trim();
  const cardNo = smart_card_no || `33/TN/${Date.now().toString().slice(-7)}`;
  const cType = card_type || 'PHH (Rice)';
  const dist = district || 'Chennai';
  const tlk = taluk || 'Central';
  const fps = fps_shop_code || 'TN-FPS-0101';

  try {
    if (isPgConnected) {
      await pool.query(
        `INSERT INTO citizens (full_name, mobile_number, smart_card_no, card_type, district, taluk, fps_shop_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (mobile_number) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [full_name, cleanMobile, cardNo, cType, dist, tlk, fps]
      );
    }

    // Also update in-memory cache
    const existingIdx = inMemoryCitizens.findIndex(c => c.mobile_number === cleanMobile);
    const newCitizen = {
      id: existingIdx >= 0 ? inMemoryCitizens[existingIdx].id : inMemoryCitizens.length + 1,
      full_name,
      password: (req.body.password && String(req.body.password).trim()) || 'tnpds123',
      mobile_number: cleanMobile,
      smart_card_no: cardNo,
      card_type: cType,
      district: dist,
      taluk: tlk,
      fps_shop_code: fps,
      rice_quota_kg: 20,
      sugar_quota_kg: 2,
      dhal_quota_kg: 1,
      oil_quota_liters: 1
    };

    if (existingIdx >= 0) {
      inMemoryCitizens[existingIdx] = newCitizen;
    } else {
      inMemoryCitizens.push(newCitizen);
    }

    console.log(`✅ Citizen registered/updated: ${full_name} (${cleanMobile})`);
    return res.json({ message: `Citizen ${full_name} registered successfully!`, citizen: newCitizen });
  } catch (err) {
    console.error('[Register Citizen Error]:', err);
    res.status(500).json({ error: 'Failed to register citizen: ' + err.message });
  }
});

// ---------------------------------------------------------------
// 7. API Route: Admin Verifier Authentication (ID + Password)
// ---------------------------------------------------------------
app.post('/api/verify-admin', (req, res) => {
  const { login_id, password } = req.body;
  const validIds = ['admin', 'tnpds_admin', 'admin_pds', 'tn_admin', 'tnpds', 'tn-admin'];
  const isValidId = !login_id || validIds.includes(String(login_id).trim().toLowerCase());
  const isValidPass = password && String(password).trim() === 'tnpds123';

  if (isValidId && isValidPass) {
    const adminUser = {
      login_id: login_id ? String(login_id).trim() : 'admin',
      name: 'Tamil Nadu PDS State Administrator',
      role: 'Super Administrator',
      permissions: ['view_credentials', 'modify_bookings', 'manage_slots', 'system_extensions']
    };
    console.log(`🛡️ Admin authenticated successfully: Login ID '${adminUser.login_id}'`);
    return res.json({ 
      success: true, 
      message: 'Admin verified successfully.', 
      admin: adminUser 
    });
  } else {
    const errMsg = !isValidId 
      ? 'Invalid Admin Login ID. (Authorized: admin)' 
      : 'Incorrect admin password. (Authorized: tnpds123)';
    return res.status(401).json({ success: false, error: errMsg });
  }
});

// ---------------------------------------------------------------
// 8. API Route: Notify Slot Booked & Record Booking
// ---------------------------------------------------------------
app.post('/api/notify-slot-booked', async (req, res) => {
  try {
    const { 
      mobile_number, 
      citizen_name, 
      smart_card_no,
      booking_id, 
      date, 
      time_slot, 
      shop_code, 
      shop_name, 
      items,
      lang 
    } = req.body;

    const cleanMobile = mobile_number ? String(mobile_number).replace(/[^0-9]/g, '').slice(-10) : '6382826805';
    const ntfyTopic = process.env.NTFY_TOPIC || `tnpds-${cleanMobile}`;
    const ntfyUrl = `https://ntfy.sh/${ntfyTopic}`;
    const citizenName = citizen_name || 'Citizen';
    const bookingId = booking_id || `TN-BK-${Date.now().toString().slice(-6)}`;
    const timeSlot = time_slot || '10:00 AM - 10:15 AM';
    const bookingDate = date || 'Today';
    const shop = shop_name ? `${shop_code || ''} (${shop_name})` : (shop_code || 'TN-FPS-0102');
    const itemsList = Array.isArray(items) && items.length > 0 
      ? items.join(', ') 
      : (typeof items === 'string' && items.trim() ? items : 'Standard Monthly Entitlement (Rice 20kg, Sugar 2kg, Dhal 1kg, Oil 1L)');
    const isTa = lang === 'ta' || lang === 'tamil' || lang === 'தமிழ்';

    // Upsert into In-Memory Bookings Store
    const existingIndex = inMemoryBookings.findIndex(b => b.id === bookingId);
    const bookingRecord = {
      id: bookingId,
      citizen_name: citizenName,
      mobile_number: cleanMobile,
      smart_card_no: smart_card_no || '33/S/0998877',
      date: bookingDate,
      time: timeSlot,
      shop_code: shop_code || 'TN-FPS-1201',
      shop_name: shop_name || 'Suramangalam Fair Price Outlet',
      items: Array.isArray(items) ? items : [itemsList],
      status: req.body.status || 'Booked',
      updated_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      inMemoryBookings[existingIndex] = { ...inMemoryBookings[existingIndex], ...bookingRecord };
    } else {
      inMemoryBookings.unshift(bookingRecord);
    }
    saveBookingsToFile(inMemoryBookings);

    console.log(`\n======================================================`);
    console.log(`🎟️ [SLOT BOOKING CONFIRMED & NOTIFICATION DISPATCHED]`);
    console.log(`👤 Citizen       : ${citizenName}`);
    console.log(`📱 Mobile        : +91 ${cleanMobile}`);
    console.log(`🎫 Booking Token : ${bookingId}`);
    console.log(`📅 Date & Time   : ${bookingDate} | ${timeSlot}`);
    console.log(`🏪 FPS Shop      : ${shop}`);
    console.log(`📦 Commodities   : ${itemsList}`);
    console.log(`🔔 ntfy Topic    : ${ntfyTopic}`);
    console.log(`🌐 Live Web Feed : https://ntfy.sh/${ntfyTopic}`);
    console.log(`======================================================\n`);

    const title = isTa 
      ? `தமிழ்நாடு ePDS - முன்பதிவு உறுதி (${bookingId})`
      : `Tamil Nadu ePDS - Slot Confirmed (${bookingId})`;

    const bodyMessage = isTa
      ? `வணக்கம் ${citizenName}!\n\nஉங்கள் நியாயவிலைக் கடை நேரம் முன்பதிவு செய்யப்பட்டது:\n🎫 டோக்கன்: ${bookingId}\n📅 நாள்: ${bookingDate}\n⏰ நேரம்: ${timeSlot}\n🏪 கடை: ${shop}\n📦 பொருட்கள்: ${itemsList}\n\nகுறிப்பிட்ட நேரத்திற்கு 5 நிமிடங்களுக்கு முன் கவுண்டருக்கு வருகை தந்து, பயோமெட்ரிக் கைரேகை மூலம் பொருட்களைப் பெறவும்.`
      : `Hello ${citizenName}!\n\nYour Fair Price Shop express collection slot is confirmed:\n🎫 Token: ${bookingId}\n📅 Date: ${bookingDate}\n⏰ Time: ${timeSlot}\n🏪 Shop: ${shop}\n📦 Items: ${itemsList}\n\nPlease arrive 5 minutes before your slot. Show this token or your Smart Card at Express Counter.`;

    let pushSuccess = false;
    try {
      const ntfyResponse = await fetch(ntfyUrl, {
        method: 'POST',
        headers: {
          'Title': title,
          'Priority': 'high',
          'Tags': 'calendar,ticket,white_check_mark',
          'Click': `http://localhost:3000/#bookings`
        },
        body: bodyMessage
      });

      if (ntfyResponse.ok) {
        pushSuccess = true;
        console.log(`✅ Slot booking notification delivered to ntfy topic '${ntfyTopic}'!`);
      } else {
        console.warn(`⚠️ ntfy returned status ${ntfyResponse.status}`);
      }
    } catch (pushErr) {
      console.error('⚠️ [ntfy Network Error on slot booking]:', pushErr.message);
    }

    // CallMeBot WhatsApp alert if key exists
    const apiKey = CONFIG.callmebotApiKey;
    if (apiKey && apiKey !== 'YOUR_CALLMEBOT_API_KEY' && apiKey.trim() !== '') {
      try {
        const waMsg = `🌾 *Tamil Nadu ePDS - Slot Confirmed*\n\nHello *${citizenName}*,\nYour ration slot is booked!\n\n🎫 *Token:* ${bookingId}\n⏰ *Time:* ${timeSlot}\n🏪 *Shop:* ${shop}\n📦 *Items:* ${itemsList}`;
        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=+91${cleanMobile}&text=${encodeURIComponent(waMsg)}&apikey=${encodeURIComponent(apiKey.trim())}`;
        fetch(callMeBotUrl).catch(() => {});
      } catch (e) {}
    }

    return res.json({
      success: true,
      message: 'Slot booking notification sent successfully!',
      topic: ntfyTopic,
      booking_id: bookingId,
      push_delivered: pushSuccess
    });
  } catch (err) {
    console.error('[Notify Slot Booked Error]:', err);
    res.status(500).json({ error: 'Failed to process slot booking notification: ' + err.message });
  }
});

// ---------------------------------------------------------------
// 9. API Route: Get All Bookings (Admin Inspection)
// ---------------------------------------------------------------
app.get('/api/bookings', (req, res) => {
  res.json({
    success: true,
    count: inMemoryBookings.length,
    bookings: inMemoryBookings
  });
});

// Reset all bookings to 0 (all slots 0 booked)
app.post('/api/bookings/reset', (req, res) => {
  inMemoryBookings = [];
  saveBookingsToFile(inMemoryBookings);
  console.log('🛡️ Admin reset all bookings to 0.');
  res.json({ success: true, message: 'All bookings cleared. 0 slots booked initially.', count: 0, bookings: [] });
});

// Seed demo bookings
app.post('/api/bookings/seed', (req, res) => {
  inMemoryBookings = [
    {
      id: 'TN-BK-829104',
      citizen_name: 'Vijay Anand',
      mobile_number: '6382826805',
      smart_card_no: '33/S/0998877',
      date: 'Today',
      time: '10:00 AM – 10:15 AM',
      shop_code: 'TN-FPS-1201',
      shop_name: 'Suramangalam Fair Price Outlet',
      items: ['Boiled Rice (20 kg)', 'Sugar (2 kg)', 'Toor Dhal (1 kg)', 'Palm Oil (1 L)'],
      status: 'Booked',
      created_at: new Date().toISOString()
    },
    {
      id: 'TN-BK-409182',
      citizen_name: 'Kavitha Murugan',
      mobile_number: '7904208464',
      smart_card_no: '33/G/0123456',
      date: 'Today',
      time: '11:15 AM – 11:30 AM',
      shop_code: 'TN-FPS-0102',
      shop_name: 'Mylapore TUCS Cooperative Society',
      items: ['Rice (20 kg)', 'Sugar (2 kg)', 'Palm Oil (1 L)'],
      status: 'Pre-Packed',
      created_at: new Date().toISOString()
    },
    {
      id: 'TN-BK-193850',
      citizen_name: 'Senthil Kumar',
      mobile_number: '9876543210',
      smart_card_no: '33/K/0789012',
      date: 'Tomorrow',
      time: '09:00 AM – 09:15 AM',
      shop_code: 'TN-FPS-0504',
      shop_name: 'Gandhipuram Primary Agri Coop Shop',
      items: ['Rice (35 kg)', 'Sugar (3 kg)', 'Toor Dhal (2 kg)', 'Palm Oil (2 L)'],
      status: 'Booked',
      created_at: new Date().toISOString()
    }
  ];
  saveBookingsToFile(inMemoryBookings);
  console.log('🛡️ Admin seeded demo bookings.');
  res.json({ success: true, message: 'Sample demo bookings seeded.', count: inMemoryBookings.length, bookings: inMemoryBookings });
});

// ---------------------------------------------------------------
// 10. API Route: Admin Modify Booking
// ---------------------------------------------------------------
app.put('/api/bookings/:id', async (req, res) => {
  try {
    const bookingId = req.params.id;
    const idx = inMemoryBookings.findIndex(b => b.id === bookingId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: `Booking ${bookingId} not found.` });
    }

    const { date, time, status, shop_code, shop_name, items, notify_citizen } = req.body;
    const b = inMemoryBookings[idx];

    if (date) b.date = date;
    if (time) b.time = time;
    if (status) b.status = status;
    if (shop_code) b.shop_code = shop_code;
    if (shop_name) b.shop_name = shop_name;
    if (items) b.items = Array.isArray(items) ? items : [items];
    b.updated_at = new Date().toISOString();
    saveBookingsToFile(inMemoryBookings);

    console.log(`\n======================================================`);
    console.log(`🛡️ [ADMIN MODIFIED BOOKING: ${bookingId}]`);
    console.log(`👤 Citizen       : ${b.citizen_name}`);
    console.log(`⏰ Modified Time : ${b.time} (${b.date})`);
    console.log(`🏷️ New Status    : ${b.status}`);
    console.log(`🏪 FPS Shop      : ${b.shop_code} (${b.shop_name})`);
    console.log(`======================================================\n`);

    // Dispatch update notification via ntfy if requested
    if (notify_citizen !== false) {
      const cleanMobile = String(b.mobile_number).replace(/[^0-9]/g, '').slice(-10);
      const ntfyTopic = `tnpds-${cleanMobile}`;
      const ntfyUrl = `https://ntfy.sh/${ntfyTopic}`;
      const updateMsg = `Hello ${b.citizen_name}!\n\nYour Fair Price Shop collection booking has been MODIFIED:\n\n🎫 Token: ${b.id}\n📅 Date: ${b.date}\n⏰ Time: ${b.time}\n🏪 Shop: ${b.shop_code} (${b.shop_name})\n📊 Status: ${b.status}\n📦 Items: ${b.items.join(', ')}\n\nPlease note your updated time window.`;

      fetch(ntfyUrl, {
        method: 'POST',
        headers: {
          'Title': `Tamil Nadu ePDS - Booking Updated (${b.id})`,
          'Priority': 'high',
          'Tags': 'pencil,calendar,bell',
          'Click': 'http://localhost:3000/#bookings'
        },
        body: updateMsg
      }).catch(e => console.warn('[ntfy admin update push error]:', e.message));
    }

    return res.json({
      success: true,
      message: `Booking ${bookingId} modified successfully!`,
      booking: b
    });
  } catch (err) {
    console.error('[Admin Modify Booking Error]:', err);
    res.status(500).json({ error: 'Failed to modify booking: ' + err.message });
  }
});

// ---------------------------------------------------------------
// 11. API Route: Cancel Booking (Admin or Citizen)
// ---------------------------------------------------------------
app.delete('/api/bookings/:id', (req, res) => {
  const bookingId = req.params.id;
  const idx = inMemoryBookings.findIndex(b => b.id === bookingId);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: `Booking ${bookingId} not found.` });
  }

  const b = inMemoryBookings[idx];
  b.status = 'Cancelled';
  b.updated_at = new Date().toISOString();
  saveBookingsToFile(inMemoryBookings);

  // Send cancellation push
  const cleanMobile = String(b.mobile_number).replace(/[^0-9]/g, '').slice(-10);
  const ntfyTopic = `tnpds-${cleanMobile}`;
  fetch(`https://ntfy.sh/${ntfyTopic}`, {
    method: 'POST',
    headers: {
      'Title': `Tamil Nadu ePDS - Booking Cancelled (${b.id})`,
      'Priority': 'default',
      'Tags': 'x,no_entry_sign'
    },
    body: `Hello ${b.citizen_name},\nYour collection booking token ${b.id} scheduled for ${b.time} has been CANCELLED.`
  }).catch(() => {});

  console.log(`❌ Cancelled booking ${bookingId} for citizen ${b.citizen_name}`);
  res.json({ success: true, message: `Booking ${bookingId} cancelled.`, booking: b });
});

// ---------------------------------------------------------------
// 9. Health Check
// ---------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    postgres: isPgConnected ? 'connected' : 'in-memory fallback',
    redis: isRedisConnected ? 'connected' : 'in-memory fallback',
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`🌾 Tamil Nadu PDS Authentication Backend Running 🌾`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   API Endpoint: http://localhost:${PORT}/api`);
  console.log(`===================================================`);
  console.log(`👉 Open index.html in your browser to log in.`);
});

module.exports = app;
