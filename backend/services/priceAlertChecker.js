/**
 * Price Alert Checker Service
 * 
 * Periodically checks price alerts against current spot prices
 * and sends push notifications when alerts are triggered
 */

const { createClient } = require('@supabase/supabase-js');
const { sendPushNotification, isValidExpoPushToken } = require('./expoPushNotifications');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

// Initialize Supabase client (only if configured)
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('✅ Price Alert Checker: Supabase client initialized');
} else {
  console.log('⚠️  Price Alert Checker: Supabase not configured, alerts disabled');
}

/**
 * Check all active price alerts and send notifications for triggered alerts
 * 
 * @param {object} currentPrices - Current spot prices { gold, silver, platinum, palladium }
 * @returns {Promise<object>} Summary of checks and notifications sent
 */
async function checkPriceAlerts(currentPrices) {
  if (!supabase) {
    console.log('⏭️  Skipping price alert check (Supabase not configured)');
    return { checked: 0, triggered: 0, sent: 0, errors: 0 };
  }

  if (!currentPrices || typeof currentPrices !== 'object') {
    console.error('❌ Invalid currentPrices:', currentPrices);
    return { checked: 0, triggered: 0, sent: 0, errors: 0 };
  }

  const startTime = Date.now();
  console.log('🔍 Checking price alerts...');
  console.log('   Current prices:', currentPrices);

  let stats = {
    checked: 0,
    triggered: 0,
    sent: 0,
    errors: 0,
  };

  try {
    // Fetch all active, untriggered alerts
    const { data: alerts, error: alertsError } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('enabled', true)
      .eq('triggered', false);

    if (alertsError) {
      console.error('❌ Error fetching price alerts:', alertsError);
      return stats;
    }

    if (!alerts || alerts.length === 0) {
      console.log('   No active alerts to check');
      return stats;
    }

    console.log(`   Found ${alerts.length} active alerts to check`);
    stats.checked = alerts.length;

    // Check each alert
    for (const alert of alerts) {
      try {
        const currentPrice = currentPrices[alert.metal];

        if (!currentPrice || currentPrice <= 0) {
          console.log(`   ⚠️  No valid price for ${alert.metal}, skipping alert ${alert.id}`);
          continue;
        }

        // Check if alert should trigger
        const shouldTrigger =
          (alert.direction === 'above' && currentPrice >= alert.target_price) ||
          (alert.direction === 'below' && currentPrice <= alert.target_price);

        if (!shouldTrigger) {
          continue;
        }

        stats.triggered++;
        console.log(`   🔔 Alert triggered! ${alert.metal} ${alert.direction} $${alert.target_price}`);
        console.log(`      Current price: $${currentPrice}`);

        // Get user's push token
        const { data: tokenData, error: tokenError } = await supabase
          .from('push_tokens')
          .select('expo_push_token, platform')
          .or(`user_id.eq.${alert.user_id},device_id.eq.${alert.device_id}`)
          .order('last_active', { ascending: false })
          .limit(1)
          .single();

        if (tokenError || !tokenData) {
          console.log(`   ⚠️  No push token found for alert ${alert.id}`);
          stats.errors++;
          
          // Still mark as triggered to avoid repeated checks
          await markAlertTriggered(alert.id, currentPrice, false, 'No push token found');
          continue;
        }

        const pushToken = tokenData.expo_push_token;

        if (!isValidExpoPushToken(pushToken)) {
          console.log(`   ⚠️  Invalid push token format: ${pushToken}`);
          stats.errors++;
          await markAlertTriggered(alert.id, currentPrice, false, 'Invalid token format');
          continue;
        }

        // Send push notification
        try {
          const notification = {
            title: `${capitalizeFirstLetter(alert.metal)} Price Alert`,
            body: `${capitalizeFirstLetter(alert.metal)} has ${alert.direction === 'above' ? 'risen to' : 'fallen to'} $${currentPrice.toFixed(2)}`,
            data: {
              type: 'price_alert',
              alert_id: alert.id,
              metal: alert.metal,
              target_price: alert.target_price,
              current_price: currentPrice,
              direction: alert.direction,
            },
            sound: 'default',
            priority: 'high',
          };

          const result = await sendPushNotification(pushToken, notification);

          if (result.success) {
            stats.sent++;
            console.log(`   ✅ Notification sent for alert ${alert.id}`);

            // Mark alert as triggered and log notification
            await markAlertTriggered(alert.id, currentPrice, true, null);
            await logNotification(alert, pushToken, currentPrice, result);
          } else {
            stats.errors++;
            console.log(`   ❌ Failed to send notification: ${result.error}`);
            await markAlertTriggered(alert.id, currentPrice, false, result.error);
          }
        } catch (sendError) {
          stats.errors++;
          console.error(`   ❌ Error sending notification for alert ${alert.id}:`, sendError.message);
          await markAlertTriggered(alert.id, currentPrice, false, sendError.message);
        }
      } catch (alertError) {
        stats.errors++;
        console.error(`   ❌ Error processing alert ${alert.id}:`, alertError.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Price alert check complete in ${duration}ms`);
    console.log(`   Stats: ${stats.checked} checked, ${stats.triggered} triggered, ${stats.sent} sent, ${stats.errors} errors`);

    return stats;
  } catch (error) {
    console.error('❌ Price alert check failed:', error.message);
    return stats;
  }
}

/**
 * Mark an alert as triggered in the database
 * 
 * @param {string} alertId - Alert UUID
 * @param {number} triggeredPrice - Price at which alert triggered
 * @param {boolean} notificationSent - Whether notification was sent successfully
 * @param {string} errorMessage - Error message if notification failed
 */
async function markAlertTriggered(alertId, triggeredPrice, notificationSent, errorMessage) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('price_alerts')
      .update({
        triggered: true,
        triggered_at: new Date().toISOString(),
        triggered_price: triggeredPrice,
      })
      .eq('id', alertId);

    if (error) {
      console.error(`❌ Failed to mark alert ${alertId} as triggered:`, error);
    } else {
      console.log(`   📝 Alert ${alertId} marked as triggered`);
    }
  } catch (error) {
    console.error(`❌ Error marking alert as triggered:`, error.message);
  }
}

/**
 * Log a notification to the notification_log table
 * 
 * @param {object} alert - Alert object
 * @param {string} pushToken - Expo push token
 * @param {number} actualPrice - Actual price when triggered
 * @param {object} result - Result from sendPushNotification
 */
async function logNotification(alert, pushToken, actualPrice, result) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('notification_log')
      .insert({
        alert_id: alert.id,
        expo_push_token: pushToken,
        metal: alert.metal,
        target_price: alert.target_price,
        actual_price: actualPrice,
        direction: alert.direction,
        success: result.success,
        error_message: result.error || null,
        expo_receipt_id: result.receiptId || null,
        expo_status: result.ticket?.status || null,
      });

    if (error) {
      console.error('❌ Failed to log notification:', error);
    }
  } catch (error) {
    console.error('❌ Error logging notification:', error.message);
  }
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Start the price alert checker (called by server.js)
 * Runs every 5 minutes
 * 
 * @param {function} getPricesCallback - Function that returns current spot prices
 * @returns {NodeJS.Timer} Interval handle
 */
function startPriceAlertChecker(getPricesCallback) {
  if (!supabase) {
    console.log('⚠️  Price alert checker not started (Supabase not configured)');
    return null;
  }

  console.log('🚀 Starting price alert checker (runs every 5 minutes)');

  // Run immediately on startup
  getPricesCallback().then(prices => {
    checkPriceAlerts(prices).catch(err => {
      console.error('Price alert check failed:', err.message);
    });
  });

  // Then run every 5 minutes
  const interval = setInterval(() => {
    getPricesCallback().then(prices => {
      checkPriceAlerts(prices).catch(err => {
        console.error('Price alert check failed:', err.message);
      });
    });
  }, 5 * 60 * 1000); // 5 minutes

  return interval;
}

module.exports = {
  checkPriceAlerts,
  startPriceAlertChecker,
};
