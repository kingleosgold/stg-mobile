/**
 * Push Notifications API Endpoints
 * 
 * Add these endpoints to server.js before the "STARTUP" section
 * (around line 2170)
 */

// ============================================
// PUSH NOTIFICATIONS API ENDPOINTS
// ============================================

/**
 * Register or update a push token
 * POST /api/push-token/register
 * Body: { expo_push_token, platform, app_version, user_id?, device_id? }
 */
app.post('/api/push-token/register', async (req, res) => {
  try {
    const { expo_push_token, platform, app_version, user_id, device_id } = req.body;

    if (!expo_push_token) {
      return res.status(400).json({ success: false, error: 'expo_push_token is required' });
    }

    if (!user_id && !device_id) {
      return res.status(400).json({ success: false, error: 'Either user_id or device_id is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    // Check if token already exists
    const { data: existing, error: checkError } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('expo_push_token', expo_push_token)
      .single();

    if (existing) {
      // Update existing token
      const { error: updateError } = await supabase
        .from('push_tokens')
        .update({
          user_id: user_id || null,
          device_id: device_id || null,
          platform: platform || null,
          app_version: app_version || null,
          last_active: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating push token:', updateError);
        return res.status(500).json({ success: false, error: updateError.message });
      }

      console.log(`✅ Updated push token: ${expo_push_token.substring(0, 30)}...`);
      return res.json({ success: true, action: 'updated', id: existing.id });
    }

    // Insert new token
    const { data: inserted, error: insertError } = await supabase
      .from('push_tokens')
      .insert({
        user_id: user_id || null,
        device_id: device_id || null,
        expo_push_token,
        platform: platform || null,
        app_version: app_version || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting push token:', insertError);
      return res.status(500).json({ success: false, error: insertError.message });
    }

    console.log(`✅ Registered new push token: ${expo_push_token.substring(0, 30)}...`);
    res.json({ success: true, action: 'created', id: inserted.id });
  } catch (error) {
    console.error('Error in /api/push-token/register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a push token (when user logs out or disables notifications)
 * DELETE /api/push-token/delete
 * Body: { expo_push_token }
 */
app.delete('/api/push-token/delete', async (req, res) => {
  try {
    const { expo_push_token } = req.body;

    if (!expo_push_token) {
      return res.status(400).json({ success: false, error: 'expo_push_token is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('expo_push_token', expo_push_token);

    if (error) {
      console.error('Error deleting push token:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Deleted push token: ${expo_push_token.substring(0, 30)}...`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/push-token/delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Sync price alerts from mobile app
 * POST /api/price-alerts/sync
 * Body: { alerts: [{ id, metal, target_price, direction, enabled }], user_id?, device_id? }
 */
app.post('/api/price-alerts/sync', async (req, res) => {
  try {
    const { alerts, user_id, device_id } = req.body;

    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({ success: false, error: 'alerts array is required' });
    }

    if (!user_id && !device_id) {
      return res.status(400).json({ success: false, error: 'Either user_id or device_id is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const results = [];

    for (const alert of alerts) {
      try {
        // Check if alert exists (by client-side ID or UUID)
        const { data: existing } = await supabase
          .from('price_alerts')
          .select('id')
          .eq('id', alert.id)
          .single();

        if (existing) {
          // Update existing alert
          const { error: updateError } = await supabase
            .from('price_alerts')
            .update({
              metal: alert.metal,
              target_price: alert.target_price,
              direction: alert.direction,
              enabled: alert.enabled !== false,
            })
            .eq('id', alert.id);

          if (updateError) {
            results.push({ id: alert.id, success: false, error: updateError.message });
          } else {
            results.push({ id: alert.id, success: true, action: 'updated' });
          }
        } else {
          // Insert new alert
          const { data: inserted, error: insertError } = await supabase
            .from('price_alerts')
            .insert({
              id: alert.id, // Use client-provided UUID
              user_id: user_id || null,
              device_id: device_id || null,
              metal: alert.metal,
              target_price: alert.target_price,
              direction: alert.direction,
              enabled: alert.enabled !== false,
            })
            .select()
            .single();

          if (insertError) {
            results.push({ id: alert.id, success: false, error: insertError.message });
          } else {
            results.push({ id: inserted.id, success: true, action: 'created' });
          }
        }
      } catch (alertError) {
        results.push({ id: alert.id, success: false, error: alertError.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Synced ${successCount}/${alerts.length} price alerts`);

    res.json({ success: true, results, total: alerts.length, synced: successCount });
  } catch (error) {
    console.error('Error in /api/price-alerts/sync:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a price alert
 * DELETE /api/price-alerts/delete
 * Body: { alert_id }
 */
app.delete('/api/price-alerts/delete', async (req, res) => {
  try {
    const { alert_id } = req.body;

    if (!alert_id) {
      return res.status(400).json({ success: false, error: 'alert_id is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', alert_id);

    if (error) {
      console.error('Error deleting price alert:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Deleted price alert: ${alert_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/price-alerts/delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get user's price alerts
 * GET /api/price-alerts?user_id=xxx or ?device_id=xxx
 */
app.get('/api/price-alerts', async (req, res) => {
  try {
    const { user_id, device_id } = req.query;

    if (!user_id && !device_id) {
      return res.status(400).json({ success: false, error: 'Either user_id or device_id is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    let query = supabase.from('price_alerts').select('*');

    if (user_id) {
      query = query.eq('user_id', user_id);
    } else {
      query = query.eq('device_id', device_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching price alerts:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, alerts: data || [] });
  } catch (error) {
    console.error('Error in /api/price-alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test push notification endpoint (for debugging)
 * POST /api/push-test
 * Body: { expo_push_token, title?, body? }
 */
app.post('/api/push-test', async (req, res) => {
  try {
    const { expo_push_token, title, body } = req.body;

    if (!expo_push_token) {
      return res.status(400).json({ success: false, error: 'expo_push_token is required' });
    }

    const { sendPushNotification } = require('./services/expoPushNotifications');

    const result = await sendPushNotification(expo_push_token, {
      title: title || 'Test Notification',
      body: body || 'This is a test push notification from Stack Tracker Pro',
      data: { test: true },
    });

    res.json({ success: result.success, result });
  } catch (error) {
    console.error('Error in /api/push-test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
