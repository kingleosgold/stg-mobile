/**
 * Stack Tracker Pro - Gold & Silver Price Fetcher
 *
 * Priority order:
 * 1. MetalPriceAPI (Basic plan: 10,000 requests/month) - live
 * 2. GoldAPI.io (Fallback if MetalPriceAPI fails) - live
 * 3. latest-prices.json (last cached successful fetch from APIs)
 * 4. Static hardcoded prices (absolute last resort)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { findClosestLoggedPrice } = require('../services/priceLogger');

// Store yesterday's closing prices for calculating change when using MetalPriceAPI
let previousDayPrices = {
  gold: null,
  silver: null,
  date: null, // YYYY-MM-DD format
};

// Store last successful API prices (for fallback before hardcoded values)
let latestCachedPrices = null;

// Load previous day prices from file on startup
const PREV_PRICES_FILE = path.join(__dirname, '..', 'data', 'previous-day-prices.json');
const LATEST_PRICES_FILE = path.join(__dirname, '..', 'data', 'latest-prices.json');

try {
  if (fs.existsSync(PREV_PRICES_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PREV_PRICES_FILE, 'utf8'));
    previousDayPrices = saved;
    console.log('📊 Loaded previous day prices:', previousDayPrices);
  }
} catch (err) {
  console.log('⚠️  Could not load previous day prices:', err.message);
}

// Load latest cached prices on startup
try {
  if (fs.existsSync(LATEST_PRICES_FILE)) {
    latestCachedPrices = JSON.parse(fs.readFileSync(LATEST_PRICES_FILE, 'utf8'));
    console.log('💾 Loaded latest cached prices:', latestCachedPrices);
  }
} catch (err) {
  console.log('⚠️  Could not load latest cached prices:', err.message);
}

/**
 * Update the stored "previous day" prices for tomorrow's change calculation
 * This saves the CURRENT prices to be used as yesterday's baseline tomorrow
 * We track lastSavedDate to only update once per day (at end of day)
 */
let lastSavedDate = null;

function savePreviousDayPrices(gold, silver) {
  const today = new Date().toISOString().split('T')[0];

  // Only save once per day, and only if we have valid prices
  // This captures the last price of the day for tomorrow's comparison
  if (lastSavedDate === today || !gold || !silver) {
    return;
  }

  // Mark that we've processed today (will save at end of day via the file)
  lastSavedDate = today;

  // If this is a NEW day and we have stored prices, those are yesterday's prices
  // We should NOT overwrite them until end of day
  // Instead, schedule the save for later (or just save current as "today's baseline")

  // For simplicity: save current prices with today's date
  // Tomorrow, when date changes, these become "yesterday's" prices
  const dataToSave = { gold, silver, date: today };

  try {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(PREV_PRICES_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('💾 Saved today\'s prices for tomorrow\'s change calc:', dataToSave);
  } catch (err) {
    console.log('⚠️  Could not save prices:', err.message);
  }
}

/**
 * Save the latest successful API prices to file for use as fallback
 * This is called after every successful MetalPriceAPI or GoldAPI fetch
 */
function saveLatestPrices(prices) {
  if (!prices.gold || !prices.silver) {
    return;
  }

  const dataToSave = {
    gold: prices.gold,
    silver: prices.silver,
    platinum: prices.platinum,
    palladium: prices.palladium,
    timestamp: prices.timestamp,
    source: prices.source,
    savedAt: new Date().toISOString(),
  };

  try {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(LATEST_PRICES_FILE, JSON.stringify(dataToSave, null, 2));
    latestCachedPrices = dataToSave;
    console.log('💾 Saved latest prices to cache:', { gold: dataToSave.gold, silver: dataToSave.silver, source: dataToSave.source });
  } catch (err) {
    console.log('⚠️  Could not save latest prices:', err.message);
  }
}

/**
 * Get latest cached prices from file (used as fallback before hardcoded)
 */
function getLatestCachedPrices() {
  return latestCachedPrices;
}

/**
 * Get the last trading day (skips weekends)
 * If today is Monday, returns Friday
 * If today is Sunday, returns Friday
 * Otherwise returns yesterday
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getLastTradingDay() {
  const today = new Date();
  let daysBack = 1;
  
  // If today is Monday (1), go back 3 days to Friday
  // If today is Sunday (0), go back 2 days to Friday
  if (today.getDay() === 0) {
    daysBack = 2; // Sunday → Friday
  } else if (today.getDay() === 1) {
    daysBack = 3; // Monday → Friday
  }
  
  const lastTrading = new Date(today);
  lastTrading.setDate(today.getDate() - daysBack);
  
  return lastTrading.toISOString().split('T')[0];
}

/**
 * Get yesterday's prices for change calculation
 * Returns the stored prices only if they're from a PREVIOUS day
 * Falls back to price_log database if local file doesn't have data
 * Handles weekends by looking back to Friday on Mondays
 */
async function getYesterdayPrices() {
  const today = new Date().toISOString().split('T')[0];

  // First check local file
  if (previousDayPrices.date && previousDayPrices.date < today) {
    return previousDayPrices;
  }

  // Fallback: check price_log database for last trading day's prices
  try {
    const lastTradingDay = getLastTradingDay();
    console.log(`📊 Looking for last trading day prices: ${lastTradingDay}`);

    const loggedPrice = await findClosestLoggedPrice(lastTradingDay, '23:59'); // Get end of day price
    if (loggedPrice && loggedPrice.gold && loggedPrice.silver) {
      console.log(`📊 Using price_log for last trading day (${lastTradingDay}): Gold $${loggedPrice.gold}, Silver $${loggedPrice.silver}`);
      return {
        gold: loggedPrice.gold,
        silver: loggedPrice.silver,
        date: lastTradingDay
      };
    }
  } catch (err) {
    console.log('⚠️  Could not fetch last trading day prices from price_log:', err.message);
  }

  return null;
}

/**
 * Fetch gold and silver spot prices
 * @returns {Promise<{gold: number, silver: number, platinum: number, palladium: number, timestamp: string, source: string, change: object}>}
 */
async function scrapeGoldSilverPrices() {
  console.log('🔍 Fetching live spot prices...');

  // PRIORITY 1: Try MetalPriceAPI (Basic plan - 10,000/month)
  try {
    const METAL_API_KEY = process.env.METAL_PRICE_API_KEY;

    if (!METAL_API_KEY) {
      console.log('⚠️  No METAL_PRICE_API_KEY found, skipping MetalPriceAPI');
      throw new Error('No MetalPriceAPI key configured');
    }

    console.log('📡 Attempting MetalPriceAPI (primary source)...');

    const response = await axios.get(`https://api.metalpriceapi.com/v1/latest?api_key=${METAL_API_KEY}&base=USD&currencies=XAU,XAG,XPT,XPD`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StackTrackerBot/1.0)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    const data = response.data;

    console.log('📊 MetalPriceAPI Response:', JSON.stringify(data).substring(0, 200));

    // metalpriceapi returns: { rates: { XAU: 0.000377, XAG: 0.0323, ... } }
    // Rates are inverse (USD per gram), need to convert
    let goldPrice, silverPrice, platinumPrice, palladiumPrice;

    if (data.rates) {
      // Invert rates to get price per oz
      goldPrice = data.rates.XAU ? Math.round((1 / data.rates.XAU) * 100) / 100 : null;
      silverPrice = data.rates.XAG ? Math.round((1 / data.rates.XAG) * 100) / 100 : null;
      platinumPrice = data.rates.XPT ? Math.round((1 / data.rates.XPT) * 100) / 100 : 2700;
      palladiumPrice = data.rates.XPD ? Math.round((1 / data.rates.XPD) * 100) / 100 : 2000;
    } else {
      // Direct format (if available)
      goldPrice = data.gold || data.XAU || data.xau;
      silverPrice = data.silver || data.XAG || data.xag;
      platinumPrice = data.platinum || data.XPT || data.xpt || 2700;
      palladiumPrice = data.palladium || data.XPD || data.xpd || 2000;
    }

    if (goldPrice && silverPrice) {
      // Calculate change from yesterday's prices (if available)
      let changeData = { gold: {}, silver: {}, source: 'unavailable' };
      const yesterdayPrices = await getYesterdayPrices();

      if (yesterdayPrices) {
        const goldChange = goldPrice - yesterdayPrices.gold;
        const goldChangePercent = (goldChange / yesterdayPrices.gold) * 100;
        const silverChange = silverPrice - yesterdayPrices.silver;
        const silverChangePercent = (silverChange / yesterdayPrices.silver) * 100;

        changeData = {
          gold: {
            amount: Math.round(goldChange * 100) / 100,
            percent: Math.round(goldChangePercent * 100) / 100,
            prevClose: yesterdayPrices.gold,
          },
          silver: {
            amount: Math.round(silverChange * 100) / 100,
            percent: Math.round(silverChangePercent * 100) / 100,
            prevClose: yesterdayPrices.silver,
          },
          source: 'calculated',
        };
        console.log(`📈 Calculated change - Gold: ${goldChange >= 0 ? '+' : ''}$${changeData.gold.amount} (${changeData.gold.percent}%)`);
        console.log(`📈 Calculated change - Silver: ${silverChange >= 0 ? '+' : ''}$${changeData.silver.amount} (${changeData.silver.percent}%)`);
      } else {
        console.log('📊 No previous day prices available for change calculation');
      }

      // Save current prices for tomorrow's change calculation
      savePreviousDayPrices(goldPrice, silverPrice);

      const result = {
        gold: Math.round(goldPrice * 100) / 100,
        silver: Math.round(silverPrice * 100) / 100,
        platinum: Math.round(platinumPrice * 100) / 100,
        palladium: Math.round(palladiumPrice * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'metalpriceapi',
        change: changeData,
      };

      console.log(`💰 Gold Spot: $${result.gold}/oz (MetalPriceAPI)`);
      console.log(`🥈 Silver Spot: $${result.silver}/oz (MetalPriceAPI)`);
      console.log('✅ Successfully fetched prices via MetalPriceAPI (primary source)');

      // Save to cache for fallback use
      saveLatestPrices(result);

      return result;
    }
  } catch (metalError) {
    console.warn('⚠️  MetalPriceAPI failed:', metalError.message);
    console.log('   Falling back to GoldAPI.io...');
  }

  // PRIORITY 2: Try GoldAPI.io (Fallback) - includes change data directly
  try {
    const API_KEY = process.env.GOLD_API_KEY;

    if (!API_KEY) {
      console.log('⚠️  No GOLD_API_KEY found, skipping GoldAPI.io');
      throw new Error('No GoldAPI key configured');
    }

    console.log('📡 Attempting GoldAPI.io (fallback)...');

    const [goldRes, silverRes] = await Promise.all([
      axios.get('https://www.goldapi.io/api/XAU/USD', {
        headers: {
          'x-access-token': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
      }),
      axios.get('https://www.goldapi.io/api/XAG/USD', {
        headers: {
          'x-access-token': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
      }),
    ]);

    console.log('📊 GoldAPI.io Gold Response:', JSON.stringify(goldRes.data).substring(0, 300));
    console.log('📊 GoldAPI.io Silver Response:', JSON.stringify(silverRes.data).substring(0, 300));

    if (goldRes.data && silverRes.data && goldRes.data.price && silverRes.data.price) {
      // Extract change data from GoldAPI.io response
      // Fields: ch (change amount), chp (change percent), prev_close_price, open_price
      const changeData = {
        gold: {
          amount: goldRes.data.ch ? Math.round(goldRes.data.ch * 100) / 100 : null,
          percent: goldRes.data.chp ? Math.round(goldRes.data.chp * 100) / 100 : null,
          prevClose: goldRes.data.prev_close_price ? Math.round(goldRes.data.prev_close_price * 100) / 100 : null,
          openPrice: goldRes.data.open_price ? Math.round(goldRes.data.open_price * 100) / 100 : null,
        },
        silver: {
          amount: silverRes.data.ch ? Math.round(silverRes.data.ch * 100) / 100 : null,
          percent: silverRes.data.chp ? Math.round(silverRes.data.chp * 100) / 100 : null,
          prevClose: silverRes.data.prev_close_price ? Math.round(silverRes.data.prev_close_price * 100) / 100 : null,
          openPrice: silverRes.data.open_price ? Math.round(silverRes.data.open_price * 100) / 100 : null,
        },
        source: 'goldapi-io',
      };

      if (changeData.gold.amount !== null) {
        console.log(`📈 GoldAPI change - Gold: ${changeData.gold.amount >= 0 ? '+' : ''}$${changeData.gold.amount} (${changeData.gold.percent}%)`);
      }
      if (changeData.silver.amount !== null) {
        console.log(`📈 GoldAPI change - Silver: ${changeData.silver.amount >= 0 ? '+' : ''}$${changeData.silver.amount} (${changeData.silver.percent}%)`);
      }

      // Save prices for MetalPriceAPI fallback calculation
      savePreviousDayPrices(goldRes.data.price, silverRes.data.price);

      const result = {
        gold: Math.round(goldRes.data.price * 100) / 100,
        silver: Math.round(silverRes.data.price * 100) / 100,
        platinum: 2700, // Not available in free/paid tier
        palladium: 2000, // Not available in free/paid tier
        timestamp: new Date().toISOString(),
        source: 'goldapi-io',
        change: changeData,
      };

      console.log(`💰 Gold Spot: $${result.gold}/oz (GoldAPI.io)`);
      console.log(`🥈 Silver Spot: $${result.silver}/oz (GoldAPI.io)`);
      console.log('✅ Successfully fetched prices via GoldAPI.io (fallback)');

      // Save to cache for fallback use
      saveLatestPrices(result);

      return result;
    }
  } catch (goldapiError) {
    console.warn('⚠️  GoldAPI.io failed:', goldapiError.message);
    console.log('   Falling back to cached/static prices...');
  }

  // PRIORITY 3: Check for cached prices from last successful API fetch
  const cached = getLatestCachedPrices();
  if (cached && cached.gold && cached.silver) {
    console.log('📦 Using cached prices from last successful fetch');
    console.log(`   Cached at: ${cached.savedAt} (source: ${cached.source})`);
    return {
      gold: cached.gold,
      silver: cached.silver,
      platinum: cached.platinum || 2700,
      palladium: cached.palladium || 2000,
      timestamp: new Date().toISOString(),
      source: 'cached-fallback',
      change: { gold: {}, silver: {}, source: 'unavailable' },
    };
  }

  // PRIORITY 4: Static fallback prices (absolute last resort)
  console.log('⚠️  All APIs failed and no cache available - using hardcoded fallback prices');
  return {
    gold: 5100,
    silver: 107,
    platinum: 2700,
    palladium: 2000,
    timestamp: new Date().toISOString(),
    source: 'static-fallback',
    change: { gold: {}, silver: {}, source: 'unavailable' },
  };
}

/**
 * Fetch historical spot prices for a specific date
 * Uses MetalPriceAPI historical endpoint
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<{gold: number, silver: number, date: string, source: string} | null>}
 */
async function fetchHistoricalPrices(date) {
  const METAL_API_KEY = process.env.METAL_PRICE_API_KEY;

  if (!METAL_API_KEY) {
    console.log('⚠️  No METAL_PRICE_API_KEY found, cannot fetch historical prices');
    return null;
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.log(`❌ Invalid date format: ${date} (expected YYYY-MM-DD)`);
    return null;
  }

  try {
    console.log(`📅 Fetching historical prices for ${date} from MetalPriceAPI...`);

    const response = await axios.get(
      `https://api.metalpriceapi.com/v1/${date}?api_key=${METAL_API_KEY}&base=USD&currencies=XAU,XAG`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; StackTrackerBot/1.0)',
          'Accept': 'application/json',
        },
        timeout: 10000,
      }
    );

    const data = response.data;

    console.log(`📊 MetalPriceAPI Historical Response for ${date}:`, JSON.stringify(data).substring(0, 300));

    if (!data.success) {
      console.log(`❌ MetalPriceAPI returned success=false for ${date}:`, data.error || 'Unknown error');
      return null;
    }

    if (!data.rates || !data.rates.XAU || !data.rates.XAG) {
      console.log(`❌ Missing rate data in response for ${date}`);
      return null;
    }

    // MetalPriceAPI returns inverse rates (USD per 1 unit of metal)
    // XAU and XAG are per troy ounce, so we invert to get price per oz
    const goldPrice = Math.round((1 / data.rates.XAU) * 100) / 100;
    const silverPrice = Math.round((1 / data.rates.XAG) * 100) / 100;

    console.log(`✅ Historical prices for ${date}: Gold $${goldPrice}, Silver $${silverPrice}`);

    return {
      gold: goldPrice,
      silver: silverPrice,
      date: date,
      source: 'metalpriceapi-historical',
    };
  } catch (error) {
    if (error.response) {
      console.error(`❌ MetalPriceAPI historical request failed for ${date}:`, error.response.status, error.response.data);
    } else {
      console.error(`❌ MetalPriceAPI historical request error for ${date}:`, error.message);
    }
    return null;
  }
}

module.exports = {
  scrapeGoldSilverPrices,
  fetchHistoricalPrices,
};
