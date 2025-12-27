# Spot Price API Configuration

## Current Status

The app is currently using **fallback prices** because the free demo API key from metalpriceapi.com has expired or is no longer valid.

**Fallback Prices (Manually Updated Dec 2025):**
- Gold: $4,530.00/oz
- Silver: $77.00/oz
- Platinum: $2,400.00/oz
- Palladium: $1,850.00/oz

These are reasonable estimates based on market conditions and are updated periodically.

## How to Enable Live Spot Prices

### Option 1: metalpriceapi.com (Recommended)

1. Sign up for a free account at https://metalpriceapi.com
   - Free tier: 100 requests/month
   - No credit card required

2. Get your API key from the dashboard

3. Set the API key as an environment variable on Railway:
   ```bash
   railway variables set METAL_PRICE_API_KEY=your_api_key_here
   ```

4. Update `backend/server.js` line 89 to use the environment variable:
   ```javascript
   const API_KEY = process.env.METAL_PRICE_API_KEY || 'demo';
   const response = await fetch(`https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=XAU,XAG,XPT,XPD`);
   ```

### Option 2: Alternative Free APIs

If metalpriceapi.com doesn't work, try these alternatives:

#### goldapi.io
- Free tier: 1,000 requests/month
- Sign up: https://www.goldapi.io
- Endpoint: `https://www.goldapi.io/api/XAU/USD`
- Requires: API Key header

#### metals-api.com
- Free tier: 50 requests/month
- Sign up: https://metals-api.com
- Similar to metalpriceapi.com

## Testing the API

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

### Expected Response (Live):
```json
{
  "success": true,
  "gold": 4532.50,
  "silver": 79.33,
  "platinum": 2401.25,
  "palladium": 1852.00,
  "timestamp": "2025-12-27T21:52:42.822Z",
  "source": "live",
  "cacheAgeMinutes": 2.3
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

The backend now includes detailed logging to help debug spot price issues:

```
🔍 Attempting to fetch live spot prices...
📡 API Response Status: 200 OK
📊 API Response Data: {"success":true,"rates":{...}}
✅ Spot prices updated (live): { gold: 4532.50, silver: 79.33, ... }
```

Or if it fails:
```
🔍 Attempting to fetch live spot prices...
📡 API Response Status: 401 Unauthorized
❌ API Request Failed: {"success":false,"error":{"message":"Invalid API key"}}
⚠️  Using fallback spot prices (API unavailable or demo key expired)
💡 To enable live prices, sign up at metalpriceapi.com and set API_KEY env variable
```

## How the App Handles Prices

1. **On Startup:** Backend calls `fetchLiveSpotPrices()`
2. **Every 5 Minutes:** Backend refreshes prices automatically
3. **On API Call:** If cache is older than 5 minutes, refresh
4. **If API Fails:** Use fallback prices (hardcoded)
5. **Mobile App:** Shows source indicator ("live" or "fallback")

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
