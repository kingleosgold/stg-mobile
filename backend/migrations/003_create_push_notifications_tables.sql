-- Migration: Create push notifications tables
-- Date: 2026-02-03
-- Purpose: Enable backend-driven price alert notifications

-- ============================================
-- PUSH TOKENS TABLE
-- ============================================
-- Stores Expo push tokens for sending notifications
-- Supports both authenticated users and anonymous devices

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT, -- For anonymous users (fallback)
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT, -- 'ios' or 'android'
  app_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure either user_id or device_id is present
  CONSTRAINT push_tokens_user_or_device CHECK (
    user_id IS NOT NULL OR device_id IS NOT NULL
  )
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_id ON push_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_last_active ON push_tokens(last_active);

-- ============================================
-- PRICE ALERTS TABLE
-- ============================================
-- Stores user-defined price alerts

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT, -- For anonymous users (fallback)
  
  -- Alert configuration
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver', 'platinum', 'palladium')),
  target_price DECIMAL(10,2) NOT NULL CHECK (target_price > 0),
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  
  -- Alert state
  enabled BOOLEAN DEFAULT TRUE,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMP WITH TIME ZONE,
  triggered_price DECIMAL(10,2),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure either user_id or device_id is present
  CONSTRAINT price_alerts_user_or_device CHECK (
    user_id IS NOT NULL OR device_id IS NOT NULL
  )
);

-- Indexes for fast alert checking
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_device_id ON price_alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(enabled, triggered) 
  WHERE enabled = TRUE AND triggered = FALSE;
CREATE INDEX IF NOT EXISTS idx_price_alerts_metal ON price_alerts(metal);

-- ============================================
-- NOTIFICATION LOG TABLE (Optional - for debugging)
-- ============================================
-- Tracks sent notifications for analytics and debugging

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES price_alerts(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  
  -- Notification details
  metal TEXT NOT NULL,
  target_price DECIMAL(10,2) NOT NULL,
  actual_price DECIMAL(10,2) NOT NULL,
  direction TEXT NOT NULL,
  
  -- Delivery status
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  
  -- Expo response
  expo_receipt_id TEXT,
  expo_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_log_alert_id ON notification_log(alert_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Push Tokens: Users can only access their own tokens
CREATE POLICY "Users can insert their own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Users can view their own push tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Price Alerts: Users can manage their own alerts
CREATE POLICY "Users can insert their own price alerts"
  ON price_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Users can view their own price alerts"
  ON price_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own price alerts"
  ON price_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own price alerts"
  ON price_alerts FOR DELETE
  USING (auth.uid() = user_id);

-- Notification Log: Users can view their notification history
CREATE POLICY "Users can view their notification log"
  ON notification_log FOR SELECT
  USING (
    alert_id IN (
      SELECT id FROM price_alerts WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON price_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANTS (for service role / backend)
-- ============================================

-- Grant backend service role full access to these tables
-- (Replace 'service_role' with your actual service role name if different)

GRANT ALL ON push_tokens TO service_role;
GRANT ALL ON price_alerts TO service_role;
GRANT ALL ON notification_log TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
