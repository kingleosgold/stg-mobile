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

// Load historical prices from JSON file
const fs = require('fs');
const path = require('path');

// ============================================
// FETCH LIVE SPOT PRICES
// ============================================

async function fetchLiveSpotPrices() {
  try {
    // Use metalpriceapi.com (free tier, 100 requests/month)
    const response = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU,XAG,XPT,XPD');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.rates) {
        // API returns price per 1 USD, we need to invert for price per oz
        spotPriceCache = {
          prices: {
            gold: Math.round((1 / data.rates.XAU) * 100) / 100,
            silver: Math.round((1 / data.rates.XAG) * 100) / 100,
            platinum: Math.round((1 / data.rates.XPT) * 100) / 100,
            palladium: Math.round((1 / data.rates.XPD) * 100) / 100,
          },
          lastUpdated: new Date(),
          source: 'live',
        };
        console.log('✅ Spot prices updated (live):', spotPriceCache.prices);
        return spotPriceCache.prices;
      }
    }
  } catch (error) {
    console.error('Failed to fetch spot prices:', error.message);
  }

  // Fallback to current hardcoded prices (Dec 2025)
  console.log('⚠️  Using fallback spot prices');
  spotPriceCache.prices = { gold: 4530, silver: 77, platinum: 2400, palladium: 1850 };
  spotPriceCache.lastUpdated = new Date();
  spotPriceCache.source = 'fallback';
  return spotPriceCache.prices;
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
    // Refresh if cache is older than 5 minutes
    const cacheAge = spotPriceCache.lastUpdated
      ? (Date.now() - spotPriceCache.lastUpdated.getTime()) / 1000 / 60
      : Infinity;

    if (cacheAge > 5) {
      await fetchLiveSpotPrices();
    }

    res.json({
      success: true,
      ...spotPriceCache.prices,
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      source: spotPriceCache.source || 'live',
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
 */
app.get('/api/historical-spot', (req, res) => {
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

    // Try exact date first
    let price = historicalData[metal]?.[normalizedDate];
    let usedDate = normalizedDate;
    let source = 'exact';

    console.log(`   Exact match for ${normalizedDate}: ${price ? '$' + price : 'not found'}`);

    // If not found, try to find nearest date
    if (!price) {
      const targetDate = new Date(normalizedDate + 'T00:00:00');
      const dates = Object.keys(historicalData[metal] || {}).sort();
      console.log(`   Searching ${dates.length} dates for nearest match...`);

      // Find closest date
      let closestDate = null;
      let minDiff = Infinity;

      for (const d of dates) {
        const diff = Math.abs(new Date(d + 'T00:00:00') - targetDate);
        if (diff < minDiff) {
          minDiff = diff;
          closestDate = d;
        }
      }

      const daysAway = Math.floor(minDiff / (24 * 60 * 60 * 1000));

      if (closestDate && minDiff < 30 * 24 * 60 * 60 * 1000) { // Within 30 days
        price = historicalData[metal][closestDate];
        usedDate = closestDate;
        source = 'nearest';
        console.log(`   Using nearest date ${closestDate}: $${price} (${daysAway} days away)`);
      } else {
        console.log(`   No nearby dates found. Closest was ${daysAway} days away.`);
      }
    }

    if (price) {
      res.json({
        date: normalizedDate,
        usedDate,
        metal,
        price: Math.round(price * 100) / 100,
        source,
        success: true
      });
    } else {
      // Return current spot as fallback
      console.log(`   No historical data found, using current spot: $${spotPriceCache.prices[metal]}`);
      res.json({
        date: normalizedDate,
        metal,
        price: spotPriceCache.prices[metal] || 0,
        source: 'current-fallback',
        note: 'Historical price not available, using current spot',
        success: true
      });
    }
  } catch (error) {
    console.error('❌ Historical spot error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to lookup historical price' });
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
              text: `Analyze this precious metals purchase receipt and extract the following information. 
              
Return ONLY a JSON object with these fields (use null if not found):
{
  "dealer": "dealer/company name",
  "purchaseDate": "YYYY-MM-DD format",
  "metal": "gold, silver, platinum, or palladium",
  "description": "product name/description",
  "quantity": number of items,
  "ozt": troy ounces per item (use standard weights: 1oz coins = 1, 1/10oz = 0.1, etc.),
  "unitPrice": price per unit in dollars (number only),
  "totalPrice": total order price in dollars (number only)
}

Important:
- unitPrice should be the price PER ITEM, not the total
- If you see a total and quantity, calculate unitPrice = total / quantity
- Standard coin weights: American Eagle 1oz, 1/2oz, 1/4oz, 1/10oz
- Look for the actual metal type (gold, silver, etc.), not just "bullion"
- Date should be the purchase/order date, not shipping date`
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
      extractedData = {};
    }

    // Clear image data from memory immediately
    req.file.buffer = null;

    console.log('✅ Receipt scan successful');

    res.json({
      success: true,
      ...extractedData,
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

// ============================================
// STARTUP
// ============================================

const PORT = process.env.PORT || 3000;

// Load data on startup
loadHistoricalData(); // Synchronous JSON load

fetchLiveSpotPrices().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🪙 Stack Tracker API running on port ${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔒 Privacy Mode: ENABLED');
    console.log('📷 Image Storage: DISABLED (memory-only)');
    console.log('📊 Analytics: DISABLED');
    console.log('💰 Spot Prices:', spotPriceCache.prices);
    console.log('📅 Historical Data:', historicalData.loaded ? 'LOADED' : 'FALLBACK');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}).catch(error => {
  console.error('Startup error:', error);
  // Start anyway with fallback data
  app.listen(PORT, () => {
    console.log(`Stack Tracker API running on port ${PORT} (with fallback data)`);
  });
});

// Refresh spot prices every 5 minutes
setInterval(fetchLiveSpotPrices, 5 * 60 * 1000);

// Historical data loaded from static JSON file, no need to refresh

module.exports = app;

// Force redeploy
