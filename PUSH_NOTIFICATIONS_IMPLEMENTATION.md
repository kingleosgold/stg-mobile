# Push Notifications - Full Backend Implementation

**Status:** ✅ Backend complete, mobile app integration pending  
**Approach:** Option 2 (Full Backend with Expo Push Notifications)

---

## What's Been Implemented

### 1. Database Schema ✅

**File:** `backend/migrations/003_create_push_notifications_tables.sql`

**Tables Created:**
- `push_tokens` - Stores Expo push tokens for notification delivery
- `price_alerts` - Stores user-defined price alerts
- `notification_log` - Tracks sent notifications (for debugging/analytics)

**Key Features:**
- Row Level Security (RLS) policies for data isolation
- Support for both authenticated users and anonymous devices
- Indexes for fast alert checking
- Automatic timestamp updates

**To Apply Migration:**
```bash
# Connect to Supabase and run:
psql $DATABASE_URL < backend/migrations/003_create_push_notifications_tables.sql
```

---

### 2. Backend Services ✅

#### Expo Push Notifications Service
**File:** `backend/services/expoPushNotifications.js`

**Functions:**
- `sendPushNotification(token, notification)` - Send single notification
- `sendBatchPushNotifications(notifications)` - Send multiple notifications
- `checkPushReceipt(receiptId)` - Verify delivery status
- `isValidExpoPushToken(token)` - Validate token format

**Usage:**
```javascript
const { sendPushNotification } = require('./services/expoPushNotifications');

await sendPushNotification('ExponentPushToken[...]', {
  title: 'Gold Price Alert',
  body: 'Gold has risen to $5200',
  data: { metal: 'gold', price: 5200 },
});
```

#### Price Alert Checker Service
**File:** `backend/services/priceAlertChecker.js`

**Functions:**
- `checkPriceAlerts(currentPrices)` - Check all alerts and send notifications
- `startPriceAlertChecker(getPricesCallback)` - Start cron job (runs every 5 min)

**How It Works:**
1. Fetches all active, untriggered alerts from database
2. Compares each alert's target price to current spot prices
3. If triggered, fetches user's push token
4. Sends Expo push notification
5. Marks alert as triggered
6. Logs notification to database

---

### 3. API Endpoints ✅

**File:** `backend/server.js` (endpoints added before STARTUP section)

#### POST /api/push-token/register
Register or update a push token.

**Request:**
```json
{
  "expo_push_token": "ExponentPushToken[...]",
  "platform": "ios",
  "app_version": "1.3.0",
  "user_id": "uuid",
  "device_id": "unique-device-id"
}
```

**Response:**
```json
{
  "success": true,
  "action": "created",
  "id": "uuid"
}
```

---

#### DELETE /api/push-token/delete
Delete a push token (when user disables notifications).

**Request:**
```json
{
  "expo_push_token": "ExponentPushToken[...]"
}
```

---

#### POST /api/price-alerts/sync
Sync price alerts from mobile app to backend.

**Request:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "metal": "gold",
      "target_price": 5200,
      "direction": "above",
      "enabled": true
    }
  ],
  "user_id": "uuid",
  "device_id": "unique-device-id"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    { "id": "uuid", "success": true, "action": "created" }
  ],
  "total": 1,
  "synced": 1
}
```

---

#### DELETE /api/price-alerts/delete
Delete a price alert.

**Request:**
```json
{
  "alert_id": "uuid"
}
```

---

#### GET /api/price-alerts?user_id=xxx
Get user's price alerts from backend.

**Response:**
```json
{
  "success": true,
  "alerts": [
    {
      "id": "uuid",
      "metal": "gold",
      "target_price": 5200,
      "direction": "above",
      "enabled": true,
      "triggered": false,
      "created_at": "2026-02-03T05:00:00Z"
    }
  ]
}
```

---

### 4. Cron Job ✅

**Frequency:** Every 5 minutes  
**Trigger:** Automatically starts when server launches  
**Logic:** Checks all active alerts against current spot prices

**Implementation in server.js:**
```javascript
const { startPriceAlertChecker } = require('./services/priceAlertChecker');

// Start price alert checker
startPriceAlertChecker(() => {
  // Return current spot prices
  return Promise.resolve(spotPriceCache.prices);
});
```

---

## Mobile App Integration (TODO)

### Changes Needed in App.js

#### 1. Sync Push Token to Backend

**Current code (line ~1801):**
```javascript
const registerForPushNotifications = async () => {
  // ... get token ...
  const token = tokenData.data;
  console.log('📱 [Notifications] Push Token:', token);
  return token; // ❌ Token is never saved
};
```

**New code:**
```javascript
const registerForPushNotifications = async () => {
  // ... get token ...
  const token = tokenData.data;
  console.log('📱 [Notifications] Push Token:', token);
  
  // ✅ Sync token to backend
  try {
    const deviceId = await AsyncStorage.getItem('device_id') || 
                     Constants.deviceId || 
                     `anon-${Date.now()}`;
    
    const response = await fetch(`${API_BASE_URL}/api/push-token/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expo_push_token: token,
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version,
        user_id: user?.id || null, // If using Supabase auth
        device_id: deviceId,
      }),
    });
    
    const result = await response.json();
    console.log('✅ Push token registered:', result);
  } catch (error) {
    console.error('❌ Failed to register push token:', error);
  }
  
  return token;
};
```

---

#### 2. Sync Price Alerts to Backend

**Add after alert creation/update:**
```javascript
const syncAlertsToBackend = async () => {
  try {
    const deviceId = await AsyncStorage.getItem('device_id') || 
                     Constants.deviceId || 
                     `anon-${Date.now()}`;
    
    const response = await fetch(`${API_BASE_URL}/api/price-alerts/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alerts: priceAlerts.map(alert => ({
          id: alert.id,
          metal: alert.metal,
          target_price: alert.targetPrice,
          direction: alert.direction,
          enabled: alert.enabled !== false,
        })),
        user_id: user?.id || null,
        device_id: deviceId,
      }),
    });
    
    const result = await response.json();
    console.log('✅ Alerts synced:', result);
  } catch (error) {
    console.error('❌ Failed to sync alerts:', error);
  }
};

// Call after creating/updating/deleting alerts
const createPriceAlert = (alert) => {
  const updated = [alert, ...priceAlerts];
  setPriceAlerts(updated);
  savePriceAlerts(updated);
  syncAlertsToBackend(); // ✅ Add this
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};
```

---

#### 3. Handle Incoming Notifications

**Add notification response listener:**
```javascript
useEffect(() => {
  // Listen for notification taps
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    
    if (data.type === 'price_alert') {
      console.log('🔔 Price alert tapped:', data);
      
      // Navigate to relevant screen or show alert details
      Alert.alert(
        `${data.metal.toUpperCase()} Price Alert`,
        `Current price: $${data.current_price}\nTarget: $${data.target_price}`,
        [{ text: 'OK' }]
      );
    }
  });
  
  return () => subscription.remove();
}, []);
```

---

## Testing Checklist

### Backend Testing

- [ ] **Run migration:**
  ```bash
  psql $DATABASE_URL < backend/migrations/003_create_push_notifications_tables.sql
  ```

- [ ] **Verify tables created:**
  ```sql
  SELECT * FROM push_tokens LIMIT 1;
  SELECT * FROM price_alerts LIMIT 1;
  SELECT * FROM notification_log LIMIT 1;
  ```

- [ ] **Start server and check logs:**
  ```bash
  cd backend
  npm install
  node server.js
  # Should see: "✅ Price Alert Checker: Supabase client initialized"
  # Should see: "🚀 Starting price alert checker (runs every 5 minutes)"
  ```

- [ ] **Test push token registration:**
  ```bash
  curl -X POST http://localhost:3000/api/push-token/register \
    -H "Content-Type: application/json" \
    -d '{
      "expo_push_token": "ExponentPushToken[test123]",
      "platform": "ios",
      "device_id": "test-device"
    }'
  ```

- [ ] **Test alert sync:**
  ```bash
  curl -X POST http://localhost:3000/api/push-token/sync \
    -H "Content-Type: application/json" \
    -d '{
      "alerts": [{
        "id": "test-alert-1",
        "metal": "gold",
        "target_price": 5200,
        "direction": "above",
        "enabled": true
      }],
      "device_id": "test-device"
    }'
  ```

---

### Mobile App Testing

- [ ] **Update App.js with sync code**
- [ ] **Create a price alert in app**
- [ ] **Check backend database for synced alert**
- [ ] **Manually trigger alert (update price in backend or database)**
- [ ] **Verify notification appears on device**
- [ ] **Tap notification and verify app behavior**
- [ ] **Test with app closed, backgrounded, and foregrounded**
- [ ] **Test on iOS and Android**

---

### Manual Alert Trigger (for testing)

**Update spot price in server.js temporarily:**
```javascript
// In server.js, after fetching prices:
spotPriceCache.prices.gold = 5250; // Force trigger
```

**Or update directly in database:**
```sql
-- Lower alert target to trigger immediately
UPDATE price_alerts 
SET target_price = 4000 
WHERE metal = 'gold' AND direction = 'above';
```

**Then watch server logs:**
```
🔍 Checking price alerts...
   Found 1 active alerts to check
   🔔 Alert triggered! gold above $5200
      Current price: $5250
   ✅ Notification sent for alert uuid
   📝 Alert uuid marked as triggered
✅ Price alert check complete in 234ms
   Stats: 1 checked, 1 triggered, 1 sent, 0 errors
```

---

## Environment Variables Required

**Backend (.env):**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Existing variables
GOLD_API_KEY=...
METAL_PRICE_API_KEY=...
ANTHROPIC_API_KEY=...
```

---

## Deployment

### Railway

1. **Add environment variables** in Railway dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Deploy:**
   ```bash
   git push origin bob/fix-push-notifications
   # Railway auto-deploys from GitHub
   ```

3. **Run migration:**
   ```bash
   # Connect to Supabase and run migration SQL
   ```

4. **Verify:**
   - Check Railway logs for "Price Alert Checker: Supabase client initialized"
   - Check Railway logs for "Starting price alert checker"

---

## Troubleshooting

### "Supabase not configured" in logs
**Cause:** Missing environment variables  
**Fix:** Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Railway

### "No push token found" in logs
**Cause:** Mobile app hasn't registered push token yet  
**Fix:** Ensure `/api/push-token/register` is called after user grants permission

### Notifications not arriving
**Causes:**
1. Push token expired (need to re-register)
2. Alert not synced to backend
3. Alert already triggered
4. Invalid token format

**Debug:**
```bash
# Check if alert exists
curl http://localhost:3000/api/price-alerts?device_id=test-device

# Check notification log
SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT 10;
```

### Alert triggered but no notification
**Check:** notification_log table for error messages

---

## Performance

- **Alert checks:** Every 5 minutes
- **Database queries per check:** O(active_alerts + triggered_alerts)
- **Expected load:** Very light (<100 alerts typically)
- **Notification delivery:** ~1-2 seconds via Expo API

---

## Security

- ✅ Row Level Security (RLS) enabled
- ✅ Users can only access their own tokens/alerts
- ✅ Service role bypasses RLS for backend operations
- ✅ No sensitive data in push notification payloads
- ✅ Tokens stored securely in database

---

## Next Steps

1. **Apply database migration** (see Testing Checklist)
2. **Deploy backend** to Railway
3. **Update mobile app** with sync code (see Mobile App Integration)
4. **Test end-to-end** on physical device
5. **Submit to TestFlight/Play Store** for beta testing

---

**Estimated Time to Complete:** 1-2 hours (mobile app integration + testing)  
**Risk Level:** Low (backend is self-contained, mobile changes are additive)  
**Production Ready:** Yes (after testing)
