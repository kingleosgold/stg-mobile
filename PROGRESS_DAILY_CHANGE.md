# Daily Change Bug Fix - Progress Report

**Branch:** bob/fix-daily-change  
**Started:** 2026-02-03 12:10 AM EST  
**Status:** ✅ Fix implemented, ready for testing

---

## Problem Summary

Daily change shows blank/zero on Mondays because:
- Code looks back exactly 1 day for "yesterday's" prices
- On Mondays, that's Sunday (markets closed - no data)
- Should look back to Friday's closing prices instead

---

## Solution Implemented

### New Helper Function: `getLastTradingDay()`

```javascript
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

### Updated `getYesterdayPrices()`

- Now calls `getLastTradingDay()` instead of hardcoded `-1 day`
- Logs which date it's looking for: `"Looking for last trading day prices: YYYY-MM-DD"`
- Works correctly on:
  - **Monday:** Looks back to Friday
  - **Sunday:** Looks back to Friday  
  - **Tuesday-Saturday:** Looks back to previous day

---

## Files Modified

**backend/scrapers/gold-silver-scraper.js**
- Added `getLastTradingDay()` helper (23 lines)
- Updated `getYesterdayPrices()` to use new helper (3 lines changed)

---

## How It Works

### Daily Change Flow

**Priority 1: GoldAPI.io**
- Already provides `prev_close_price` field
- Handles weekends automatically
- ✅ No changes needed (already works)

**Priority 2: MetalPriceAPI** (This is where the bug was)
- Doesn't provide change data
- Must calculate: `currentPrice - previousDayPrice`
- **Old behavior:** Look back 1 day (fails on Mondays)
- **New behavior:** Look back to last trading day (skips weekends)

**Priority 3: Cached prices**
- Uses last successful fetch
- No change data available

**Priority 4: Static fallback**
- Hardcoded prices
- No change data available

---

## Testing Required

### Manual Testing Steps

**Option 1: Test on Actual Monday**
```bash
# Wait until Monday morning
cd backend
node server.js
# Check logs for: "Looking for last trading day prices: YYYY-MM-DD"
# Should show Friday's date (3 days back)

curl http://localhost:3000/api/spot-prices
# Verify change.gold.amount and change.silver.amount are not null
```

**Option 2: Mock System Date**
```bash
# Temporarily set system date to Monday
# (macOS) sudo date 020312002026  # Feb 3, 12:00 PM, 2026 (Monday)

cd backend
node server.js
curl http://localhost:3000/api/spot-prices
```

**Option 3: Test with Historical Data**
```javascript
// In Node REPL:
const scraper = require('./backend/scrapers/gold-silver-scraper.js');
// Set today to Monday
const originalDate = Date;
global.Date = class extends originalDate {
  constructor() {
    super('2026-02-03T12:00:00'); // Monday
  }
};
// Run function and check output
```

---

## Expected Behavior After Fix

### On Monday (Feb 3, 2026)

**Console Logs:**
```
📊 Looking for last trading day prices: 2026-01-31
📊 Using price_log for last trading day (2026-01-31): Gold $5100, Silver $107
📈 Calculated change - Gold: +$25 (0.49%)
📈 Calculated change - Silver: +$1.50 (1.42%)
```

**API Response:**
```json
{
  "success": true,
  "gold": 5125,
  "silver": 108.50,
  "change": {
    "gold": {
      "amount": 25,
      "percent": 0.49,
      "prevClose": 5100
    },
    "silver": {
      "amount": 1.50,
      "percent": 1.42,
      "prevClose": 107
    },
    "source": "calculated"
  },
  "timestamp": "2026-02-03T17:00:00.000Z",
  "source": "metalpriceapi"
}
```

### On Tuesday-Friday

Should work as before (look back 1 day).

---

## Edge Cases Handled

✅ **Monday:** Looks back to Friday (3 days)  
✅ **Sunday:** Looks back to Friday (2 days)  
✅ **Tuesday-Saturday:** Looks back 1 day  
⚠️ **Holidays:** NOT handled (would need holiday calendar)

**Holiday Issue:**
- If Monday is a holiday (e.g., MLK Day), Tuesday will still look back to Monday
- Proper solution requires NYSE/COMEX holiday calendar
- For MVP, this is acceptable (most Mondays are trading days)

---

## Deployment Checklist

- [x] Code updated
- [x] Changes committed to branch
- [ ] Tested locally
- [ ] Tested on Monday
- [ ] Pushed to GitHub
- [ ] Deployed to Railway
- [ ] Verified in production on Monday

---

## Rollback Plan

If the fix causes issues:

1. Revert `gold-silver-scraper.js` to previous version
2. Original logic: `yesterday.setDate(yesterday.getDate() - 1)`
3. Issue remains but app still functions (just no change data on Mondays)

---

## Related Documentation

See `DAILY_CHANGE_BUG_FINDINGS.md` for detailed investigation notes.

---

## Next Steps

1. Commit changes to `bob/fix-daily-change` branch
2. Push branch to GitHub
3. Create PR for Jon's review
4. **Test on next Monday** (Feb 3, 2026) or mock date to verify
5. Deploy to Railway after approval
6. Monitor logs on Monday to confirm fix works

---

**Time Spent:** 45 minutes  
**Risk Level:** Low (only affects fallback path when GoldAPI fails)  
**Testing Needed:** Wait for Monday or mock system date
