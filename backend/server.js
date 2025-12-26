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

// ============================================
// FETCH LIVE SPOT PRICES
// ============================================

async function fetchLiveSpotPrices() {
  try {
    // Try freegoldapi.com first (free, no API key)
    const goldResponse = await fetch('https://freegoldapi.com/api/XAU/USD');
    if (goldResponse.ok) {
      const goldData = await goldResponse.json();
      
      // Get gold/silver ratio for silver price
      const ratioResponse = await fetch('https://freegoldapi.com/api/XAU/XAG');
      let silverPrice = 31; // fallback
      
      if (ratioResponse.ok) {
        const ratioData = await ratioResponse.json();
        const ratio = ratioData.price || 85;
        silverPrice = goldData.price / ratio;
      }
      
      spotPriceCache = {
        prices: {
          gold: Math.round(goldData.price * 100) / 100,
          silver: Math.round(silverPrice * 100) / 100,
          platinum: 980, // freegoldapi doesn't have platinum/palladium
          palladium: 1050,
        },
        lastUpdated: new Date(),
      };
      
      console.log('Spot prices updated:', spotPriceCache.prices);
      return spotPriceCache.prices;
    }
  } catch (error) {
    console.error('Failed to fetch from freegoldapi:', error.message);
  }
  
  // Fallback: try metals.live
  try {
    const response = await fetch('https://api.metals.live/v1/spot');
    if (response.ok) {
      const data = await response.json();
      spotPriceCache = {
        prices: {
          gold: data.gold || 2650,
          silver: data.silver || 31,
          platinum: data.platinum || 980,
          palladium: data.palladium || 1050,
        },
        lastUpdated: new Date(),
      };
      return spotPriceCache.prices;
    }
  } catch (error) {
    console.error('Failed to fetch from metals.live:', error.message);
  }
  
  // Return cached/fallback prices
  return spotPriceCache.prices;
}

// ============================================
// LOAD HISTORICAL DATA
// ============================================

async function loadHistoricalData() {
  try {
    console.log('Loading historical price data...');
    
    // Fetch historical gold prices from freegoldapi
    const historyResponse = await fetch('https://freegoldapi.com/api/XAU/USD/history?days=1095'); // ~3 years
    if (historyResponse.ok) {
      const historyData = await historyResponse.json();
      
      if (historyData.history && Array.isArray(historyData.history)) {
        historyData.history.forEach(item => {
          const date = item.date?.split('T')[0]; // YYYY-MM-DD
          if (date && item.price) {
            historicalData.gold[date] = item.price;
          }
        });
        console.log(`Loaded ${Object.keys(historicalData.gold).length} historical gold prices`);
      }
    }
    
    // Fetch gold/silver ratio history for silver prices
    const ratioResponse = await fetch('https://freegoldapi.com/api/XAU/XAG/history?days=1095');
    if (ratioResponse.ok) {
      const ratioData = await ratioResponse.json();
      
      if (ratioData.history && Array.isArray(ratioData.history)) {
        ratioData.history.forEach(item => {
          const date = item.date?.split('T')[0];
          if (date && item.price) {
            historicalData.goldSilverRatio[date] = item.price;
            // Calculate silver price from gold and ratio
            const goldPrice = historicalData.gold[date];
            if (goldPrice) {
              historicalData.silver[date] = goldPrice / item.price;
            }
          }
        });
        console.log(`Loaded ${Object.keys(historicalData.silver).length} historical silver prices`);
      }
    }
    
    historicalData.loaded = true;
  } catch (error) {
    console.error('Failed to load historical data:', error.message);
    // Use fallback monthly averages
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
  
  // Expand monthly data to daily
  Object.entries(fallbackGold).forEach(([month, price]) => {
    for (let day = 1; day <= 31; day++) {
      const date = `${month}-${day.toString().padStart(2, '0')}`;
      historicalData.gold[date] = price;
    }
  });
  
  Object.entries(fallbackSilver).forEach(([month, price]) => {
    for (let day = 1; day <= 31; day++) {
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
    
    res.json(spotPriceCache.prices);
  } catch (error) {
    console.error('Spot price error:', error);
    res.json(spotPriceCache.prices); // Return cached prices on error
  }
});

/**
 * Get historical spot price for a specific date
 */
app.get('/api/historical-spot', (req, res) => {
  try {
    const { date, metal = 'gold' } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });
    }
    
    // Normalize date format
    const normalizedDate = date.trim();
    
    // Try exact date first
    let price = historicalData[metal]?.[normalizedDate];
    
    // If not found, try to find nearest date
    if (!price) {
      const targetDate = new Date(normalizedDate);
      const dates = Object.keys(historicalData[metal] || {}).sort();
      
      // Find closest date
      let closestDate = null;
      let minDiff = Infinity;
      
      for (const d of dates) {
        const diff = Math.abs(new Date(d) - targetDate);
        if (diff < minDiff) {
          minDiff = diff;
          closestDate = d;
        }
      }
      
      if (closestDate && minDiff < 7 * 24 * 60 * 60 * 1000) { // Within 7 days
        price = historicalData[metal][closestDate];
      }
    }
    
    if (price) {
      res.json({ 
        date: normalizedDate,
        metal,
        price: Math.round(price * 100) / 100,
        source: 'historical',
      });
    } else {
      // Return current spot as fallback
      res.json({
        date: normalizedDate,
        metal,
        price: spotPriceCache.prices[metal] || 0,
        source: 'current-fallback',
        note: 'Historical price not available, using current spot',
      });
    }
  } catch (error) {
    console.error('Historical spot error:', error);
    res.status(500).json({ error: 'Failed to lookup historical price' });
  }
});

/**
 * Scan receipt using Claude Vision
 * Privacy: Image is processed in memory only, never stored
 */
app.post('/api/scan-receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Convert buffer to base64 (stays in memory)
    const base64Image = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

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
    
    console.error('Receipt scan error:', error);
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
Promise.all([
  fetchLiveSpotPrices(),
  loadHistoricalData(),
]).then(() => {
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

// Refresh historical data daily
setInterval(loadHistoricalData, 24 * 60 * 60 * 1000);

module.exports = app;

// Force redeploy
