// ===============================================================
// Tamil Nadu Public Distribution System (TN-PDS) - Backend Server
// ===============================================================

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
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
    id: 1,
    full_name: 'Kavitha Murugan',
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
    id: 4,
    full_name: 'Vijay Anand',
    mobile_number: '8899001122',
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
    id: 5,
    full_name: 'Meenakshi Sundaram',
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
  const { mobile_number } = req.body;

  if (!mobile_number || !/^\d{10}$/.test(mobile_number.trim())) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }

  const cleanMobile = mobile_number.trim();

  try {
    // 3.1. Verify citizen registration
    const citizen = await findCitizen(cleanMobile);

    if (!citizen) {
      return res.status(404).json({
        error: `Mobile number ${cleanMobile} is not registered in the Tamil Nadu PDS database. Please register at your Taluk Supply Office (TSO) or add it in PostgreSQL/server.js.`
      });
    }

    // 3.2. Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // 3.3. Store OTP with 5-minute expiry
    await saveOtp(cleanMobile, otp);

    // 3.4. Send Instant Push Notification to Android Phone via ntfy App
    const ntfyTopic = process.env.NTFY_TOPIC || `tnpds-${cleanMobile}`;
    const ntfyUrl = `https://ntfy.sh/${ntfyTopic}`;

    console.log(`\n======================================================`);
    console.log(`📲 [DISPATCHING OTP TO ANDROID PHONE]`);
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
        body: `Your citizen login OTP is: ${otp}\nValid for 5 minutes. Do not share this OTP.`
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
        const textMessage = `🌾 *Tamil Nadu ePDS Portal*\n\nYour citizen login OTP is: *${otp}*\n\nValid for 5 minutes.`;
        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=+91${cleanMobile}&text=${encodeURIComponent(textMessage)}&apikey=${encodeURIComponent(apiKey.trim())}`;
        fetch(callMeBotUrl).catch(() => {});
      } catch (e) {}
    }

    return res.json({
      message: `OTP sent to your Android phone! (Topic: ${ntfyTopic})`,
      topic: ntfyTopic,
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
  const { mobile_number, otp } = req.body;

  if (!mobile_number || !otp) {
    return res.status(400).json({ error: 'Mobile number and OTP are required.' });
  }

  const cleanMobile = mobile_number.trim();
  const cleanOtp = otp.trim();

  try {
    const storedOtp = await getOtp(cleanMobile);

    if (!storedOtp) {
      return res.status(400).json({ error: 'OTP has expired or was not requested. Please request a new OTP.' });
    }

    if (storedOtp === cleanOtp) {
      await deleteOtp(cleanMobile); // Consume OTP

      const citizen = (await findCitizen(cleanMobile)) || {
        full_name: 'Registered Citizen',
        mobile_number: cleanMobile,
        card_type: 'PHH (Rice)',
        smart_card_no: '33/G/0123456'
      };

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
      id: inMemoryCitizens.length + 1,
      full_name,
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
// 7. Health Check
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
