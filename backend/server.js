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
const sizeOf = require('image-size');
const axios = require('axios');

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

// Increase JSON limit for base64 image uploads
app.use(express.json({ limit: '20mb' }));

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
  prices: { gold: 5100, silver: 107, platinum: 2700, palladium: 2000 },
  lastUpdated: null,
  change: { gold: {}, silver: {}, source: 'unavailable' },
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
const { checkPriceAlerts, startPriceAlertChecker } = require(path.join(__dirname, 'services', 'priceAlertChecker.js'));

// Import historical price services
const { isSupabaseAvailable } = require('./supabaseClient');
const { validate } = require('./middleware/validation');
const { fetchETFHistorical, slvToSpotSilver, gldToSpotGold, hasETFDataForDate, fetchBothETFs } = require('./services/etfPrices');
const { calibrateRatios, getRatioForDate, needsCalibration } = require('./services/calibrateRatios');
const { logPriceFetch, findLoggedPrice, findClosestLoggedPrice, getLogStats } = require('./services/priceLogger');
const { createAlert, getAlertsForUser, deleteAlert, checkAlerts, getAlertCount } = require('./services/priceAlerts');
const { saveSnapshot, getSnapshots, getLatestSnapshot, getSnapshotCount } = require('./services/portfolioSnapshots');

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
        platinum: fetchedPrices.platinum || 2700,
        palladium: fetchedPrices.palladium || 2000,
      },
      lastUpdated: new Date(),
      source: fetchedPrices.source,
      change: fetchedPrices.change || { gold: {}, silver: {}, source: 'unavailable' },
    };

    console.log('✅ Spot prices updated:', spotPriceCache.prices);
    console.log(`📈 Total API requests: ${apiRequestCounter.total}`);

    // Log price to database for historical minute-level data (non-blocking)
    logPriceFetch(spotPriceCache.prices, fetchedPrices.source).catch(err => {
      console.log('   Price logging skipped:', err.message);
    });

    // Calibrate ETF ratios once per day (non-blocking)
    needsCalibration().then(async (needed) => {
      if (needed && spotPriceCache.prices.gold && spotPriceCache.prices.silver) {
        console.log('📐 Running daily ETF ratio calibration...');
        await calibrateRatios(spotPriceCache.prices.gold, spotPriceCache.prices.silver);
      }
    }).catch(err => {
      console.log('   Calibration check skipped:', err.message);
    });

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
    spotPriceCache.prices = { gold: 5100, silver: 107, platinum: 2700, palladium: 2000 };
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
      change: spotPriceCache.change || { gold: {}, silver: {}, source: 'unavailable' },
    });
  } catch (error) {
    console.error('Spot price error:', error);
    res.json({
      success: true,
      ...spotPriceCache.prices,
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      source: 'cached',
      error: error.message,
      change: spotPriceCache.change || { gold: {}, silver: {}, source: 'unavailable' },
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
app.get('/api/historical-debug', async (req, res) => {
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
    // Show system status including price_log stats
    const goldKeys = Object.keys(historicalData.gold).slice(0, 20);
    const sample = {};
    goldKeys.forEach(k => {
      sample[k] = { gold: historicalData.gold[k], silver: historicalData.silver[k] };
    });

    // Get price log stats if available
    let priceLogStats = { available: false };
    try {
      priceLogStats = await getLogStats();
    } catch (err) {
      priceLogStats = { available: false, error: err.message };
    }

    res.json({
      macroTrendsData: {
        totalDays: Object.keys(historicalData.gold).length,
        loaded: historicalData.loaded,
        sampleKeys: goldKeys,
        sampleData: sample
      },
      priceLog: priceLogStats,
      supabaseConfigured: isSupabaseAvailable(),
      dataSources: {
        tier1: 'MacroTrends monthly data (1915-2006)',
        tier2: 'Yahoo Finance SLV/GLD ETF data (2006-present)',
        tier3: 'Our price_log database (minute-level, accumulating)'
      }
    });
  }
});

/**
 * Get historical spot price for a specific date
 *
 * THREE-TIER HISTORICAL DATA SYSTEM:
 * 1. Pre-April 2006: Monthly prices from historical-prices.json (MacroTrends data)
 * 2. April 2006 to Present: Daily/intraday from SLV/GLD ETF data via Yahoo Finance
 * 3. Recent (if logged): Minute-level from our own price_log database
 *
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - time: HH:MM (optional, for intraday estimation)
 * - metal: 'gold' or 'silver' (default: returns both)
 */
app.get('/api/historical-spot', async (req, res) => {
  try {
    const { date, time, metal } = req.query;

    console.log(`📅 Historical spot lookup: ${date}${time ? ' ' + time : ''}`);

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required (YYYY-MM-DD)'
      });
    }

    // Normalize and validate date format
    const normalizedDate = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      console.log(`   Invalid date format: ${normalizedDate}`);
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format'
      });
    }

    // Validate time format if provided
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        success: false,
        error: 'Time must be in HH:MM format'
      });
    }

    const requestedDate = new Date(normalizedDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Don't allow future dates
    if (requestedDate > today) {
      console.log(`   Future date requested: ${normalizedDate}, using current spot`);
      return res.json({
        success: true,
        date: normalizedDate,
        time: time || null,
        gold: spotPriceCache.prices.gold,
        silver: spotPriceCache.prices.silver,
        granularity: 'current',
        source: 'current-spot',
        note: 'Future date requested, using current spot price'
      });
    }

    const year = requestedDate.getFullYear();
    const month = String(requestedDate.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;

    let goldPrice, silverPrice, granularity, source;
    let dailyRange = null;
    let note = null;

    // ================================================================
    // TIER 1: Pre-April 2006 - Use monthly MacroTrends data
    // (SLV launched April 2006, so no ETF data before that)
    // ================================================================
    if (year < 2006 || (year === 2006 && requestedDate.getMonth() < 3)) {
      console.log(`   Pre-2006 date, using MacroTrends monthly data`);

      const monthData = {
        gold: historicalData.gold[normalizedDate],
        silver: historicalData.silver[normalizedDate]
      };

      if (monthData.gold && monthData.silver) {
        goldPrice = monthData.gold;
        silverPrice = monthData.silver;
        granularity = 'monthly';
        source = 'macrotrends';
        note = 'Pre-2006 data uses monthly averages. Adjust manually if you know the exact price.';
        console.log(`   ✅ Found MacroTrends data: Gold $${goldPrice}, Silver $${silverPrice}`);
      } else {
        console.log(`   ❌ No MacroTrends data for ${monthKey}`);
        return res.status(404).json({
          success: false,
          error: `No historical data found for ${monthKey}`
        });
      }
    }

    // ================================================================
    // TIER 2 & 3: April 2006 to Present - ETF data + our logged data
    // ================================================================
    else {
      // First, check our own price_log for logged minute-level data
      if (isSupabaseAvailable()) {
        console.log(`   Checking price_log database...`);
        const loggedPrice = time
          ? await findLoggedPrice(normalizedDate, time, 5) // ±5 min window
          : await findClosestLoggedPrice(normalizedDate);

        if (loggedPrice) {
          goldPrice = loggedPrice.gold;
          silverPrice = loggedPrice.silver;
          granularity = time ? 'minute' : 'logged_daily';
          source = 'price_log';
          console.log(`   ✅ Found in price_log: Gold $${goldPrice}, Silver $${silverPrice}`);
        }
      }

      // If no logged data, use ETF conversion
      if (!goldPrice) {
        console.log(`   Fetching ETF data from Yahoo Finance...`);

        try {
          const { slv: slvData, gld: gldData } = await fetchBothETFs(normalizedDate);

          if (slvData && gldData) {
            // Get the calibrated ratio for that date (or nearest)
            const ratios = await getRatioForDate(normalizedDate);
            console.log(`   Using ratios: SLV=${ratios.slv_ratio.toFixed(4)}, GLD=${ratios.gld_ratio.toFixed(4)}`);

            // Convert ETF prices to spot prices
            silverPrice = slvToSpotSilver(slvData.close, ratios.slv_ratio);
            goldPrice = gldToSpotGold(gldData.close, ratios.gld_ratio);

            // Provide daily range for user reference
            dailyRange = {
              silver: {
                low: Math.round(slvToSpotSilver(slvData.low, ratios.slv_ratio) * 100) / 100,
                high: Math.round(slvToSpotSilver(slvData.high, ratios.slv_ratio) * 100) / 100
              },
              gold: {
                low: Math.round(gldToSpotGold(gldData.low, ratios.gld_ratio) * 100) / 100,
                high: Math.round(gldToSpotGold(gldData.high, ratios.gld_ratio) * 100) / 100
              }
            };

            granularity = 'daily';
            source = 'etf_derived';

            // If time was provided, estimate based on time of day
            if (time) {
              const hour = parseInt(time.split(':')[0]);

              // Time-weighted estimation
              // Morning (before 10am) -> closer to open
              // Afternoon (after 2pm) -> closer to close
              // Midday -> OHLC average
              if (hour < 10) {
                silverPrice = slvToSpotSilver(
                  slvData.open * 0.7 + slvData.close * 0.3,
                  ratios.slv_ratio
                );
                goldPrice = gldToSpotGold(
                  gldData.open * 0.7 + gldData.close * 0.3,
                  ratios.gld_ratio
                );
              } else if (hour >= 14) {
                silverPrice = slvToSpotSilver(
                  slvData.open * 0.3 + slvData.close * 0.7,
                  ratios.slv_ratio
                );
                goldPrice = gldToSpotGold(
                  gldData.open * 0.3 + gldData.close * 0.7,
                  ratios.gld_ratio
                );
              } else {
                // Midday - use OHLC average
                silverPrice = slvToSpotSilver(
                  (slvData.open + slvData.high + slvData.low + slvData.close) / 4,
                  ratios.slv_ratio
                );
                goldPrice = gldToSpotGold(
                  (gldData.open + gldData.high + gldData.low + gldData.close) / 4,
                  ratios.gld_ratio
                );
              }
              granularity = 'estimated_intraday';
              note = `Estimated based on time of day. Actual range: Silver $${dailyRange.silver.low}-${dailyRange.silver.high}, Gold $${dailyRange.gold.low}-${dailyRange.gold.high}`;
            }

            console.log(`   ✅ ETF-derived prices: Gold $${goldPrice?.toFixed(2)}, Silver $${silverPrice?.toFixed(2)}`);
          } else {
            console.log(`   ETF data not available for ${normalizedDate}`);
          }
        } catch (etfError) {
          console.log(`   ETF fetch error: ${etfError.message}`);
        }
      }

      // Fallback to MetalPriceAPI if ETF failed
      if (!goldPrice) {
        console.log(`   Trying MetalPriceAPI...`);
        const apiResult = await fetchHistoricalPrices(normalizedDate);

        if (apiResult && apiResult.gold && apiResult.silver) {
          goldPrice = apiResult.gold;
          silverPrice = apiResult.silver;
          granularity = 'daily';
          source = 'metalpriceapi';

          // Cache for future
          historicalPriceCache.gold[normalizedDate] = goldPrice;
          historicalPriceCache.silver[normalizedDate] = silverPrice;

          console.log(`   ✅ MetalPriceAPI: Gold $${goldPrice}, Silver $${silverPrice}`);
        }
      }

      // Final fallback to monthly MacroTrends data
      if (!goldPrice) {
        console.log(`   Falling back to MacroTrends monthly data...`);
        const monthlyGold = historicalData.gold[normalizedDate];
        const monthlySilver = historicalData.silver[normalizedDate];

        if (monthlyGold && monthlySilver) {
          goldPrice = monthlyGold;
          silverPrice = monthlySilver;
          granularity = 'monthly_fallback';
          source = 'macrotrends';
          note = 'ETF/API unavailable, using monthly average. Adjust manually if needed.';
          console.log(`   ✅ MacroTrends fallback: Gold $${goldPrice}, Silver $${silverPrice}`);
        }
      }

      // Last resort: return failure instead of contaminating with current spot
      if (!goldPrice) {
        console.log(`   ❌ No historical data found for ${normalizedDate}`);
        return res.json({
          success: true,
          date: normalizedDate,
          gold: null,
          silver: null,
          price: null,
          granularity: 'none',
          source: 'unavailable',
          note: 'Historical price not available for this date'
        });
      }
    }

    // Round prices to 2 decimal places
    goldPrice = Math.round(goldPrice * 100) / 100;
    silverPrice = Math.round(silverPrice * 100) / 100;

    // Build response
    const response = {
      success: true,
      date: normalizedDate,
      time: time || null,
      gold: goldPrice,
      silver: silverPrice,
      granularity,
      source
    };

    // Add daily range if available
    if (dailyRange) {
      response.dailyRange = dailyRange;
    }

    // Add note if applicable
    if (note) {
      response.note = note;
    }

    // If specific metal requested, also include just that price for backwards compatibility
    if (metal === 'gold' || metal === 'silver') {
      response.metal = metal;
      response.price = metal === 'gold' ? goldPrice : silverPrice;
    }

    console.log(`   📊 Response: ${granularity} from ${source}`);
    res.json(response);

  } catch (error) {
    console.error('❌ Historical spot error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup historical price'
    });
  }
});

/**
 * BATCH Historical Spot Price Lookup
 * Accepts multiple dates in one request - much faster than individual calls
 * Uses local MacroTrends data + current spot for speed (no external API calls)
 *
 * POST /api/historical-spot-batch
 * Body: { dates: ["2024-01-15", "2024-01-16", ...] }
 */
app.post('/api/historical-spot-batch', async (req, res) => {
  try {
    const { dates } = req.body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'dates array is required'
      });
    }

    // Limit batch size to prevent abuse
    if (dates.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 dates per batch request'
      });
    }

    console.log(`📅 Batch historical spot lookup: ${dates.length} dates`);

    // Get today's date in a timezone-safe way (use local date components)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const results = {};
    let fromPriceLog = 0;
    let fromMacrotrends = 0;
    let fromCurrentSpot = 0;
    let fromCache = 0;

    for (const date of dates) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        results[date] = { success: false, error: 'Invalid date format' };
        continue;
      }

      // For today or future dates, use current spot
      if (date >= todayStr) {
        results[date] = {
          success: true,
          gold: spotPriceCache.prices.gold,
          silver: spotPriceCache.prices.silver,
          source: 'current-spot'
        };
        fromCurrentSpot++;
        continue;
      }

      // Check our in-memory cache first (populated from previous lookups)
      if (historicalPriceCache.gold[date] && historicalPriceCache.silver[date]) {
        results[date] = {
          success: true,
          gold: historicalPriceCache.gold[date],
          silver: historicalPriceCache.silver[date],
          source: 'cache'
        };
        fromCache++;
        continue;
      }

      // Parse the date to determine which tier to use
      const requestedDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone issues
      const year = requestedDate.getFullYear();

      // TIER 1: For dates >= April 2006, check price_log first (most accurate)
      if (year >= 2006 && !(year === 2006 && requestedDate.getMonth() < 3)) {
        if (isSupabaseAvailable()) {
          try {
            const loggedPrice = await findClosestLoggedPrice(date);
            if (loggedPrice && loggedPrice.gold && loggedPrice.silver) {
              results[date] = {
                success: true,
                gold: loggedPrice.gold,
                silver: loggedPrice.silver,
                source: 'price_log'
              };
              // Cache for future
              historicalPriceCache.gold[date] = loggedPrice.gold;
              historicalPriceCache.silver[date] = loggedPrice.silver;
              fromPriceLog++;
              continue;
            }
          } catch (err) {
            // price_log lookup failed, continue to fallback
          }
        }
      }

      // TIER 2: Use MacroTrends data (available for most dates as monthly averages)
      const goldPrice = historicalData.gold[date];
      const silverPrice = historicalData.silver[date];

      if (goldPrice && silverPrice) {
        results[date] = {
          success: true,
          gold: goldPrice,
          silver: silverPrice,
          source: 'macrotrends'
        };
        // Cache for future
        historicalPriceCache.gold[date] = goldPrice;
        historicalPriceCache.silver[date] = silverPrice;
        fromMacrotrends++;
        continue;
      }

      // Fallback: use current spot for missing data
      results[date] = {
        success: true,
        gold: spotPriceCache.prices.gold,
        silver: spotPriceCache.prices.silver,
        source: 'current-spot-fallback',
        note: 'Historical data not available, using current spot'
      };
      fromCurrentSpot++;
    }

    console.log(`   ✅ Batch complete: ${fromPriceLog} price_log, ${fromMacrotrends} macrotrends, ${fromCache} cached, ${fromCurrentSpot} current spot`);

    res.json({
      success: true,
      count: dates.length,
      results
    });

  } catch (error) {
    console.error('❌ Batch historical spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup historical prices'
    });
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
 * Test Gemini API connection
 * GET /api/test-gemini
 */
app.get('/api/test-gemini', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    return res.json({
      success: false,
      error: 'GEMINI_API_KEY not configured in environment variables',
      configured: false
    });
  }

  try {
    console.log('🧪 Testing Gemini API connection...');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        contents: [{
          parts: [{ text: 'Say "Gemini is working!" in exactly those words.' }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 50,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log('✅ Gemini test successful:', responseText);

    res.json({
      success: true,
      configured: true,
      apiKeyPrefix: geminiApiKey.substring(0, 8) + '...',
      response: responseText,
      model: 'gemini-2.0-flash'
    });

  } catch (error) {
    console.error('❌ Gemini test failed:', error.message);

    res.json({
      success: false,
      configured: true,
      apiKeyPrefix: geminiApiKey.substring(0, 8) + '...',
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data
    });
  }
});

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

// ============================================
// PRICE ALERTS (Gold/Lifetime Feature)
// ============================================

/**
 * Create a new price alert
 * POST /api/alerts
 * Body: { userId, metal, targetPrice, direction, pushToken }
 */
app.post('/api/alerts', async (req, res) => {
  try {
    const { userId, metal, targetPrice, direction, pushToken } = req.body;

    // Validate required fields
    if (!userId || !metal || !targetPrice || !direction) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, metal, targetPrice, direction'
      });
    }

    // Validate metal
    if (!['gold', 'silver'].includes(metal)) {
      return res.status(400).json({
        success: false,
        error: 'Metal must be "gold" or "silver"'
      });
    }

    // Validate direction
    if (!['above', 'below'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be "above" or "below"'
      });
    }

    // Validate target price
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Target price must be a positive number'
      });
    }

    const alert = await createAlert({
      userId,
      metal,
      targetPrice: price,
      direction,
      pushToken: pushToken || null
    });

    res.json({
      success: true,
      alert
    });

  } catch (error) {
    console.error('❌ Create alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create alert'
    });
  }
});

/**
 * Get all alerts for a user
 * GET /api/alerts/:userId
 */
app.get('/api/alerts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const alerts = await getAlertsForUser(userId);

    res.json({
      success: true,
      alerts,
      count: alerts.length
    });

  } catch (error) {
    console.error('❌ Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts'
    });
  }
});

/**
 * Delete an alert
 * DELETE /api/alerts/:alertId
 * Query: userId (required for ownership verification)
 */
app.delete('/api/alerts/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { userId } = req.query;

    if (!alertId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Alert ID and User ID are required'
      });
    }

    await deleteAlert(alertId, userId);

    res.json({
      success: true,
      message: 'Alert deleted'
    });

  } catch (error) {
    console.error('❌ Delete alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete alert'
    });
  }
});

/**
 * Check all active alerts against current prices
 * POST /api/alerts/check
 * This should be called periodically (e.g., every 15 minutes)
 */
app.post('/api/alerts/check', async (req, res) => {
  try {
    // Use cached spot prices
    const currentPrices = spotPriceCache.prices;

    if (!currentPrices.gold || !currentPrices.silver) {
      return res.status(503).json({
        success: false,
        error: 'Spot prices not available'
      });
    }

    console.log(`🔔 Checking alerts at Gold $${currentPrices.gold}, Silver $${currentPrices.silver}...`);

    const result = await checkAlerts(currentPrices);

    res.json({
      success: true,
      ...result,
      prices: {
        gold: currentPrices.gold,
        silver: currentPrices.silver
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Check alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check alerts'
    });
  }
});

// ============================================
// PORTFOLIO SNAPSHOTS (Gold/Lifetime Feature - Analytics)
// ============================================

/**
 * Save a daily portfolio snapshot
 * POST /api/snapshots
 * Body: { userId, totalValue, goldValue, silverValue, goldOz, silverOz, goldSpot, silverSpot }
 */
app.post('/api/snapshots', async (req, res) => {
  try {
    const { userId, totalValue, goldValue, silverValue, goldOz, silverOz, goldSpot, silverSpot } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Allow zero values but validate they're numbers
    if (typeof totalValue !== 'number' || typeof goldValue !== 'number' ||
        typeof silverValue !== 'number' || typeof goldOz !== 'number' ||
        typeof silverOz !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid numeric values provided'
      });
    }

    const snapshot = await saveSnapshot({
      userId,
      totalValue,
      goldValue,
      silverValue,
      goldOz,
      silverOz,
      goldSpot: goldSpot || 0,
      silverSpot: silverSpot || 0,
    });

    res.json({
      success: true,
      snapshot
    });

  } catch (error) {
    console.error('❌ Save snapshot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save snapshot'
    });
  }
});

/**
 * Get portfolio snapshots for analytics charts
 * GET /api/snapshots/:userId
 * Query params: ?range=1M (1W, 1M, 3M, 6M, 1Y, all)
 */
app.get('/api/snapshots/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { range = '1M' } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const snapshots = await getSnapshots(userId, range);

    res.json({
      success: true,
      snapshots,
      count: snapshots.length,
      range
    });

  } catch (error) {
    console.error('❌ Get snapshots error:', error.message);

    // If database is not available, return empty array instead of error
    // This allows the app to gracefully handle and calculate historical data
    if (error.message === 'Database not available') {
      return res.json({
        success: true,
        snapshots: [],
        count: 0,
        range: req.query.range || '1M',
        note: 'Database temporarily unavailable'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get snapshots',
      details: error.message
    });
  }
});

/**
 * Get latest snapshot for a user
 * GET /api/snapshots/:userId/latest
 */
app.get('/api/snapshots/:userId/latest', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const snapshot = await getLatestSnapshot(userId);

    res.json({
      success: true,
      snapshot
    });

  } catch (error) {
    console.error('❌ Get latest snapshot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get latest snapshot'
    });
  }
});

/**
 * Scan receipt using Gemini 1.5 Flash (primary) or Claude Vision (fallback)
 * Privacy: Image is processed in memory only, never stored
 * Accepts both FormData (multipart) and JSON with base64
 */
app.post('/api/scan-receipt', upload.single('receipt'), async (req, res) => {
  const startTime = Date.now();
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    RECEIPT SCAN REQUEST                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    let base64Image;
    let mediaType;

    // Check if request is JSON with base64 or FormData
    if (req.body && req.body.image) {
      // JSON format with base64
      console.log('📄 RECEIVED AS JSON/BASE64:');
      base64Image = req.body.image;
      mediaType = req.body.mimeType || 'image/jpeg';
      const originalSize = req.body.originalSize;

      console.log(`   - Original size from client: ${originalSize ? (originalSize / 1024).toFixed(2) + ' KB' : 'unknown'}`);
      console.log(`   - Base64 length: ${base64Image.length} characters`);
      console.log(`   - Calculated size: ${(base64Image.length * 0.75 / 1024).toFixed(2)} KB`);
      console.log(`   - Media type: ${mediaType}`);

    } else if (req.file) {
      // FormData format
      console.log('📄 RECEIVED AS FORMDATA:');
      console.log(`   - MIME type: ${req.file.mimetype}`);
      console.log(`   - Size: ${(req.file.size / 1024).toFixed(2)} KB (${req.file.size} bytes)`);
      console.log(`   - Original name: ${req.file.originalname}`);

      // Convert buffer to base64
      base64Image = req.file.buffer.toString('base64');
      mediaType = req.file.mimetype || 'image/jpeg';

    } else {
      console.log('❌ No image provided');
      return res.status(400).json({ error: 'No image provided' });
    }

    // Prompt for receipt extraction
    const prompt = `Extract precious metals purchase data from this receipt image. Read every number EXACTLY as printed.

RULES:
1. ONLY include precious metal products: coins, bars, rounds
2. EXCLUDE accessories: tubes, capsules, boxes, cases, albums, flips, holders
3. EXCLUDE items under $10 (accessories)
4. Read prices EXACTLY - do not estimate
5. Extract purchase TIME if visible (from timestamp, order time, transaction time, etc.)

Return ONLY valid JSON (no markdown, no explanation):
{
  "dealer": "dealer name",
  "purchaseDate": "YYYY-MM-DD",
  "purchaseTime": "HH:MM",
  "items": [
    {
      "description": "product name exactly as printed",
      "quantity": 1,
      "unitPrice": 123.45,
      "extPrice": 123.45,
      "metal": "silver",
      "ozt": 1.0
    }
  ]
}

If a field is unreadable, use null. Metal must be: gold, silver, platinum, or palladium. purchaseTime should be in 24-hour format (e.g., "14:30" for 2:30 PM).`;

    let responseText;
    let apiSource;
    const apiStartTime = Date.now();

    // Try Gemini 1.5 Flash first (faster and cheaper)
    const geminiApiKey = process.env.GEMINI_API_KEY;
    console.log(`\n🔑 GEMINI_API_KEY configured: ${geminiApiKey ? 'YES (' + geminiApiKey.substring(0, 8) + '...)' : 'NO'}`);

    if (geminiApiKey) {
      try {
        console.log('🤖 Calling Gemini 2.0 Flash API...');

        const geminiResponse = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: base64Image
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
            }
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
          }
        );

        if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          responseText = geminiResponse.data.candidates[0].content.parts[0].text;
          apiSource = 'gemini-2.0-flash';
          console.log('✅ Gemini response received');
        } else {
          throw new Error('Invalid Gemini response structure');
        }
      } catch (geminiError) {
        console.log('⚠️ Gemini API Error Details:');
        console.log(`   Message: ${geminiError.message}`);
        if (geminiError.response) {
          console.log(`   Status: ${geminiError.response.status}`);
          console.log(`   Status Text: ${geminiError.response.statusText}`);
          console.log(`   Response Data:`, JSON.stringify(geminiError.response.data, null, 2));
        }
        if (geminiError.code) {
          console.log(`   Error Code: ${geminiError.code}`);
        }
        console.log('   Falling back to Claude...');
      }
    }

    // Fall back to Claude if Gemini failed or not configured
    if (!responseText) {
      console.log('\n🤖 Calling Claude Vision API (claude-sonnet-4-20250514)...');

      const claudeResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
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
                text: prompt,
              },
            ],
          },
        ],
      });

      const content = claudeResponse.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }
      responseText = content.text;
      apiSource = 'claude-sonnet-4';
    }

    const apiDuration = Date.now() - apiStartTime;
    console.log(`⏱️  API call completed in ${apiDuration}ms (${apiSource})`);

    console.log('\n📥 RAW API RESPONSE:');
    console.log('═'.repeat(60));
    console.log(responseText);
    console.log('═'.repeat(60));

    // Extract JSON from response
    let extractedData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ JSON PARSE ERROR:', parseError.message);
      console.error('   Raw text was:', responseText);
      extractedData = { items: [] };
    }

    // Ensure items array exists
    if (!extractedData.items || !Array.isArray(extractedData.items)) {
      extractedData.items = [];
    }

    // Verify and correct unit prices using ext price
    console.log('\n🔍 PRICE VERIFICATION (using ext price):');
    extractedData.items = extractedData.items.map((item, index) => {
      const qty = item.quantity || 1;
      const readUnitPrice = item.unitPrice;
      const extPrice = item.extPrice;

      // If we have ext price, verify unit price
      if (extPrice && qty > 0) {
        const calculatedUnitPrice = Math.round((extPrice / qty) * 100) / 100;

        if (Math.abs(calculatedUnitPrice - readUnitPrice) > 0.02) {
          console.log(`   Item ${index + 1}: CORRECTED`);
          console.log(`      Read unit price: $${readUnitPrice}`);
          console.log(`      Ext price: $${extPrice} ÷ ${qty} = $${calculatedUnitPrice}`);
          console.log(`      Using calculated: $${calculatedUnitPrice}`);
          return { ...item, unitPrice: calculatedUnitPrice };
        } else {
          console.log(`   Item ${index + 1}: OK ($${readUnitPrice} × ${qty} = $${extPrice})`);
        }
      } else {
        console.log(`   Item ${index + 1}: No ext price to verify`);
      }

      return item;
    });

    // Log parsed data
    console.log('\n✅ PARSED EXTRACTION RESULT:');
    console.log('─'.repeat(60));
    console.log(`   Dealer: "${extractedData.dealer || '(not found)'}"`);
    console.log(`   Purchase Date: "${extractedData.purchaseDate || '(not found)'}"`);
    console.log(`   Purchase Time: "${extractedData.purchaseTime || '(not found)'}"`);
    console.log(`   Items Found: ${extractedData.items.length}`);
    console.log('');

    if (extractedData.items.length > 0) {
      extractedData.items.forEach((item, index) => {
        console.log(`   Item ${index + 1}:`);
        console.log(`      Description: ${item.description}`);
        console.log(`      Metal: ${item.metal}`);
        console.log(`      Quantity: ${item.quantity}`);
        console.log(`      Unit Price: $${item.unitPrice}`);
        console.log(`      Ext Price: $${item.extPrice || 'N/A'}`);
        console.log(`      Weight: ${item.ozt} ozt`);
        console.log('');
      });
    }
    console.log('─'.repeat(60));

    // Clear image data from memory immediately
    if (req.file) req.file.buffer = null;
    if (req.body && req.body.image) req.body.image = null;

    const totalDuration = Date.now() - startTime;
    console.log(`\n🏁 SCAN COMPLETE in ${totalDuration}ms (API: ${apiDuration}ms)`);
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      END SCAN REQUEST                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    res.json({
      success: true,
      dealer: extractedData.dealer || '',
      purchaseDate: extractedData.purchaseDate || '',
      purchaseTime: extractedData.purchaseTime || '',
      items: extractedData.items,
      itemCount: extractedData.items.length,
      apiSource: apiSource,
      privacyNote: 'Image processed in memory and immediately discarded',
    });

  } catch (error) {
    // Ensure image is cleared even on error
    if (req.file) req.file.buffer = null;
    if (req.body && req.body.image) req.body.image = null;

    console.error('\n❌ SCAN ERROR:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);

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
    version: '2.0.0',
    lastUpdated: '2026-01-28',
    summary: 'Your data is stored on your device by default. Cloud sync is optional and encrypted. We never sell or share your data.',
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
    <p class="last-updated">Last Updated: January 28, 2026</p>

    <div class="summary">
      <strong>TL;DR:</strong> Your portfolio data is stored on your device by default. If you create an account and enable cloud sync, your data is encrypted and stored securely on our servers. We never sell or share your data. Receipt images are deleted immediately after processing.
    </div>

    <h2>Our Privacy Principles</h2>

    <div class="principle">
      <h3><span class="icon">📱</span> Local-First Data Storage</h3>
      <p>
        By default, all your portfolio data—your precious metals holdings, purchase history, and preferences—is stored on your device using encrypted local storage. You can use Stack Tracker Pro without an account, and your data stays entirely on your device.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">☁️</span> Optional Cloud Sync</h3>
      <p>
        Gold and Lifetime subscribers can optionally create an account and enable cloud sync. When enabled, your portfolio data is encrypted and stored on our secure servers to sync across your devices. Cloud sync is entirely optional—you can use all features without it. You can delete your cloud account and all associated data at any time from the app settings.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">📷</span> Memory-Only Image Processing</h3>
      <p>
        When you use our AI receipt scanning feature, images are processed in memory and <strong>deleted immediately</strong> after analysis. No receipts, photos, or scanned images are ever stored on our servers. Only the extracted text data (item descriptions, prices, quantities) is returned to your device.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">📊</span> Portfolio Snapshots</h3>
      <p>
        To power analytics charts and historical tracking, we store daily portfolio value snapshots on our servers. These snapshots contain aggregate values only (total portfolio value, metal totals) and are tied to your anonymous user ID. They do not contain individual item details.
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
        You can use Stack Tracker Pro fully without creating an account (Guest Mode). No email, no password, no personal information required. Your data stays on your device, under your control. Accounts are only needed for optional cloud sync.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">💰</span> Third-Party Services</h3>
      <p>
        We use the following third-party services to power the app:
      </p>
      <p>
        <strong>MetalPriceAPI</strong> &amp; <strong>GoldAPI.io</strong> — Live spot prices. These requests contain no personal data.<br>
        <strong>RevenueCat</strong> — Subscription management. Receives an anonymous user ID only.<br>
        <strong>Supabase</strong> — Cloud database for account sync and portfolio snapshots. Data is stored securely with row-level security.<br>
        <strong>Expo</strong> — Push notifications for price alerts. Receives only a device push token.<br>
        <strong>Apple App Store</strong> — Payment processing. We never see your payment details.
      </p>
    </div>

    <h2>Data We Collect</h2>
    <div class="principle">
      <h3><span class="icon">📋</span> What We Store</h3>
      <p>
        ✅ Anonymous user ID (for subscription and sync features)<br>
        ✅ Portfolio snapshots for analytics (aggregate values only)<br>
        ✅ Cloud sync data if you opt in (encrypted portfolio data)<br>
        ✅ Price alert preferences (target prices and notification settings)
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🚫</span> What We Never Collect</h3>
      <p>
        ❌ Receipt images or scanned documents (deleted immediately)<br>
        ❌ Personal information (name, address, phone number)<br>
        ❌ Location data or device identifiers<br>
        ❌ Usage analytics or behavioral tracking<br>
        ❌ Payment details (handled by Apple/Google)
      </p>
    </div>

    <h2>Data Sharing</h2>
    <div class="principle">
      <h3><span class="icon">🔒</span> We Never Sell Your Data</h3>
      <p>
        Your data is never sold, shared with advertisers, or provided to third parties for marketing purposes. Data is only shared with service providers essential to app functionality (payment processing, price data APIs) and only the minimum data necessary.
      </p>
    </div>

    <h2>Your Rights</h2>
    <div class="principle">
      <h3><span class="icon">🛡️</span> Complete Control</h3>
      <p>
        You can export your data anytime as CSV. If you have a cloud account, you can delete your account and all server-side data from Settings → Danger Zone. Guest mode users have all data stored locally—simply deleting the app removes all data. You can also reset all data from within the app settings.
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
    <p class="last-updated">Last Updated: January 28, 2026</p>

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
      <li>Verify the accuracy of all portfolio data, including AI-scanned receipt results — you are solely responsible for ensuring your holdings data is correct</li>
      <li>Not attempt to reverse engineer, modify, or exploit the App</li>
      <li>Not use the App to store or process illegal content</li>
      <li>Maintain the security of your device and account credentials</li>
    </ul>

    <h2>4. Data and Privacy</h2>
    <p>
      Your portfolio data is stored locally on your device by default. If you create an account and enable cloud sync, your data is encrypted and stored on our servers. Receipt images are deleted immediately after AI processing. For full details, please review our <a href="/privacy">Privacy Policy</a>.
    </p>

    <h2>5. Subscriptions and Payments</h2>
    <p>
      Stack Tracker Pro offers a free tier and premium "Gold" subscriptions with the following pricing:
    </p>
    <ul>
      <li><strong>Gold Monthly:</strong> $4.99/month — auto-renews monthly</li>
      <li><strong>Gold Yearly:</strong> $39.99/year — auto-renews annually</li>
      <li><strong>Lifetime:</strong> $79.99 — one-time purchase, never expires</li>
    </ul>
    <p>
      All subscriptions are processed through the Apple App Store. Subscription terms:
    </p>
    <ul>
      <li>Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period</li>
      <li>Your Apple ID account will be charged for renewal within 24 hours prior to the end of the current period</li>
      <li>You can manage and cancel subscriptions in your device's Settings → Apple ID → Subscriptions</li>
      <li>Refunds are handled according to Apple App Store policies</li>
      <li>Free trial periods, if offered, will automatically convert to a paid subscription unless cancelled</li>
    </ul>

    <h2>6. Disclaimer of Warranties</h2>
    <p>
      The App is provided <strong>"as is" and "as available"</strong> without warranties of any kind, whether express or implied. We do not guarantee:
    </p>
    <ul>
      <li>The accuracy, completeness, or timeliness of spot prices (prices are sourced from third-party APIs and may be delayed)</li>
      <li>The accuracy of AI receipt scanning results — always verify scanned data before saving</li>
      <li>Uninterrupted or error-free operation of the App</li>
      <li>That portfolio valuations reflect actual market value of your holdings</li>
    </ul>
    <p>
      <strong>Stack Tracker Pro is not a financial advisor, broker, or dealer.</strong> The App is for personal informational and tracking purposes only. It does not provide investment advice, tax guidance, or financial recommendations. Always verify important financial information independently and consult qualified professionals for financial decisions.
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
// PUSH NOTIFICATIONS API ENDPOINTS
// ============================================

/**
 * Register or update a push token
 * POST /api/push-token/register
 */
app.post('/api/push-token/register', validate('pushTokenRegister'), async (req, res) => {
  try {
    const { expo_push_token, platform, app_version, user_id, device_id } = req.body;

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    // Check if token already exists
    const { data: existing, error: checkError } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('expo_push_token', expo_push_token)
      .single();

    if (existing) {
      // Update existing token
      const { error: updateError } = await supabase
        .from('push_tokens')
        .update({
          user_id: user_id || null,
          device_id: device_id || null,
          platform: platform || null,
          app_version: app_version || null,
          last_active: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating push token:', updateError);
        return res.status(500).json({ success: false, error: updateError.message });
      }

      console.log(`✅ Updated push token: ${expo_push_token.substring(0, 30)}...`);
      return res.json({ success: true, action: 'updated', id: existing.id });
    }

    // Insert new token
    const { data: inserted, error: insertError } = await supabase
      .from('push_tokens')
      .insert({
        user_id: user_id || null,
        device_id: device_id || null,
        expo_push_token,
        platform: platform || null,
        app_version: app_version || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting push token:', insertError);
      return res.status(500).json({ success: false, error: insertError.message });
    }

    console.log(`✅ Registered new push token: ${expo_push_token.substring(0, 30)}...`);
    res.json({ success: true, action: 'created', id: inserted.id });
  } catch (error) {
    console.error('Error in /api/push-token/register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a push token
 */
app.delete('/api/push-token/delete', validate('pushTokenDelete'), async (req, res) => {
  try {
    const { expo_push_token } = req.body;

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('expo_push_token', expo_push_token);

    if (error) {
      console.error('Error deleting push token:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Deleted push token: ${expo_push_token.substring(0, 30)}...`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/push-token/delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Sync price alerts from mobile app
 */
app.post('/api/price-alerts/sync', validate('priceAlertsSync'), async (req, res) => {
  try {
    const { alerts, user_id, device_id } = req.body;

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const results = [];

    for (const alert of alerts) {
      try {
        const { data: existing } = await supabase
          .from('price_alerts')
          .select('id')
          .eq('id', alert.id)
          .single();

        if (existing) {
          const { error: updateError } = await supabase
            .from('price_alerts')
            .update({
              metal: alert.metal,
              target_price: alert.target_price,
              direction: alert.direction,
              enabled: alert.enabled !== false,
            })
            .eq('id', alert.id);

          if (updateError) {
            results.push({ id: alert.id, success: false, error: updateError.message });
          } else {
            results.push({ id: alert.id, success: true, action: 'updated' });
          }
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from('price_alerts')
            .insert({
              id: alert.id,
              user_id: user_id || null,
              device_id: device_id || null,
              metal: alert.metal,
              target_price: alert.target_price,
              direction: alert.direction,
              enabled: alert.enabled !== false,
            })
            .select()
            .single();

          if (insertError) {
            results.push({ id: alert.id, success: false, error: insertError.message });
          } else {
            results.push({ id: inserted.id, success: true, action: 'created' });
          }
        }
      } catch (alertError) {
        results.push({ id: alert.id, success: false, error: alertError.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Synced ${successCount}/${alerts.length} price alerts`);

    res.json({ success: true, results, total: alerts.length, synced: successCount });
  } catch (error) {
    console.error('Error in /api/price-alerts/sync:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a price alert
 */
app.delete('/api/price-alerts/delete', validate('priceAlertDelete'), async (req, res) => {
  try {
    const { alert_id } = req.body;

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', alert_id);

    if (error) {
      console.error('Error deleting price alert:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Deleted price alert: ${alert_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/price-alerts/delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get user's price alerts
 */
app.get('/api/price-alerts', async (req, res) => {
  try {
    const { user_id, device_id } = req.query;

    if (!user_id && !device_id) {
      return res.status(400).json({ success: false, error: 'Either user_id or device_id is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    let query = supabase.from('price_alerts').select('*');

    if (user_id) {
      query = query.eq('user_id', user_id);
    } else {
      query = query.eq('device_id', device_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching price alerts:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, alerts: data || [] });
  } catch (error) {
    console.error('Error in /api/price-alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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
    console.log('🔔 Price Alerts: ENABLED (checking every 5 min)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Start price alert checker (runs every 5 minutes)
    startPriceAlertChecker(() => {
      // Ensure we have fresh prices before checking
      const cacheAge = spotPriceCache.lastUpdated
        ? (Date.now() - spotPriceCache.lastUpdated.getTime()) / 1000 / 60
        : Infinity;

      if (cacheAge > 10) {
        return fetchLiveSpotPrices().then(() => spotPriceCache.prices);
      }

      return Promise.resolve(spotPriceCache.prices);
    });

    // Run initial alert check after 1 minute (let server stabilize)
    setTimeout(async () => {
      try {
        const result = await checkAlerts(spotPriceCache.prices);
        console.log(`🔔 Initial alert check: ${result.triggered}/${result.checked} triggered`);
      } catch (error) {
        console.error('❌ Initial alert check error:', error.message);
      }
    }, 60 * 1000);
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
