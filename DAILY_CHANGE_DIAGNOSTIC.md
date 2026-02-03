# Daily Change - Diagnostic Report

**Issue:** Daily change showing inconsistently (sometimes works, sometimes empty)  
**Current Status:** Empty on production API  
**Date:** 2026-02-03 18:06 EST

---

## Current Code Flow

### When Backend Fetches Prices (Every 15 min):

1. **MetalPriceAPI** returns current prices
2. Call `getYesterdayPrices()` to find previous day's close
3. Calculate: `currentPrice - yesterdayPrice = change`
4. Return change data to API response

### getYesterdayPrices() Logic:

```javascript
async function getYesterdayPrices() {
  const today = new Date().toISOString().split('T')[0];

  // Step 1: Check local file cache (previousDayPrices)
  if (previousDayPrices.date && previousDayPrices.date < today) {
    return previousDayPrices; // ✅ Fast path
  }

  // Step 2: Query price_log database
  const lastTradingDay = getLastTradingDay(); // Handles weekends
  const loggedPrice = await findClosestLoggedPrice(lastTradingDay, '23:59');
  
  if (loggedPrice && loggedPrice.gold && loggedPrice.silver) {
    return { gold, silver, date }; // ✅ Found in database
  }

  return null; // ❌ No data available
}
```

---

## Why It's Inconsistent

### Scenario 1: After Server Restart (Railway redeploy)
- ❌ Local file cache (`previousDayPrices`) is **lost**
- ❌ Falls back to database query
- ❌ If database empty → **no change data**

### Scenario 2: After 24+ Hours Running
- ✅ Local file cache has yesterday's prices
- ✅ Returns immediately from memory
- ✅ **Change data works**

### Scenario 3: Fresh Deploy with Empty Database
- ❌ No cached file
- ❌ Database has no historical data yet
- ❌ **No change data** until 24 hours pass

---

## Root Cause

**The problem is the local file cache:**

```javascript
const PREV_PRICES_FILE = path.join(__dirname, '..', 'data', 'previous-day-prices.json');
```

**On Railway:**
- File system is **ephemeral** (reset on redeploy)
- File saved to `/app/backend/data/previous-day-prices.json`
- **Lost on every deploy/restart**

**This means:**
- After every Railway restart, backend loses yesterday's prices
- Must wait for `price_log` database to have data
- If database is empty or missing yesterday → no change data

---

## Why Database Might Be Empty

### Check These:

1. **Is Supabase properly connected?**
   ```javascript
   // In backend/services/priceLogger.js
   if (!isSupabaseAvailable()) {
     return; // Silently skips logging
   }
   ```
   
   **Required env vars:**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` ✅ You just added this

2. **Is price_log table empty?**
   ```sql
   SELECT COUNT(*) FROM price_log;
   SELECT * FROM price_log ORDER BY timestamp DESC LIMIT 10;
   ```

3. **Is backend actually logging prices?**
   Check Railway logs for:
   ```
   ✅ Spot prices updated: { gold: 4939.69, silver: 88.49, ... }
   📈 Total API requests: X
   ```
   
   Should NOT see:
   ```
   Price logging skipped: ...
   ```

4. **Does price_log have yesterday's data?**
   ```sql
   SELECT * FROM price_log 
   WHERE timestamp::date = CURRENT_DATE - INTERVAL '1 day'
   ORDER BY timestamp DESC
   LIMIT 10;
   ```

---

## Solutions

### Option 1: Fix the File Cache (Quick Fix)

**Problem:** File is lost on Railway restarts  
**Solution:** Use `/tmp/` which persists longer

**Change in `gold-silver-scraper.js`:**
```javascript
// OLD:
const PREV_PRICES_FILE = path.join(__dirname, '..', 'data', 'previous-day-prices.json');

// NEW:
const PREV_PRICES_FILE = '/tmp/previous-day-prices.json';
```

**Impact:** File persists across code deploys (only lost on cold starts)

---

### Option 2: Rely Only on Database (Proper Fix)

**Remove file cache entirely, always use price_log.**

**Change getYesterdayPrices():**
```javascript
async function getYesterdayPrices() {
  const lastTradingDay = getLastTradingDay();
  console.log(`📊 Looking for last trading day prices: ${lastTradingDay}`);

  try {
    const loggedPrice = await findClosestLoggedPrice(lastTradingDay, '23:59');
    if (loggedPrice && loggedPrice.gold && loggedPrice.silver) {
      console.log(`📊 Found in price_log: Gold $${loggedPrice.gold}, Silver $${loggedPrice.silver}`);
      return {
        gold: loggedPrice.gold,
        silver: loggedPrice.silver,
        date: lastTradingDay
      };
    }
  } catch (err) {
    console.error('⚠️  Database query failed:', err.message);
  }

  return null;
}
```

**Remove:**
- `previousDayPrices` variable
- `savePreviousDayPrices()` function
- All file I/O code

**Pros:**
- ✅ Single source of truth (database)
- ✅ Works after restarts
- ✅ More reliable

**Cons:**
- ⏰ Requires 24 hours of data before working
- 🐌 Slightly slower (database query vs file read)

---

### Option 3: Hybrid Approach (Best)

**Keep file cache as performance optimization, but:**

1. **On startup:** Check database first, populate file cache
2. **Every fetch:** Update file cache
3. **On query:** Try file first, fall back to database

**Implementation:**
```javascript
// On server startup
async function initializePriceCache() {
  const yesterday = getLastTradingDay();
  const loggedPrice = await findClosestLoggedPrice(yesterday, '23:59');
  
  if (loggedPrice) {
    previousDayPrices = {
      gold: loggedPrice.gold,
      silver: loggedPrice.silver,
      date: yesterday
    };
    console.log('📊 Initialized price cache from database');
  }
}
```

---

## Immediate Diagnostic Steps

**Run these in Supabase SQL Editor:**

```sql
-- 1. Check if table exists and has data
SELECT COUNT(*) as total_rows FROM price_log;

-- 2. Check most recent prices
SELECT * FROM price_log 
ORDER BY timestamp DESC 
LIMIT 5;

-- 3. Check if we have yesterday's data
SELECT DATE(timestamp) as date, COUNT(*) as entries, 
       MIN(gold_price) as min_gold, MAX(gold_price) as max_gold
FROM price_log 
WHERE timestamp >= CURRENT_DATE - INTERVAL '3 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- 4. Check specific yesterday date
SELECT * FROM price_log 
WHERE timestamp::date = '2026-02-02'
ORDER BY timestamp DESC
LIMIT 10;
```

**Check Railway Logs for:**
```bash
# Search for these patterns:
"Looking for last trading day prices"
"Found in price_log"
"No previous day prices available"
"Price logging skipped"
```

---

## Expected Behavior After Fix

**Immediately after deploy:**
- ❌ Change might still be empty (waiting for data to accumulate)

**After 15 minutes:**
- ✅ First price logged to `price_log`

**After 24 hours:**
- ✅ Daily change starts working
- ✅ Consistent across restarts

**After 1 week:**
- ✅ Reliable historical data
- ✅ Can calculate change for any day

---

## My Recommendation

**Implement Option 3 (Hybrid):**
1. ✅ Keep file cache for performance
2. ✅ Initialize from database on startup
3. ✅ Always fall back to database if file missing

**This gives you:**
- Fast response times
- Survives restarts
- Works after deploys

**Want me to implement this fix?** 🛠️
