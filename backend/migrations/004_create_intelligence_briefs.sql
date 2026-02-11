-- Migration: Create intelligence_briefs table for Today tab
-- Date: 2026-02-10

CREATE TABLE IF NOT EXISTS intelligence_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('market_brief', 'breaking_news', 'policy', 'supply_demand', 'analysis')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source TEXT,
  source_url TEXT,
  relevance_score INTEGER CHECK (relevance_score >= 1 AND relevance_score <= 100),
  gold_price_at_publish NUMERIC,
  silver_price_at_publish NUMERIC,
  platinum_price_at_publish NUMERIC,
  palladium_price_at_publish NUMERIC,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on date + category for fast daily lookups
CREATE INDEX IF NOT EXISTS idx_intelligence_briefs_date_category
  ON intelligence_briefs (date, category);

-- Enable Row Level Security
ALTER TABLE intelligence_briefs ENABLE ROW LEVEL SECURITY;

-- Allow anonymous SELECT (read-only for all users)
CREATE POLICY "Allow public read access"
  ON intelligence_briefs
  FOR SELECT
  USING (true);

-- Grant access to the anon role
GRANT SELECT ON intelligence_briefs TO anon;
GRANT SELECT ON intelligence_briefs TO authenticated;
