-- Migration: Historical Spot Price System Tables
-- Run this in your Supabase SQL Editor
-- Created: 2026-01-14

-- ============================================================================
-- Table: etf_ratios
-- Purpose: Store daily ETF-to-spot conversion ratios for calibrating SLV/GLD
-- ============================================================================
CREATE TABLE IF NOT EXISTS etf_ratios (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  slv_ratio DECIMAL(10,6),  -- SLV price / silver spot price
  gld_ratio DECIMAL(10,6),  -- GLD price / gold spot price
  slv_price DECIMAL(10,4),  -- Raw SLV ETF price for reference
  gld_price DECIMAL(10,4),  -- Raw GLD ETF price for reference
  gold_spot DECIMAL(10,4),  -- Gold spot used for calibration
  silver_spot DECIMAL(10,4), -- Silver spot used for calibration
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_etf_ratios_date ON etf_ratios(date);

-- ============================================================================
-- Table: price_log
-- Purpose: Log every spot price fetch to build our own minute-level dataset
-- This accumulates over time, giving us high-granularity historical data
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  gold_price DECIMAL(10,4),
  silver_price DECIMAL(10,4),
  platinum_price DECIMAL(10,4),
  palladium_price DECIMAL(10,4),
  source VARCHAR(50) DEFAULT 'metalpriceapi',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast timestamp lookups (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_price_log_timestamp ON price_log(timestamp);

-- Index for source filtering if needed
CREATE INDEX IF NOT EXISTS idx_price_log_source ON price_log(source);

-- ============================================================================
-- Table: etf_daily_cache
-- Purpose: Cache daily ETF OHLC data to reduce Yahoo Finance API calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS etf_daily_cache (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  open_price DECIMAL(10,4),
  high_price DECIMAL(10,4),
  low_price DECIMAL(10,4),
  close_price DECIMAL(10,4),
  volume BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(symbol, date)
);

-- Index for fast symbol+date lookups
CREATE INDEX IF NOT EXISTS idx_etf_daily_cache_lookup ON etf_daily_cache(symbol, date);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE etf_ratios IS 'Daily calibration ratios between ETF prices and spot prices';
COMMENT ON TABLE price_log IS 'Minute-level spot price log built from MetalPriceAPI fetches';
COMMENT ON TABLE etf_daily_cache IS 'Cached ETF OHLC data from Yahoo Finance';

COMMENT ON COLUMN etf_ratios.slv_ratio IS 'SLV ETF price divided by silver spot - typically ~0.92';
COMMENT ON COLUMN etf_ratios.gld_ratio IS 'GLD ETF price divided by gold spot - typically ~0.092';
COMMENT ON COLUMN price_log.source IS 'Source of price data: metalpriceapi, goldapi, etc.';

-- ============================================================================
-- Migration: Add PPLT/PALL ratio columns to etf_ratios
-- Run this if the table already exists
-- ============================================================================
ALTER TABLE etf_ratios ADD COLUMN IF NOT EXISTS pplt_ratio DECIMAL(10,6);
ALTER TABLE etf_ratios ADD COLUMN IF NOT EXISTS pall_ratio DECIMAL(10,6);
