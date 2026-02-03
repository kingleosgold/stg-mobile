# Daily Change Bug - Investigation Findings

**Issue:** Daily change shows blank/zero on Mondays (and potentially after holidays)

---

## Root Cause

The daily change calculation depends on comparing today's prices to yesterday's closing prices. However:

1. **On Mondays:** "Yesterday" (Sunday) has no market data because markets are closed
2. **Current code:** Only looks back 1 day (`yesterday.setDate(yesterday.getDate() - 1)`)
3. **Missing logic:** No handling for weekends/holidays - should look back to Friday on Mondays

---

## How Daily Change Works

### Data Sources (Priority Order):

**Option 1: GoldAPI.io (includes change data)**
- Fields: `ch` (change amount), `chp` (change percent), `prev_close_price`
- **This works on Mondays** because GoldAPI provides Friday's close as `prev_close_price`
- ✅ No bug when GoldAPI.io is primary source

**Option 2: MetalPriceAPI (no change data)**
- Only provides current prices
- Requires manual calculation: `currentPrice - yesterdayPrice`
- Gets yesterday's price from:
  1. `previous-day-prices.json` (local file cache)
  2. `price_log` database table (logged prices)
- ❌ **Bug occurs here on Mondays** - looks for Sunday (no data), doesn't fallback to Friday

---

## Code Location

**File:** `backend/scrapers/gold-silver-scraper.js`

**Problem Function:** `getYesterdayPrices()` (line ~161)

```javascript
async function getYesterdayPrices() {
  const today = new Date().toISOString().split('T')[0];

  // First check local file
  if (previousDayPrices.date && previousDayPrices.date < today) {
    return previousDayPrices;
  }

  // Fallback: check price_log database for yesterday's prices
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1); // ❌ BUG: This is Sunday on Mondays!
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const loggedPrice = await findClosestLoggedPrice(yesterdayStr, '23:59');
    // ... rest of function
  }
}
```

**Problem:** `setDate(yesterday.getDate() - 1)` always goes back 1 day, even if that's a weekend/holiday.

---

## Solution

### Fix #1: Smart Weekend Detection (Recommended)

Update `getYesterdayPrices()` to detect weekends and look back to Friday:

```javascript
async function getYesterdayPrices() {
  const today = new Date().toISOString().split('T')[0];

  // First check local file
  if (previousDayPrices.date && previousDayPrices.date < today) {
    return previousDayPrices;
  }

  // Fallback: check price_log database for last trading day
  try {
    const lastTrading = getLastTradingDay(); // NEW HELPER FUNCTION
    const loggedPrice = await findClosestLoggedPrice(lastTrading, '23:59');
    
    if (loggedPrice && loggedPrice.gold && loggedPrice.silver) {
      console.log(\`📊 Using price_log for last trading day (\${lastTrading}): Gold $\${loggedPrice.gold}, Silver $\${loggedPrice.silver}\`);
      return {
        gold: loggedPrice.gold,
        silver: loggedPrice.silver,
        date: lastTrading
      };
    }
  } catch (err) {
    console.log('⚠️  Could not fetch last trading day prices from price_log:', err.message);
  }

  return null;
}

/**
 * Get the last trading day (skips weekends)
 * If today is Monday, returns Friday
 * If today is Sunday, returns Friday
 * Otherwise returns yesterday
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
```

---

## Testing Plan

1. **Test on Monday:** Run backend, verify daily change shows Friday's data
2. **Test on Tuesday-Friday:** Verify daily change shows previous day
3. **Test on weekend:** Verify behavior (markets closed, should show Friday as baseline)
4. **Test with MetalPriceAPI:** Force GoldAPI to fail, ensure MetalPriceAPI path works
5. **Check logs:** Verify "Using price_log for last trading day (YYYY-MM-DD)" appears

---

## Alternative Solutions

### Fix #2: Use GoldAPI.io as Primary (Simpler)

Since GoldAPI.io already handles weekends correctly via `prev_close_price`, just ensure it's always the primary source. This would avoid the weekend logic entirely.

**Pros:** No code changes needed, GoldAPI handles it
**Cons:** Dependent on GoldAPI being available

### Fix #3: Holiday Calendar

More robust solution would include a holiday calendar (NYSE/COMEX holidays) and look back to last actual trading day. But this is overkill for MVP.

---

## Environment Check

**Current API Configuration:**
```bash
# Check which API keys are set:
echo $GOLD_API_KEY          # GoldAPI.io
echo $METAL_PRICE_API_KEY   # MetalPriceAPI
```

**Railway Environment:**
Need to verify which API is configured in production. If GoldAPI.io is set, the bug might not occur often (only when GoldAPI fails).

---

## Implementation Status

- [x] Bug identified
- [x] Root cause found
- [ ] Fix implemented
- [ ] Tested on Monday
- [ ] Tested on Tuesday-Friday
- [ ] Deployed to production

---

## Recommendation

**Implement Fix #1** (Smart Weekend Detection) because:
1. It's a fallback-safe solution (works even if GoldAPI fails)
2. Handles all edge cases (Monday, Sunday, holidays with simple calendar logic)
3. Preserves existing priority order (GoldAPI → MetalPriceAPI → cache → static)

**Next Steps:**
1. Implement `getLastTradingDay()` helper
2. Update `getYesterdayPrices()` to use it
3. Test locally on Monday (or mock date to Monday)
4. Deploy to Railway
5. Monitor logs on next Monday to verify fix

---

**Time to Fix:** ~15 minutes
**Testing Required:** Wait for Monday OR mock system date
**Risk:** Low (only affects fallback path when GoldAPI fails)
