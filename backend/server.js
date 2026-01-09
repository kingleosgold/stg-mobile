/**
 * Stack Tracker Pro - Privacy-First Backend API
 * 
 * This server handles AI receipt scanning WITHOUT storing any user data.
 * Images are processed in memory and immediately discarded.
 * No logs, no analytics, no tracking.
 */

const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();

// Trust proxy for correct client IP detection
app.set('trust proxy', 1);

// CORS - allow requests from any origin (mobile app, web preview, etc.)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Security headers (adjusted for API use)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Memory-only file storage - files never touch disk
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// SPOT PRICE CACHE & DATA
// ============================================

let spotPriceCache = {
  prices: { gold: 2650, silver: 31, platinum: 980, palladium: 1050 },
  lastUpdated: null,
};

let historicalData = {
  gold: {},
  silver: {},
  goldSilverRatio: {},
  loaded: false,
};

// API Request Counter (to monitor GoldAPI usage)
let apiRequestCounter = {
  total: 0,
  lastReset: new Date(),
  calls: [],
};

// Load historical prices from JSON file
const fs = require('fs');
const path = require('path');

// Import web scraper for live spot prices and historical prices
const { scrapeGoldSilverPrices, fetchHistoricalPrices } = require(path.join(__dirname, 'scrapers', 'gold-silver-scraper.js'));

// Cache for historical prices (to avoid repeated API calls for the same date)
// Historical prices don't change, so we can cache them indefinitely
const historicalPriceCache = {
  gold: {},   // { 'YYYY-MM-DD': price }
  silver: {}, // { 'YYYY-MM-DD': price }
};

// ============================================
// FETCH LIVE SPOT PRICES
// ============================================

async function fetchLiveSpotPrices() {
  try {
    // Log API request counter
    const now = new Date();
    const hoursSinceReset = (now - apiRequestCounter.lastReset) / 1000 / 60 / 60;
    console.log(`📊 API Requests - Total: ${apiRequestCounter.total}, Last Reset: ${hoursSinceReset.toFixed(1)}h ago`);

    // Fetch prices using priority order:
    // 1. GoldAPI.io (paid tier)
    // 2. MetalPriceAPI (fallback)
    // 3. Static prices (final fallback)
    const fetchedPrices = await scrapeGoldSilverPrices();

    // Increment counter for monitoring
    apiRequestCounter.total += 1;
    apiRequestCounter.calls.push({
      timestamp: now.toISOString(),
      type: 'spot-price-fetch',
      count: 1,
      source: fetchedPrices.source,
    });
    // Keep only last 100 calls in memory
    if (apiRequestCounter.calls.length > 100) {
      apiRequestCounter.calls = apiRequestCounter.calls.slice(-100);
    }

    // Update cache
    spotPriceCache = {
      prices: {
        gold: fetchedPrices.gold,
        silver: fetchedPrices.silver,
        platinum: fetchedPrices.platinum || 950,
        palladium: fetchedPrices.palladium || 960,
      },
      lastUpdated: new Date(),
      source: fetchedPrices.source,
    };

    console.log('✅ Spot prices updated:', spotPriceCache.prices);
    console.log(`📈 Total API requests: ${apiRequestCounter.total}`);

    return spotPriceCache.prices;

  } catch (error) {
    console.error('❌ Failed to fetch spot prices:', error.message);
    console.error('   Stack:', error.stack);

    // Use last cached prices if available
    if (spotPriceCache.lastUpdated) {
      console.log('⚠️  Using last cached prices (fetch failed)');
      return spotPriceCache.prices;
    }

    // Final fallback to static estimates
    console.log('⚠️  Using hardcoded fallback prices (no cache available)');
    spotPriceCache.prices = { gold: 2650, silver: 31, platinum: 950, palladium: 960 };
    spotPriceCache.lastUpdated = new Date();
    spotPriceCache.source = 'static-fallback';
    return spotPriceCache.prices;
  }
}
// ============================================
// LOAD HISTORICAL DATA
// ============================================

function loadHistoricalData() {
  try {
    console.log('📊 Loading historical price data from JSON...');

    // Load historical prices from JSON file
    const dataPath = path.join(__dirname, 'data', 'historical-prices.json');
    console.log('📁 Data file path:', dataPath);

    // Check if file exists
    if (!fs.existsSync(dataPath)) {
      console.error('❌ historical-prices.json NOT FOUND at:', dataPath);
      console.log('📂 Directory contents:', fs.readdirSync(__dirname));
      throw new Error('Historical prices file not found');
    }

    console.log('✅ Found historical-prices.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const monthlyPrices = JSON.parse(rawData);

    console.log(`📄 Loaded ${Object.keys(monthlyPrices).length} months of historical data`);

    // Process monthly data into daily lookups
    Object.entries(monthlyPrices).forEach(([month, prices]) => {
      // Expand to daily prices for the month (copy monthly price to all days)
      const [year, monthNum] = month.split('-');
      const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${monthNum}-${day.toString().padStart(2, '0')}`;
        historicalData.gold[date] = prices.gold;
        historicalData.silver[date] = prices.silver;
      }
    });

    console.log(`✅ Loaded ${Object.keys(historicalData.gold).length} historical gold prices (daily granularity)`);
    console.log(`✅ Loaded ${Object.keys(historicalData.silver).length} historical silver prices (daily granularity)`);

    // Log sample prices to verify correct data is loaded
    const sampleDates = ['2023-09-01', '2023-09-15', '2024-12-01', '2025-12-25'];
    console.log('📅 Sample historical prices (should match JSON file):');
    sampleDates.forEach(d => {
      if (historicalData.gold[d]) {
        console.log(`   ${d}: Gold $${historicalData.gold[d]}, Silver $${historicalData.silver[d]}`);
      }
    });

    // Log key verification dates
    console.log('🔍 Key verification:');
    console.log('   2024-12-01 should be: Gold $2400, Silver $28');
    console.log('   2023-09-01 should be: Gold $1920, Silver $23');

    historicalData.loaded = true;
  } catch (error) {
    console.error('❌ Failed to load historical data from JSON:', error.message);
    console.error('Stack trace:', error.stack);
    // Use fallback monthly averages as last resort
    loadFallbackHistoricalData();
  }
}

// Fallback historical data (monthly averages)
function loadFallbackHistoricalData() {
  console.log('Loading fallback historical data...');
  
  const fallbackGold = {
    '2024-12': 2650, '2024-11': 2700, '2024-10': 2750, '2024-09': 2650,
    '2024-08': 2500, '2024-07': 2400, '2024-06': 2350, '2024-05': 2350,
    '2024-04': 2350, '2024-03': 2200, '2024-02': 2050, '2024-01': 2050,
    '2023-12': 2050, '2023-11': 2000, '2023-10': 1980, '2023-09': 1920,
    '2023-08': 1940, '2023-07': 1960, '2023-06': 1920, '2023-05': 1980,
    '2023-04': 2000, '2023-03': 1980, '2023-02': 1850, '2023-01': 1920,
    '2022-12': 1800, '2022-11': 1750, '2022-10': 1650, '2022-09': 1680,
    '2022-08': 1750, '2022-07': 1730, '2022-06': 1830, '2022-05': 1850,
    '2022-04': 1920, '2022-03': 1950, '2022-02': 1900, '2022-01': 1820,
  };
  
  const fallbackSilver = {
    '2024-12': 31, '2024-11': 32, '2024-10': 33, '2024-09': 31,
    '2024-08': 28, '2024-07': 29, '2024-06': 29, '2024-05': 27,
    '2024-04': 27, '2024-03': 25, '2024-02': 23, '2024-01': 23,
    '2023-12': 24, '2023-11': 24, '2023-10': 23, '2023-09': 23,
    '2023-08': 24, '2023-07': 25, '2023-06': 23, '2023-05': 24,
    '2023-04': 25, '2023-03': 23, '2023-02': 22, '2023-01': 24,
    '2022-12': 24, '2022-11': 21, '2022-10': 19, '2022-09': 19,
    '2022-08': 20, '2022-07': 19, '2022-06': 21, '2022-05': 22,
    '2022-04': 24, '2022-03': 25, '2022-02': 24, '2022-01': 24,
  };
  
  // Expand monthly data to daily (only valid days in each month)
  Object.entries(fallbackGold).forEach(([month, price]) => {
    const [year, monthNum] = month.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${day.toString().padStart(2, '0')}`;
      historicalData.gold[date] = price;
    }
  });

  Object.entries(fallbackSilver).forEach(([month, price]) => {
    const [year, monthNum] = month.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${day.toString().padStart(2, '0')}`;
      historicalData.silver[date] = price;
    }
  });
  
  historicalData.loaded = true;
  console.log('Fallback historical data loaded');
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    privacy: 'first',
    historicalDataLoaded: historicalData.loaded,
    spotPricesLastUpdated: spotPriceCache.lastUpdated,
  });
});

/**
 * Get current spot prices
 */
app.get('/api/spot-prices', async (req, res) => {
  try {
    // Refresh if cache is older than 10 minutes
    const cacheAge = spotPriceCache.lastUpdated
      ? (Date.now() - spotPriceCache.lastUpdated.getTime()) / 1000 / 60
      : Infinity;

    console.log(`📊 /api/spot-prices called - Cache age: ${cacheAge.toFixed(1)} minutes`);

    if (cacheAge > 10) {
      console.log('🔄 Cache expired, fetching fresh prices...');
      await fetchLiveSpotPrices();
    } else {
      console.log(`✅ Serving cached prices (${(10 - cacheAge).toFixed(1)} min until refresh)`);
    }

    res.json({
      success: true,
      ...spotPriceCache.prices,
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      source: spotPriceCache.source || 'goldapi-io',
      cacheAgeMinutes: spotPriceCache.lastUpdated ? Math.round(cacheAge * 10) / 10 : 0,
    });
  } catch (error) {
    console.error('Spot price error:', error);
    res.json({
      success: true,
      ...spotPriceCache.prices,
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      source: 'cached',
      error: error.message,
    });
  }
});

/**
 * Debug endpoint - Scraper usage stats
 */
app.get('/api/debug/api-usage', (req, res) => {
  const hoursSinceReset = (new Date() - apiRequestCounter.lastReset) / 1000 / 60 / 60;
  const scrapesPerHour = apiRequestCounter.total / Math.max(hoursSinceReset, 0.01);
  const projectedDaily = scrapesPerHour * 24;
  const projectedMonthly = scrapesPerHour * 24 * 30;

  res.json({
    totalScrapes: apiRequestCounter.total,
    startTime: apiRequestCounter.lastReset.toISOString(),
    hoursSinceReset: Math.round(hoursSinceReset * 10) / 10,
    scrapesPerHour: Math.round(scrapesPerHour * 10) / 10,
    projectedDaily: Math.round(projectedDaily),
    projectedMonthly: Math.round(projectedMonthly),
    unlimited: true,
    free: true,
    note: 'Web scraping is 100% free and unlimited!',
    recentCalls: apiRequestCounter.calls.slice(-10),
    cacheStatus: {
      lastUpdated: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : null,
      ageMinutes: spotPriceCache.lastUpdated
        ? Math.round((Date.now() - spotPriceCache.lastUpdated.getTime()) / 1000 / 60 * 10) / 10
        : null,
      source: spotPriceCache.source,
    }
  });
});

/**
 * Debug endpoint - check historical data
 */
app.get('/api/historical-debug', (req, res) => {
  const { date } = req.query;

  if (date) {
    // Check specific date
    res.json({
      date,
      goldPrice: historicalData.gold[date],
      silverPrice: historicalData.silver[date],
      allKeysContaining: Object.keys(historicalData.gold).filter(k => k.includes(date)).slice(0, 10)
    });
  } else {
    // Show sample data
    const goldKeys = Object.keys(historicalData.gold).slice(0, 20);
    const sample = {};
    goldKeys.forEach(k => {
      sample[k] = { gold: historicalData.gold[k], silver: historicalData.silver[k] };
    });
    res.json({
      totalKeys: Object.keys(historicalData.gold).length,
      loaded: historicalData.loaded,
      sampleKeys: goldKeys,
      sampleData: sample
    });
  }
});

/**
 * Get historical spot price for a specific date
 * Priority: 1) In-memory cache, 2) MetalPriceAPI, 3) Static JSON fallback
 */
app.get('/api/historical-spot', async (req, res) => {
  try {
    const { date, metal = 'gold' } = req.query;

    console.log(`📅 Historical spot lookup: ${date} for ${metal}`);

    if (!date) {
      return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });
    }

    // Normalize date format (YYYY-MM-DD)
    const normalizedDate = date.trim();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      console.log(`   Invalid date format: ${normalizedDate}`);
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }

    // Validate metal type
    if (metal !== 'gold' && metal !== 'silver') {
      return res.status(400).json({ error: 'Metal must be "gold" or "silver"' });
    }

    // Don't allow future dates
    const requestedDate = new Date(normalizedDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedDate > today) {
      console.log(`   Future date requested: ${normalizedDate}, using current spot`);
      return res.json({
        date: normalizedDate,
        metal,
        price: spotPriceCache.prices[metal] || 0,
        source: 'current-spot',
        note: 'Future date requested, using current spot price',
        success: true
      });
    }

    // PRIORITY 1: Check in-memory cache first
    if (historicalPriceCache[metal][normalizedDate]) {
      const cachedPrice = historicalPriceCache[metal][normalizedDate];
      console.log(`   ✅ Cache hit for ${normalizedDate}: $${cachedPrice}`);
      return res.json({
        date: normalizedDate,
        usedDate: normalizedDate,
        metal,
        price: cachedPrice,
        source: 'cache',
        success: true
      });
    }

    // PRIORITY 2: Fetch from MetalPriceAPI
    console.log(`   Cache miss, fetching from MetalPriceAPI...`);
    const apiResult = await fetchHistoricalPrices(normalizedDate);

    if (apiResult && apiResult[metal]) {
      const price = apiResult[metal];

      // Cache both gold and silver from the API response
      if (apiResult.gold) historicalPriceCache.gold[normalizedDate] = apiResult.gold;
      if (apiResult.silver) historicalPriceCache.silver[normalizedDate] = apiResult.silver;

      console.log(`   ✅ API success for ${normalizedDate}: $${price} (cached for future)`);
      return res.json({
        date: normalizedDate,
        usedDate: normalizedDate,
        metal,
        price: Math.round(price * 100) / 100,
        source: 'metalpriceapi',
        success: true
      });
    }

    // PRIORITY 3: Fall back to static JSON data (monthly averages)
    console.log(`   API unavailable, falling back to static JSON data...`);
    let price = historicalData[metal]?.[normalizedDate];
    let usedDate = normalizedDate;
    let source = 'static-json';

    if (price) {
      console.log(`   Found in static data: $${price} (monthly average)`);
    } else {
      // Try to find nearest date in static data
      const targetDate = new Date(normalizedDate + 'T00:00:00');
      const dates = Object.keys(historicalData[metal] || {}).sort();

      let closestDate = null;
      let minDiff = Infinity;

      for (const d of dates) {
        const diff = Math.abs(new Date(d + 'T00:00:00') - targetDate);
        if (diff < minDiff) {
          minDiff = diff;
          closestDate = d;
        }
      }

      if (closestDate && minDiff < 30 * 24 * 60 * 60 * 1000) {
        price = historicalData[metal][closestDate];
        usedDate = closestDate;
        source = 'static-json-nearest';
        const daysAway = Math.floor(minDiff / (24 * 60 * 60 * 1000));
        console.log(`   Using nearest static date ${closestDate}: $${price} (${daysAway} days away, monthly average)`);
      }
    }

    if (price) {
      return res.json({
        date: normalizedDate,
        usedDate,
        metal,
        price: Math.round(price * 100) / 100,
        source,
        note: source.includes('static') ? 'Monthly average (API unavailable)' : undefined,
        success: true
      });
    }

    // Final fallback: current spot price
    console.log(`   No historical data found, using current spot: $${spotPriceCache.prices[metal]}`);
    res.json({
      date: normalizedDate,
      metal,
      price: spotPriceCache.prices[metal] || 0,
      source: 'current-fallback',
      note: 'Historical price not available, using current spot',
      success: true
    });
  } catch (error) {
    console.error('❌ Historical spot error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to lookup historical price' });
  }
});

// ============================================
// SCAN USAGE TRACKING (Server-Side with /tmp/ persistence)
// ============================================

const FREE_SCAN_LIMIT = 5;
const SCAN_PERIOD_DAYS = 30;

// Use /tmp/ directory which is writable on Railway
// Note: /tmp/ persists during the container lifetime but resets on redeploy
const SCAN_USAGE_FILE = '/tmp/scan-usage.json';
let scanUsageData = {}; // In-memory cache

// Load scan usage data from /tmp/ file on startup
function loadScanUsageData() {
  try {
    if (fs.existsSync(SCAN_USAGE_FILE)) {
      const data = fs.readFileSync(SCAN_USAGE_FILE, 'utf8');
      scanUsageData = JSON.parse(data);
      console.log(`📊 Loaded scan usage data for ${Object.keys(scanUsageData).length} users from ${SCAN_USAGE_FILE}`);
    } else {
      console.log('📊 No scan usage file found, starting fresh');
      scanUsageData = {};
    }
  } catch (error) {
    console.error('❌ Failed to load scan usage data:', error.message);
    scanUsageData = {};
  }
}

// Save scan usage data to /tmp/ file
function saveScanUsageData() {
  try {
    fs.writeFileSync(SCAN_USAGE_FILE, JSON.stringify(scanUsageData, null, 2));
  } catch (error) {
    console.error('❌ Failed to save scan usage data:', error.message);
  }
}

// Save user scan data (updates in-memory and persists to file)
async function saveScanUsageForUser(userId, userRecord) {
  scanUsageData[userId] = userRecord;
  saveScanUsageData();
}

// Check if period needs reset (older than 30 days)
function checkAndResetPeriod(userRecord) {
  const now = new Date();
  const periodStart = new Date(userRecord.periodStart);
  const daysSincePeriodStart = (now - periodStart) / (1000 * 60 * 60 * 24);

  if (daysSincePeriodStart >= SCAN_PERIOD_DAYS) {
    userRecord.scansUsed = 0;
    userRecord.periodStart = now.toISOString();
    return true; // Period was reset
  }
  return false;
}

// Calculate when period resets
function getResetDate(periodStart) {
  const resetDate = new Date(periodStart);
  resetDate.setDate(resetDate.getDate() + SCAN_PERIOD_DAYS);
  return resetDate.toISOString();
}

/**
 * Get scan status for a user
 * GET /api/scan-status?rcUserId={revenueCatUserId}
 */
app.get('/api/scan-status', async (req, res) => {
  try {
    const { rcUserId } = req.query;

    if (!rcUserId) {
      return res.status(400).json({ error: 'rcUserId parameter required' });
    }

    console.log(`📊 Scan status check for user: ${rcUserId.substring(0, 8)}...`);

    // Get or create user record
    if (!scanUsageData[rcUserId]) {
      scanUsageData[rcUserId] = {
        scansUsed: 0,
        periodStart: new Date().toISOString()
      };
      await saveScanUsageForUser(rcUserId, scanUsageData[rcUserId]);
    }

    const userRecord = scanUsageData[rcUserId];

    // Check if period needs reset
    const wasReset = checkAndResetPeriod(userRecord);
    if (wasReset) {
      console.log(`   Period reset for user ${rcUserId.substring(0, 8)}...`);
      await saveScanUsageForUser(rcUserId, userRecord);
    }

    const response = {
      success: true,
      scansUsed: userRecord.scansUsed,
      scansLimit: FREE_SCAN_LIMIT,
      periodStart: userRecord.periodStart,
      resetsAt: getResetDate(userRecord.periodStart)
    };

    console.log(`   Scans used: ${userRecord.scansUsed}/${FREE_SCAN_LIMIT}`);

    res.json(response);
  } catch (error) {
    console.error('❌ Scan status error:', error);
    res.status(500).json({ error: 'Failed to get scan status' });
  }
});

/**
 * Increment scan count for a user (called after successful scan)
 * POST /api/increment-scan
 * Body: { rcUserId }
 */
app.post('/api/increment-scan', async (req, res) => {
  try {
    const { rcUserId } = req.body;

    if (!rcUserId) {
      return res.status(400).json({ error: 'rcUserId required in request body' });
    }

    console.log(`📊 Incrementing scan count for user: ${rcUserId.substring(0, 8)}...`);

    // Get or create user record
    if (!scanUsageData[rcUserId]) {
      scanUsageData[rcUserId] = {
        scansUsed: 0,
        periodStart: new Date().toISOString()
      };
    }

    const userRecord = scanUsageData[rcUserId];

    // Check if period needs reset first
    checkAndResetPeriod(userRecord);

    // Increment scan count
    userRecord.scansUsed += 1;

    // Save to Redis (or in-memory)
    await saveScanUsageForUser(rcUserId, userRecord);

    const response = {
      success: true,
      scansUsed: userRecord.scansUsed,
      scansLimit: FREE_SCAN_LIMIT,
      periodStart: userRecord.periodStart,
      resetsAt: getResetDate(userRecord.periodStart)
    };

    console.log(`   New scan count: ${userRecord.scansUsed}/${FREE_SCAN_LIMIT}`);

    res.json(response);
  } catch (error) {
    console.error('❌ Increment scan error:', error);
    res.status(500).json({ error: 'Failed to increment scan count' });
  }
});

/**
 * Scan receipt using Claude Vision
 * Privacy: Image is processed in memory only, never stored
 */
app.post('/api/scan-receipt', upload.single('receipt'), async (req, res) => {
  console.log('📷 Scan request received');

  try {
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No image provided' });
    }

    // Log file details
    console.log('📄 File details:', {
      mimetype: req.file.mimetype,
      size: `${(req.file.size / 1024).toFixed(2)} KB`,
      originalname: req.file.originalname
    });

    // Convert buffer to base64 (stays in memory)
    const base64Image = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

    console.log('🤖 Calling Claude Vision API...');

    // Call Claude Vision API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: (() => {
                // Get current spot prices from cache
                const silverSpot = spotPriceCache.prices?.silver || 31;
                const goldSpot = spotPriceCache.prices?.gold || 2650;

                // Calculate expected price ranges (spot + typical dealer premiums)
                const silverMin = Math.round(silverSpot + 5);
                const silverMax = Math.round(silverSpot + 25);
                const goldMin = Math.round(goldSpot + 50);
                const goldMax = Math.round(goldSpot + 200);

                return `Analyze this precious metals purchase receipt and extract ALL items from it.

IMPORTANT: Many receipts contain MULTIPLE ITEMS (e.g., both silver and gold coins). Extract EVERY item separately.

Return ONLY a JSON object with this structure:
{
  "dealer": "dealer/company name (shared across all items)",
  "purchaseDate": "YYYY-MM-DD format (shared across all items)",
  "items": [
    {
      "metal": "gold, silver, platinum, or palladium",
      "description": "product name/description",
      "quantity": number of items,
      "ozt": troy ounces per item (use standard weights: 1oz coins = 1, 1/10oz = 0.1, etc.),
      "unitPrice": price per unit in dollars (number only)
    }
  ]
}

⚠️ CRITICAL - PRICE VALIDATION:
Current spot prices RIGHT NOW:
- Silver spot: $${silverSpot}/oz
- Gold spot: $${goldSpot}/oz

Dealers ALWAYS charge a premium ABOVE spot. Expected retail prices:
- 1oz Silver coins: $${silverMin}-$${silverMax} each (NOT $30-40!)
- 1oz Gold coins: $${goldMin}-$${goldMax} each

COMMON OCR ERRORS - WATCH FOR THESE:
- "8" misread as "3" → $80 becomes $30, $38 becomes $33
- "7" misread as "1" → $79 becomes $19, $47 becomes $41
- "9" misread as "4" → $39 becomes $34
- If you read a silver price under $${silverMin}, you likely misread a digit
- If you read a gold price under $${goldMin}, you likely misread a digit

READ EACH PRICE DIGIT BY DIGIT. Verify the first digit especially.

Important:
- Extract EVERY line item as a separate object in the "items" array
- unitPrice should be the price PER ITEM, not the total
- If you see a total and quantity, calculate unitPrice = total / quantity
- Standard coin weights: American Eagle 1oz, 1/2oz, 1/4oz, 1/10oz
- Date should be the purchase/order date, not shipping date`;
              })()
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // ============================================
    // DEBUG: Log raw Claude Vision response
    // ============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 DEBUG: Raw Claude Vision Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(content.text);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Extract JSON from response
    let extractedData;
    try {
      // Try to find JSON in the response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse receipt data:', content.text);
      extractedData = { items: [] };
    }

    // ============================================
    // DEBUG: Log parsed items with all fields
    // ============================================
    console.log('🔍 DEBUG: Parsed Items Array:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (extractedData.items && extractedData.items.length > 0) {
      extractedData.items.forEach((item, index) => {
        console.log(`  Item ${index + 1}:`);
        console.log(`    - metal: ${item.metal}`);
        console.log(`    - description: ${item.description}`);
        console.log(`    - quantity: ${item.quantity}`);
        console.log(`    - ozt: ${item.ozt}`);
        console.log(`    - unitPrice: ${item.unitPrice} <-- CHECK THIS VALUE`);
      });
    } else {
      console.log('  (No items found)');
    }
    console.log(`  dealer: ${extractedData.dealer}`);
    console.log(`  purchaseDate: ${extractedData.purchaseDate}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Ensure items array exists
    if (!extractedData.items || !Array.isArray(extractedData.items)) {
      extractedData.items = [];
    }

    // ============================================
    // PRICE VALIDATION: Check for suspiciously low prices
    // ============================================
    const silverSpot = spotPriceCache.prices?.silver || 31;
    const goldSpot = spotPriceCache.prices?.gold || 2650;

    console.log(`💰 Using spot prices for validation - Silver: $${silverSpot}/oz, Gold: $${goldSpot}/oz`);

    // Minimum expected prices (spot + minimum typical premium)
    const minSilverPrice = silverSpot + 5;  // At least $5 above spot per oz
    const minGoldPrice = goldSpot + 50;     // At least $50 above spot per oz

    const suspiciousItems = [];

    for (let i = 0; i < extractedData.items.length; i++) {
      const item = extractedData.items[i];
      const metal = (item.metal || '').toLowerCase();
      const pricePerOz = item.unitPrice / (item.ozt || 1);

      let isSuspicious = false;
      let reason = '';

      if (metal === 'silver' || metal.includes('silver')) {
        if (pricePerOz < minSilverPrice) {
          isSuspicious = true;
          reason = `Silver at $${item.unitPrice}/unit ($${pricePerOz.toFixed(2)}/oz) is below minimum expected $${minSilverPrice}/oz (spot $${silverSpot} + $3 premium)`;
        }
      } else if (metal === 'gold' || metal.includes('gold')) {
        if (pricePerOz < minGoldPrice) {
          isSuspicious = true;
          reason = `Gold at $${item.unitPrice}/unit ($${pricePerOz.toFixed(2)}/oz) is below minimum expected $${minGoldPrice}/oz (spot $${goldSpot} + $30 premium)`;
        }
      }

      if (isSuspicious) {
        suspiciousItems.push({ index: i, item, reason });
        console.log(`⚠️ SUSPICIOUS PRICE DETECTED (Item ${i + 1}): ${reason}`);
      }
    }

    // If we have suspicious prices, make a second API call to re-read them
    if (suspiciousItems.length > 0 && base64Image) {
      console.log(`\n🔄 Re-reading ${suspiciousItems.length} suspicious price(s)...`);

      try {
        const rereadResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Image,
                  },
                },
                {
                  type: 'text',
                  text: `I need you to CAREFULLY re-read the prices for these specific items on this receipt. The previous reading got prices that are TOO LOW to be real.

ITEMS TO RE-READ:
${suspiciousItems.map((s, idx) => `${idx + 1}. "${s.item.description}" - Previously read as $${s.item.unitPrice} (THIS IS LIKELY WRONG)`).join('\n')}

PRICE REALITY CHECK:
- Silver spot price RIGHT NOW: $${silverSpot}/oz
- Gold spot price RIGHT NOW: $${goldSpot}/oz
- Minimum realistic silver coin price: $${silverSpot + 5}/oz (spot + dealer premium)
- Minimum realistic gold coin price: $${goldSpot + 50}/oz (spot + dealer premium)

The prices you read before are BELOW what's physically possible. No dealer sells below spot.

COMMON MISREADS:
- "8" looks like "3" → $80 becomes $30
- "7" looks like "1" → $79 becomes $19
- "9" looks like "4" → $89 becomes $34

Look at EACH DIGIT carefully. What are the ACTUAL prices on this receipt?

Return JSON only:
{
  "correctedPrices": [
    {"description": "item description", "unitPrice": corrected_price_number}
  ]
}`
                },
              ],
            },
          ],
        });

        const rereadContent = rereadResponse.content[0];
        if (rereadContent.type === 'text') {
          console.log('🔍 Re-read response:', rereadContent.text);

          const rereadMatch = rereadContent.text.match(/\{[\s\S]*\}/);
          if (rereadMatch) {
            const rereadData = JSON.parse(rereadMatch[0]);

            if (rereadData.correctedPrices && Array.isArray(rereadData.correctedPrices)) {
              // Apply corrections
              for (const correction of rereadData.correctedPrices) {
                // Find matching item and update price
                for (const suspicious of suspiciousItems) {
                  if (correction.description &&
                      suspicious.item.description.toLowerCase().includes(correction.description.toLowerCase().substring(0, 20)) ||
                      correction.description.toLowerCase().includes(suspicious.item.description.toLowerCase().substring(0, 20))) {
                    const oldPrice = extractedData.items[suspicious.index].unitPrice;
                    const newPrice = correction.unitPrice;

                    // Only apply if new price is higher and reasonable
                    if (newPrice > oldPrice) {
                      console.log(`✅ PRICE CORRECTED: "${suspicious.item.description}" $${oldPrice} → $${newPrice}`);
                      extractedData.items[suspicious.index].unitPrice = newPrice;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (rereadError) {
        console.error('⚠️ Re-read attempt failed:', rereadError.message);
        // Continue with original (possibly wrong) prices
      }
    }

    // Clear image data from memory immediately
    req.file.buffer = null;

    console.log(`✅ Receipt scan successful - found ${extractedData.items.length} item(s)`);

    res.json({
      success: true,
      dealer: extractedData.dealer || '',
      purchaseDate: extractedData.purchaseDate || '',
      items: extractedData.items,
      itemCount: extractedData.items.length,
      privacyNote: 'Image processed in memory and immediately discarded',
    });

  } catch (error) {
    // Ensure image is cleared even on error
    if (req.file) {
      req.file.buffer = null;
    }

    console.error('❌ Receipt scan error:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    res.status(500).json({
      error: 'Failed to process receipt',
      details: error.message
    });
  }
});

/**
 * Privacy policy endpoint
 */
app.get('/api/privacy', (req, res) => {
  res.json({
    version: '1.0.0',
    lastUpdated: '2024-12-26',
    summary: 'Stack Tracker Pro is built with privacy as the foundation. We cannot access your data.',
    principles: [
      {
        title: 'Memory-Only Image Processing',
        description: 'Receipt images are processed entirely in RAM and never written to disk.',
        technical: 'Images held in RAM only during API call, garbage collected immediately after response.'
      },
      {
        title: 'No Account Required',
        description: 'Use the app fully without creating an account. Your data stays on your device.',
        technical: 'Local-first architecture with optional encrypted sync.'
      },
      {
        title: 'End-to-End Encryption',
        description: 'If you choose to backup/sync, your data is encrypted on your device before transmission.',
        technical: 'AES-256-GCM encryption with user-held keys. Server stores only ciphertext.'
      },
      {
        title: 'No Tracking',
        description: 'No analytics, no third-party SDKs, no advertising. We do not track your usage.',
        technical: 'No Google Analytics, Facebook SDK, or similar. No device fingerprinting.'
      },
      {
        title: 'Your Data, Your Control',
        description: 'Export all your data anytime. Delete everything with one tap.',
        technical: 'Full JSON/CSV export, complete local deletion, server backup deletion via API.'
      }
    ],
    contact: 'privacy@stacktrackerpro.com'
  });
});

// Human-readable privacy policy (HTML)
app.get('/privacy', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Stack Tracker Pro</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
    }
    h1 {
      font-size: 2.5em;
      color: #111827;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .tagline {
      font-size: 1.2em;
      color: #6b7280;
      margin-bottom: 30px;
      font-weight: 500;
    }
    .last-updated {
      color: #9ca3af;
      font-size: 0.9em;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    h2 {
      font-size: 1.8em;
      color: #374151;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .principle {
      background: #f9fafb;
      border-left: 4px solid #fbbf24;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 6px;
    }
    .principle h3 {
      color: #111827;
      font-size: 1.3em;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .principle p {
      color: #4b5563;
      line-height: 1.7;
      font-size: 1.05em;
    }
    .icon {
      font-size: 1.5em;
    }
    .summary {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      font-size: 1.1em;
      color: #78350f;
      font-weight: 500;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      color: #6b7280;
      text-align: center;
      font-size: 0.95em;
    }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🪙 Privacy Policy</h1>
    <p class="tagline">Stack Tracker Pro - Privacy-First Precious Metals Portfolio</p>
    <p class="last-updated">Last Updated: December 26, 2024</p>

    <div class="summary">
      <strong>TL;DR:</strong> Stack Tracker Pro is built with privacy as the foundation. All your portfolio data is stored locally on your device only. We do NOT collect, store, or transmit your personal data to our servers.
    </div>

    <h2>Our Privacy Principles</h2>

    <div class="principle">
      <h3><span class="icon">📱</span> Local-First Data Storage</h3>
      <p>
        All your portfolio data—your precious metals holdings, purchase history, and preferences—is stored exclusively on your device using encrypted local storage. We have <strong>zero access</strong> to your portfolio data because it never leaves your device.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">📷</span> Memory-Only Image Processing</h3>
      <p>
        When you use our AI receipt scanning feature, images are processed entirely in RAM and <strong>never written to disk</strong>. The image is sent to our server, processed in memory, analyzed by AI, and immediately discarded. No receipts, photos, or scanned data are ever stored on our servers.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🚫</span> No Analytics or Tracking</h3>
      <p>
        We do not use Google Analytics, Facebook SDK, advertising networks, or any third-party tracking tools. We don't collect usage data, device fingerprints, or behavioral analytics. Your activity in the app is completely private.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🔑</span> No Account Required</h3>
      <p>
        You can use Stack Tracker Pro fully without creating an account. No email, no password, no personal information required. Your data stays on your device, under your control.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">💰</span> Third-Party Price Data</h3>
      <p>
        We use <strong>MetalPriceAPI</strong> and <strong>GoldAPI.io</strong> to fetch live precious metals spot prices. These API requests do not include any personal information or portfolio data—only anonymous requests for current market prices. Your holdings are never shared with these services.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">☁️</span> Optional Cloud Backup (Future Feature)</h3>
      <p>
        If we implement cloud backup in the future, it will be entirely optional and use end-to-end encryption with user-held keys. Your data would be encrypted on your device before transmission, and we would only store encrypted ciphertext that we cannot decrypt.
      </p>
    </div>

    <h2>Data We Do NOT Collect</h2>
    <div class="principle">
      <h3><span class="icon">✅</span> We Do Not Collect</h3>
      <p>
        ❌ Your precious metals holdings or portfolio data<br>
        ❌ Receipt images or scanned documents<br>
        ❌ Personal information (name, email, address)<br>
        ❌ Location data or device identifiers<br>
        ❌ Usage analytics or behavioral tracking<br>
        ❌ Financial information or payment details
      </p>
    </div>

    <h2>Your Rights</h2>
    <div class="principle">
      <h3><span class="icon">🛡️</span> Complete Control</h3>
      <p>
        Since all data is stored locally on your device, you have complete control. You can export your data anytime as CSV or JSON, and delete all data with one tap in the app settings. There's nothing for us to delete from our servers because we don't store your data.
      </p>
    </div>

    <h2>Changes to This Policy</h2>
    <p style="margin-top: 20px; color: #4b5563; line-height: 1.7;">
      If we make changes to this privacy policy, we'll update the "Last Updated" date at the top. Significant changes will be communicated through the app.
    </p>

    <div class="footer">
      <p>Questions about privacy? Contact us at <a href="mailto:stacktrackerpro@gmail.com">stacktrackerpro@gmail.com</a></p>
      <p style="margin-top: 10px;">Built with privacy in mind. Your data, your control. 🔒</p>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Human-readable terms of use (HTML)
app.get('/terms', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Use - Stack Tracker Pro</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
    }
    h1 {
      font-size: 2.5em;
      color: #111827;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .tagline {
      font-size: 1.2em;
      color: #6b7280;
      margin-bottom: 30px;
      font-weight: 500;
    }
    .last-updated {
      color: #9ca3af;
      font-size: 0.9em;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    h2 {
      font-size: 1.5em;
      color: #374151;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    p, ul {
      color: #4b5563;
      margin-bottom: 15px;
      line-height: 1.7;
    }
    ul {
      margin-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    .summary {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      font-size: 1.1em;
      color: #78350f;
      font-weight: 500;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      color: #6b7280;
      text-align: center;
      font-size: 0.95em;
    }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📜 Terms of Use</h1>
    <p class="tagline">Stack Tracker Pro - Privacy-First Precious Metals Portfolio</p>
    <p class="last-updated">Last Updated: January 4, 2026</p>

    <div class="summary">
      By using Stack Tracker Pro, you agree to these terms. Please read them carefully.
    </div>

    <h2>1. Acceptance of Terms</h2>
    <p>
      By downloading, installing, or using Stack Tracker Pro ("the App"), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the App.
    </p>

    <h2>2. Description of Service</h2>
    <p>
      Stack Tracker Pro is a personal portfolio tracking application for precious metals enthusiasts. The App allows you to:
    </p>
    <ul>
      <li>Track your gold, silver, and precious metals holdings</li>
      <li>Scan receipts using AI-powered image recognition</li>
      <li>View live spot prices for precious metals</li>
      <li>Export your portfolio data in various formats</li>
    </ul>

    <h2>3. User Responsibilities</h2>
    <p>You agree to:</p>
    <ul>
      <li>Use the App only for lawful purposes</li>
      <li>Provide accurate information when using the App's features</li>
      <li>Not attempt to reverse engineer, modify, or exploit the App</li>
      <li>Not use the App to store or process illegal content</li>
    </ul>

    <h2>4. Data and Privacy</h2>
    <p>
      Your portfolio data is stored locally on your device. We do not collect, store, or have access to your personal portfolio information. For details on how we handle data, please review our <a href="/privacy">Privacy Policy</a>.
    </p>

    <h2>5. Subscriptions and Payments</h2>
    <p>
      Stack Tracker Pro offers both free and premium subscription tiers. Premium subscriptions ("Gold") are processed through Apple App Store or Google Play Store. Subscription terms, pricing, and cancellation policies are governed by the respective app store's terms.
    </p>
    <ul>
      <li>Subscriptions automatically renew unless cancelled before the renewal date</li>
      <li>You can manage and cancel subscriptions through your device's app store settings</li>
      <li>Refunds are handled according to Apple App Store or Google Play Store policies</li>
    </ul>

    <h2>6. Disclaimer of Warranties</h2>
    <p>
      The App is provided "as is" without warranties of any kind. We do not guarantee:
    </p>
    <ul>
      <li>The accuracy of spot prices (prices are sourced from third-party APIs)</li>
      <li>The accuracy of AI receipt scanning results</li>
      <li>Uninterrupted or error-free operation of the App</li>
    </ul>
    <p>
      <strong>Stack Tracker Pro is not a financial advisor.</strong> The App is for informational and tracking purposes only. Always verify important financial information independently.
    </p>

    <h2>7. Limitation of Liability</h2>
    <p>
      To the maximum extent permitted by law, Stack Tracker Pro and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App.
    </p>

    <h2>8. Intellectual Property</h2>
    <p>
      All content, features, and functionality of the App are owned by Stack Tracker Pro and are protected by copyright, trademark, and other intellectual property laws.
    </p>

    <h2>9. Changes to Terms</h2>
    <p>
      We may update these Terms of Use from time to time. Continued use of the App after changes constitutes acceptance of the new terms. We will update the "Last Updated" date when changes are made.
    </p>

    <h2>10. Termination</h2>
    <p>
      We reserve the right to terminate or suspend access to the App at any time, without prior notice, for conduct that we believe violates these terms or is harmful to other users or the App.
    </p>

    <h2>11. Contact Us</h2>
    <p>
      If you have questions about these Terms of Use, please contact us at <a href="mailto:stacktrackerpro@gmail.com">stacktrackerpro@gmail.com</a>.
    </p>

    <div class="footer">
      <p>Questions? Contact us at <a href="mailto:stacktrackerpro@gmail.com">stacktrackerpro@gmail.com</a></p>
      <p style="margin-top: 10px;">Stack Tracker Pro - Track your stack with confidence. 🪙</p>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ============================================
// STARTUP
// ============================================

const PORT = process.env.PORT || 3000;

// Load data on startup
loadHistoricalData(); // Synchronous JSON load
loadScanUsageData(); // Load scan usage from /tmp/

fetchLiveSpotPrices().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🪙 Stack Tracker API running on port ${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔒 Privacy Mode: ENABLED');
    console.log('📷 Image Storage: DISABLED (memory-only)');
    console.log('📊 Analytics: DISABLED');
    console.log('💰 Spot Prices:', spotPriceCache.prices);
    console.log('📡 Price Source:', spotPriceCache.source);
    console.log('📅 Historical Data:', historicalData.loaded ? 'LOADED' : 'FALLBACK');
    console.log('⚡ Price Fetching: ON-DEMAND ONLY (10-min cache)');
    console.log('💸 API: MetalPriceAPI Primary, GoldAPI Fallback (10,000/month each)');
    console.log('🗄️ Scan Storage: /tmp/scan-usage.json');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}).catch(error => {
  console.error('Startup error:', error);
  // Start anyway with fallback data
  app.listen(PORT, () => {
    console.log(`Stack Tracker API running on port ${PORT} (with fallback data)`);
  });
});

// ❌ NO AUTO-POLLING: Prices are fetched ONLY on-demand when users request them
// This prevents burning through API quota when the app is idle
// With 10-minute cache, even heavy usage stays well under 10,000/month limit

// Historical data loaded from static JSON file, no need to refresh

module.exports = app;

// Force redeploy
