# 🌾 Tamil Nadu Public Distribution System (TN-ePDS) Portal
## Phase 1 to Phase 7: OTP Authentication Setup Guide

This project implements a secure, personalized OTP-based login system for the Tamil Nadu Public Distribution System (TN-PDS) using **Node.js, Express, PostgreSQL, Redis (or Memurai on Windows), and Fast2SMS**.

---

## 📁 Project Structure

```
pds-portal/
├── index.html       # Citizen frontend with TN-PDS branding & OTP verification UI
├── server.js        # Express backend (PostgreSQL check + Redis TTL OTP + Fast2SMS dispatch)
├── schema.sql       # PostgreSQL schema to initialize pds_db and citizens table
├── package.json     # Node.js dependencies
├── .env.example     # Environment variable template for credentials
└── README.md        # Step-by-step setup and execution instructions
```

---

## 🚀 Quick Setup & Execution Walkthrough

### 1. Install Dependencies
Open your terminal in this `pds-portal` directory and run:
```bash
npm install
```

### 2. Configure Credentials
Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```
Open `.env` and fill in:
- `PG_PASSWORD`: Your PostgreSQL master password created during installation.
- `FAST2SMS_API_KEY`: Your authorization key from [Fast2SMS Dev API](https://www.fast2sms.com/).

*(Alternatively, you can update the constants directly near the top of `server.js`)*.

---

### 3. Set Up PostgreSQL (`pds_db`)
1. Open **pgAdmin 4** and connect using your master password.
2. In the left panel, right-click **Databases** $\rightarrow$ **Create** $\rightarrow$ **Database...**
3. Set the name as `pds_db` and click **Save**.
4. Right-click `pds_db` $\rightarrow$ select **Query Tool**.
5. Open or copy the contents of `schema.sql`, replace `'9876543210'` with your actual 10-digit mobile number, and press **F5** (or the Play button).

```sql
INSERT INTO citizens (full_name, mobile_number, smart_card_no, card_type) 
VALUES ('Student Name', 'YOUR_10_DIGIT_PHONE_NUMBER', '33/G/0123456', 'PHH');
```

---

### 4. Ensure Redis is Running
- **Windows**: If using **Memurai**, it runs automatically as a Windows background service. You can verify it in Windows Services (`services.msc` -> check "Memurai").
- **WSL / Linux / Mac**: Start Redis with `redis-server`.

---

### 5. Start the Backend Server
In your terminal, start the server:
```bash
node server.js
```
You should see:
```text
===================================================
🌾 Tamil Nadu PDS Authentication Backend Running 🌾
   URL: http://localhost:3000
   API Endpoint: http://localhost:3000/api
===================================================
✅ Connected to PostgreSQL database (pds_db)
✅ Connected to Redis
```

---

### 6. Test in Browser
1. Double-click `index.html` to open it in Google Chrome or any browser.
2. Enter your registered 10-digit mobile number and click **Get OTP via SMS**.
3. Check your physical phone for the SMS from Fast2SMS.
   *(Note: If you haven't added a Fast2SMS key yet, the server runs in Dev Mode and displays the OTP in both the terminal and as an autofill button on the web page for instant testing!)*
4. Enter the 6-digit OTP and click **Verify & Login**.
5. You will see the authenticated **Tamil Nadu Smart Ration Card** preview card with a JWT session token generated!
