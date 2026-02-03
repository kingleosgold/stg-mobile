# Push Notifications - Progress Report

**Branch:** bob/fix-push-notifications  
**Started:** 2026-02-03 12:20 AM EST  
**Status:** 🟡 Investigation complete, partial fix applied

---

## TL;DR

**Root Cause:** Push notifications were **never fully implemented**. Only the UI/storage exists.

**What I Fixed:**
- ✅ Platform bug (iOS vs Android notification channel setup)

**What Still Needs Work:**
- ❌ No backend logic to check price alerts
- ❌ No code to send notifications when alerts trigger
- ❌ Push tokens not saved anywhere

**Recommendation:** Implement Background Fetch solution (1-2 hours) OR full backend (4-6 hours)

---

## Investigation Findings

### Current Implementation Status

**✅ What Exists:**
- User can create price alerts in app
- Alerts stored in AsyncStorage (`stack_price_alerts`)
- Expo push token registration works
- UI shows active alerts count

**❌ What's Missing:**
- Backend never checks if prices hit alert targets
- No notification sending logic
- Push tokens get generated but never saved
- Alerts sit in storage forever, never evaluated

**Quote from code (App.js line 2208):**
```javascript
// TODO: Backend implementation needed:
//   - Sync alert preferences to Supabase
//   - Backend cron job compares cached spot prices against user targets
//   - Send push notifications via Expo when conditions are met
```

---

## Bug Fixed

**File:** `mobile-app/App.js` (line ~1786)

**Before:**
```javascript
// Configure for iOS  ❌ WRONG
if (Platform.OS === 'ios') {
  await Notifications.setNotificationChannelAsync('default', {
    // Android-only API called on iOS!
  });
}
```

**After:**
```javascript
// Configure notification channel for Android  ✅ CORRECT
if (Platform.OS === 'android') {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#fbbf24',
  });
}
```

**Impact:** Fixes Android notification channel setup (was silently failing on iOS before)

---

## Solutions to Complete Feature

### Option 1: Background Fetch (Simpler, 1-2 hours)

**How it works:**
- iOS/Android wake app every 15-30 minutes (in background)
- App fetches spot prices from API
- Checks local alerts in AsyncStorage
- Sends **local notification** if alert triggered

**Pros:**
- No backend changes needed
- Simpler implementation
- Works offline after initial price fetch

**Cons:**
- Less reliable (OS can skip background tasks)
- iOS limits frequency (15+ min minimum)
- Battery drain
- App must be installed (obviously)

**Implementation File:** `mobile-app/src/utils/backgroundTasks.js` (partial code exists)

**Pseudocode:**
```javascript
TaskManager.defineTask('price-alert-check', async () => {
  const prices = await fetchSpotPrices();
  const alerts = await loadAlertsFromStorage();
  
  for (const alert of alerts) {
    if (shouldTrigger(alert, prices)) {
      await Notifications.scheduleNotificationAsync({
        title: `${alert.metal} Price Alert`,
        body: `${alert.metal} hit $${prices[alert.metal]}`,
        trigger: null, // immediate
      });
      alert.triggered = true; // disable it
    }
  }
  
  await saveAlertsToStorage(alerts);
});

BackgroundFetch.registerTaskAsync('price-alert-check', {
  minimumInterval: 15 * 60, // 15 min
});
```

---

### Option 2: Full Backend Implementation (Robust, 4-6 hours)

**How it works:**
- Mobile app syncs alerts to Supabase
- Backend cron runs every 5 minutes
- Checks all user alerts against current spot prices
- Sends Expo push notifications via API
- Marks alerts as triggered

**Pros:**
- Reliable (server-side, always runs)
- Works even if app is uninstalled (until token expires)
- Better for multiple devices
- Can add more complex logic (e.g., "notify 5% above")

**Cons:**
- Requires backend changes
- More complex
- Need to handle token expiration

**Database Tables Needed:**
```sql
-- Store push tokens
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY,
  user_id UUID,
  expo_push_token TEXT,
  last_active TIMESTAMP
);

-- Store alerts
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY,
  user_id UUID,
  metal TEXT,
  target_price DECIMAL,
  direction TEXT, -- 'above' or 'below'
  triggered BOOLEAN DEFAULT FALSE
);
```

**Backend Cron Job:**
```javascript
// backend/services/priceAlertChecker.js
setInterval(async () => {
  const prices = getCurrentSpotPrices();
  const alerts = await getActiveAlerts();
  
  for (const alert of alerts) {
    if (shouldTrigger(alert, prices)) {
      const token = await getUserPushToken(alert.user_id);
      await sendExpoPushNotification(token, {
        title: `${alert.metal} Price Alert`,
        body: `${alert.metal} is now $${prices[alert.metal]}`,
      });
      await markAlertTriggered(alert.id);
    }
  }
}, 5 * 60 * 1000); // Every 5 min
```

---

## Recommendations

**For Jon to Decide:**

1. **Quick Win (Option 3):** Accept current state, fix platform bug only
   - **Time:** 5 minutes ✅ (already done)
   - **Impact:** Fixes Android setup
   - **Trade-off:** Alerts still don't work, but app is more correct

2. **MVP Solution (Option 1):** Implement Background Fetch
   - **Time:** 1-2 hours
   - **Impact:** Alerts work locally
   - **Trade-off:** Less reliable, battery drain

3. **Production Solution (Option 2):** Full backend implementation
   - **Time:** 4-6 hours
   - **Impact:** Reliable, scalable
   - **Trade-off:** More complex, requires backend/DB changes

---

## Testing After Implementation

**Test Checklist:**
- [ ] Create price alert (Gold > $5200)
- [ ] Wait for background task to run (15+ min)
- [ ] OR manually trigger alert for testing
- [ ] Verify notification appears on lock screen
- [ ] Test with app closed
- [ ] Test with app in background
- [ ] Test on iOS device
- [ ] Test on Android device
- [ ] Verify alert is marked as triggered (doesn't repeat)

---

## Files Modified

**mobile-app/App.js:**
- Line ~1786: Fixed platform check (iOS → Android)

---

## Files to Reference

**Detailed investigation:** `PUSH_NOTIFICATIONS_FINDINGS.md`
- Complete analysis of current implementation
- Detailed code examples for both solutions
- Database schemas
- Testing procedures

---

## Next Steps

1. **Jon decides** which solution to pursue (1, 2, or 3)
2. If Option 1: Implement background fetch in `backgroundTasks.js`
3. If Option 2: Build backend tables + cron job + sync logic
4. Test on physical device (push notifications don't work in simulator)
5. Deploy to TestFlight/Play Store for real-world testing

---

## Current State

**Branch Status:** bob/fix-push-notifications
- Platform bug fixed ✅
- Investigation complete ✅
- Ready for implementation decision

**What's Committed:**
- Platform bug fix (iOS vs Android)
- Investigation docs (PUSH_NOTIFICATIONS_FINDINGS.md)
- Progress report (this file)

**What's NOT Done:**
- Alert checking logic (backend OR background fetch)
- Push notification sending logic
- Token storage/syncing

---

**Time Spent:** 1 hour (investigation + doc + fix)  
**Complexity:** Medium (feature incomplete, not broken)  
**Priority:** Medium (users can create alerts but they don't trigger)
