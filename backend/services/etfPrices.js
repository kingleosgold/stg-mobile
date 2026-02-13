/**
 * ETF Price Service
 *
 * Fetches historical SLV and GLD ETF data from Yahoo Finance
 * and converts to estimated spot prices.
 *
 * Key facts:
 * - SLV launched April 2006, GLD launched November 2004
 * - Each SLV share represents ~0.92 oz silver (erodes ~0.5%/year due to expense ratio)
 * - Each GLD share represents ~0.092 oz gold (1/10th oz, also erodes slowly)
 */

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { supabase, isSupabaseAvailable } = require('../supabaseClient');

// Default conversion ratios (these get calibrated daily)
const DEFAULT_SLV_RATIO = 0.92;  // SLV price / silver spot
const DEFAULT_GLD_RATIO = 0.092; // GLD price / gold spot (1/10th oz)

/**
 * Fetch historical ETF data for a specific date
 * @param {string} symbol - ETF symbol ('SLV' or 'GLD')
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Object|null} OHLC data or null if not found
 */
async function fetchETFHistorical(symbol, dateString) {
  try {
    // Check cache first if Supabase is available
    if (isSupabaseAvailable()) {
      const cached = await getCachedETFData(symbol, dateString);
      if (cached) {
        return cached;
      }
    }

    const date = new Date(dateString);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // Fetch daily data from Yahoo Finance
    const result = await yahooFinance.historical(symbol, {
      period1: date,
      period2: nextDay,
      interval: '1d'
    });

    if (result && result.length > 0) {
      const data = {
        open: result[0].open,
        high: result[0].high,
        low: result[0].low,
        close: result[0].close,
        volume: result[0].volume,
        date: result[0].date
      };

      // Cache for future use
      if (isSupabaseAvailable()) {
        await cacheETFData(symbol, dateString, data);
      }

      return data;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching ${symbol} for ${dateString}:`, error.message);
    return null;
  }
}

/**
 * Fetch intraday ETF data (only works for recent dates, ~30 days)
 * @param {string} symbol - ETF symbol ('SLV' or 'GLD')
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Array} Array of intraday data points
 */
async function fetchETFIntraday(symbol, dateString) {
  try {
    const date = new Date(dateString);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // Minute-level data (only available for recent ~30 days)
    const result = await yahooFinance.historical(symbol, {
      period1: date,
      period2: nextDay,
      interval: '1m'
    });

    return result || [];
  } catch (error) {
    console.error(`Error fetching intraday ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Get current ETF quotes
 * @returns {Object} Current SLV and GLD quotes
 */
async function getCurrentETFQuotes() {
  try {
    const [slvQuote, gldQuote] = await Promise.all([
      yahooFinance.quote('SLV'),
      yahooFinance.quote('GLD')
    ]);

    return {
      slv: slvQuote ? {
        price: slvQuote.regularMarketPrice,
        previousClose: slvQuote.regularMarketPreviousClose,
        open: slvQuote.regularMarketOpen,
        dayHigh: slvQuote.regularMarketDayHigh,
        dayLow: slvQuote.regularMarketDayLow
      } : null,
      gld: gldQuote ? {
        price: gldQuote.regularMarketPrice,
        previousClose: gldQuote.regularMarketPreviousClose,
        open: gldQuote.regularMarketOpen,
        dayHigh: gldQuote.regularMarketDayHigh,
        dayLow: gldQuote.regularMarketDayLow
      } : null
    };
  } catch (error) {
    console.error('Error fetching ETF quotes:', error.message);
    return { slv: null, gld: null };
  }
}

/**
 * Convert SLV ETF price to silver spot price
 * @param {number} slvPrice - SLV ETF price
 * @param {number} ratio - Conversion ratio (default ~0.92)
 * @returns {number} Estimated silver spot price
 */
function slvToSpotSilver(slvPrice, ratio = DEFAULT_SLV_RATIO) {
  if (!slvPrice || !ratio) return null;
  return slvPrice / ratio;
}

/**
 * Convert GLD ETF price to gold spot price
 * @param {number} gldPrice - GLD ETF price
 * @param {number} ratio - Conversion ratio (default ~0.092)
 * @returns {number} Estimated gold spot price
 */
function gldToSpotGold(gldPrice, ratio = DEFAULT_GLD_RATIO) {
  if (!gldPrice || !ratio) return null;
  return gldPrice / ratio;
}

/**
 * Get cached ETF data from Supabase
 */
async function getCachedETFData(symbol, dateString) {
  if (!isSupabaseAvailable()) return null;

  try {
    const { data, error } = await supabase
      .from('etf_daily_cache')
      .select('*')
      .eq('symbol', symbol)
      .eq('date', dateString)
      .single();

    if (error || !data) return null;

    return {
      open: parseFloat(data.open_price),
      high: parseFloat(data.high_price),
      low: parseFloat(data.low_price),
      close: parseFloat(data.close_price),
      volume: data.volume,
      date: new Date(data.date)
    };
  } catch (err) {
    console.error('Cache lookup error:', err.message);
    return null;
  }
}

/**
 * Cache ETF data to Supabase
 */
async function cacheETFData(symbol, dateString, data) {
  if (!isSupabaseAvailable()) return;

  try {
    await supabase
      .from('etf_daily_cache')
      .upsert({
        symbol,
        date: dateString,
        open_price: data.open,
        high_price: data.high,
        low_price: data.low,
        close_price: data.close,
        volume: data.volume
      }, { onConflict: 'symbol,date' });
  } catch (err) {
    console.error('Cache write error:', err.message);
  }
}

/**
 * Check if a date has ETF data available
 * SLV started April 28, 2006
 * GLD started November 18, 2004
 */
function hasETFDataForDate(date, metal = 'silver') {
  const checkDate = new Date(date);
  const slvStart = new Date('2006-04-28');
  const gldStart = new Date('2004-11-18');

  if (metal === 'silver') {
    return checkDate >= slvStart;
  } else if (metal === 'gold') {
    return checkDate >= gldStart;
  }

  // Both metals - use the later date (SLV)
  return checkDate >= slvStart;
}

/**
 * Get ETF data for both SLV and GLD for a date
 */
async function fetchBothETFs(dateString) {
  const [slvData, gldData] = await Promise.all([
    fetchETFHistorical('SLV', dateString),
    fetchETFHistorical('GLD', dateString)
  ]);

  return { slv: slvData, gld: gldData };
}

module.exports = {
  fetchETFHistorical,
  fetchETFIntraday,
  getCurrentETFQuotes,
  slvToSpotSilver,
  gldToSpotGold,
  hasETFDataForDate,
  fetchBothETFs,
  DEFAULT_SLV_RATIO,
  DEFAULT_GLD_RATIO
};
