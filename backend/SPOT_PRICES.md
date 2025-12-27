# Spot Price API Configuration

## Current Status

✅ **The app is now using GoldAPI.io for LIVE spot prices!**

**Live Prices from GoldAPI.io:**
- Gold (XAU): Real-time pricing ✓
- Silver (XAG): Real-time pricing ✓
- Platinum: Fallback ($2,400/oz) - not included in GoldAPI.io free tier
- Palladium: Fallback ($1,850/oz) - not included in GoldAPI.io free tier

## Configuration

### API Provider: GoldAPI.io

**Why GoldAPI.io?**
- ✅ Free tier: 100 requests/day (we use ~96 with 15-minute caching)
- ✅ Simple REST API with direct price values
- ✅ No complex inversions needed
- ✅ Supports both Gold (XAU) and Silver (XAG)
- ✅ No credit card required

### Caching Strategy

**15-Minute Cache:**
- Cache duration: 15 minutes
- Daily requests: ~96 (24 hours × 4 requests/hour)
- Well under the 100/day free tier limit
- Automatic background refresh every 15 minutes

### Environment Variable

Set `GOLD_API_KEY` in your environment:

```bash
# On Railway:
railway variables set GOLD_API_KEY=your-goldapi-key-here

# On local development:
# Create backend/.env file:
GOLD_API_KEY=your-goldapi-key-here
```

### How It Works

The backend makes **two parallel API calls** every 15 minutes:

1. **Gold (XAU):** `https://www.goldapi.io/api/XAU/USD`
2. **Silver (XAG):** `https://www.goldapi.io/api/XAG/USD`

Both use the header:
```
x-access-token: your-goldapi-key-here
```

## Alternative APIs (If Needed)

### metalpriceapi.com
- Free tier: 100 requests/month
- Sign up: https://metalpriceapi.com
- Supports: Gold, Silver, Platinum, Palladium
- Note: Demo key no longer works

### metals-api.com
- Free tier: 50 requests/month
- Sign up: https://metals-api.com
- Similar to metalpriceapi.com

## Testing the API

### Test GoldAPI.io Directly:
```bash
# Test Gold (XAU) endpoint:
curl -H "x-access-token: your-api-key" "https://www.goldapi.io/api/XAU/USD"

# Test Silver (XAG) endpoint:
curl -H "x-access-token: your-api-key" "https://www.goldapi.io/api/XAG/USD"
```

**Expected GoldAPI.io Response:**
```json
{
  "timestamp": 1766873882,
  "metal": "XAU",
  "currency": "USD",
  "price": 4533.42,
  ...
}
```

### Test Backend Locally:
```bash
cd backend
node server.js

# In another terminal:
curl http://localhost:3000/api/spot-prices
```

### Test Backend on Railway:
```bash
curl https://stack-tracker-pro-production.up.railway.app/api/spot-prices
```

### Expected Response (Live with GoldAPI.io):
```json
{
  "success": true,
  "gold": 4533.42,
  "silver": 79.33,
  "platinum": 2400,
  "palladium": 1850,
  "timestamp": "2025-12-27T22:18:24.666Z",
  "source": "live",
  "cacheAgeMinutes": 0
}
```

### Expected Response (Fallback):
```json
{
  "success": true,
  "gold": 4530,
  "silver": 77,
  "platinum": 2400,
  "palladium": 1850,
  "timestamp": "2025-12-27T21:52:42.822Z",
  "source": "fallback",
  "cacheAgeMinutes": 1.2
}
```

## Logging

The backend includes detailed logging to help debug spot price issues:

**Successful GoldAPI.io Fetch:**
```
🔍 Attempting to fetch live spot prices from GoldAPI.io...
📡 Gold API Response: 200 OK
📡 Silver API Response: 200 OK
📊 Gold Data: {"timestamp":1766873882,"metal":"XAU",...,"price":4533.42,...}
📊 Silver Data: {"timestamp":1766873875,"metal":"XAG",...,"price":79.33,...}
✅ Spot prices updated (live via GoldAPI.io): { gold: 4533.42, silver: 79.33, platinum: 2400, palladium: 1850 }
```

**If API Fails:**
```
🔍 Attempting to fetch live spot prices from GoldAPI.io...
📡 Gold API Response: 401 Unauthorized
❌ Gold API Error: {"error":"No API Key provided"}
⚠️  Using fallback spot prices (API unavailable or error)
💡 To enable live prices, set GOLD_API_KEY environment variable
💡 Get free API key at: https://www.goldapi.io
```

## How the App Handles Prices

1. **On Startup:** Backend calls `fetchLiveSpotPrices()` from GoldAPI.io
2. **Every 15 Minutes:** Backend refreshes prices automatically (setInterval)
3. **On API Call:** If cache is older than 15 minutes, refresh
4. **If API Fails:** Use fallback prices (hardcoded estimates)
5. **Mobile App:** Shows source indicator ("live" or "fallback") + timestamp

**Request Rate:**
- 15-minute refresh = 4 requests/hour
- 4 requests/hour × 24 hours = 96 requests/day
- Well under the 100/day free tier limit ✅

## Updating Fallback Prices

If you're not using a live API, you can manually update the fallback prices in `backend/server.js` around line 131:

```javascript
spotPriceCache.prices = {
  gold: 4530,    // Update with current market price
  silver: 77,     // Update with current market price
  platinum: 2400, // Update with current market price
  palladium: 1850 // Update with current market price
};
```

## Mobile App Display

The mobile app will show:
- Current spot prices
- Gold/Silver ratio (1 decimal precision)
- Last updated timestamp
- Source indicator: "live" or "fallback"

Example:
```
Source: fallback • Updated Dec 27, 3:45 PM
```

Users can tap the "🔄 Refresh" button to manually fetch new prices.
