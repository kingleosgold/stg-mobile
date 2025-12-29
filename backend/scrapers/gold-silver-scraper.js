/**
 * Stack Tracker Pro - Gold & Silver Price Fetcher
 *
 * Priority order:
 * 1. GoldAPI.io (Paid tier: 10,000 requests/month)
 * 2. MetalPriceAPI (Fallback if GoldAPI fails)
 * 3. Static prices (Final fallback)
 */

const axios = require('axios');

/**
 * Fetch gold and silver spot prices
 * @returns {Promise<{gold: number, silver: number, platinum: number, palladium: number, timestamp: string, source: string}>}
 */
async function scrapeGoldSilverPrices() {
  console.log('🔍 Fetching live spot prices...');

  // PRIORITY 1: Try GoldAPI.io (Paid tier - 10,000/month)
  try {
    const API_KEY = process.env.GOLD_API_KEY;

    if (!API_KEY) {
      console.log('⚠️  No GOLD_API_KEY found, skipping GoldAPI.io');
      throw new Error('No GoldAPI key configured');
    }

    console.log('📡 Attempting GoldAPI.io (paid tier)...');

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

    if (goldRes.data && silverRes.data && goldRes.data.price && silverRes.data.price) {
      const result = {
        gold: Math.round(goldRes.data.price * 100) / 100,
        silver: Math.round(silverRes.data.price * 100) / 100,
        platinum: 950, // Not available in free/paid tier
        palladium: 960, // Not available in free/paid tier
        timestamp: new Date().toISOString(),
        source: 'goldapi-io',
      };

      console.log(`💰 Gold Spot: $${result.gold}/oz (GoldAPI.io)`);
      console.log(`🥈 Silver Spot: $${result.silver}/oz (GoldAPI.io)`);
      console.log('✅ Successfully fetched prices via GoldAPI.io (primary source)');

      return result;
    }
  } catch (goldapiError) {
    console.warn('⚠️  GoldAPI.io failed:', goldapiError.message);
    console.log('   Falling back to MetalPriceAPI...');
  }

  // PRIORITY 2: Try MetalPriceAPI (Fallback)
  try {
    const METAL_API_KEY = process.env.METAL_PRICE_API_KEY;

    if (!METAL_API_KEY) {
      console.log('⚠️  No METAL_PRICE_API_KEY found, skipping MetalPriceAPI');
      throw new Error('No MetalPriceAPI key configured');
    }

    console.log('📡 Attempting MetalPriceAPI (fallback)...');

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
      platinumPrice = data.rates.XPT ? Math.round((1 / data.rates.XPT) * 100) / 100 : 950;
      palladiumPrice = data.rates.XPD ? Math.round((1 / data.rates.XPD) * 100) / 100 : 960;
    } else {
      // Direct format (if available)
      goldPrice = data.gold || data.XAU || data.xau;
      silverPrice = data.silver || data.XAG || data.xag;
      platinumPrice = data.platinum || data.XPT || data.xpt || 950;
      palladiumPrice = data.palladium || data.XPD || data.xpd || 960;
    }

    if (goldPrice && silverPrice) {
      const result = {
        gold: Math.round(goldPrice * 100) / 100,
        silver: Math.round(silverPrice * 100) / 100,
        platinum: Math.round(platinumPrice * 100) / 100,
        palladium: Math.round(palladiumPrice * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'metalpriceapi',
      };

      console.log(`💰 Gold Spot: $${result.gold}/oz (MetalPriceAPI)`);
      console.log(`🥈 Silver Spot: $${result.silver}/oz (MetalPriceAPI)`);
      console.log('✅ Successfully fetched prices via MetalPriceAPI (fallback)');

      return result;
    }
  } catch (metalError) {
    console.warn('⚠️  MetalPriceAPI failed:', metalError.message);
    console.log('   Falling back to static prices...');
  }

  // PRIORITY 3: Static fallback prices (final resort)
  console.log('⚠️  All APIs failed - using static fallback prices');
  return {
    gold: 2650,
    silver: 31,
    platinum: 950,
    palladium: 960,
    timestamp: new Date().toISOString(),
    source: 'static-fallback',
  };
}

/**
 * Alternative scraper - currently not used but kept for future
 */
async function scrapeGoldSilverPricesAlternative() {
  console.warn('⚠️  Alternative scraper called - returning static prices');
  return {
    gold: 2650,
    silver: 31,
    platinum: 950,
    palladium: 960,
    timestamp: new Date().toISOString(),
    source: 'static-fallback',
  };
}

module.exports = {
  scrapeGoldSilverPrices,
  scrapeGoldSilverPricesAlternative,
};
