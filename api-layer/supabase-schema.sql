-- ============================================================
-- MicroBiz Lab — Supabase (PostgreSQL) スキーマ
-- Data層: 永続化・集計用DB
--
-- Supabase Dashboard > SQL Editor でこのスクリプトを実行してください
-- ============================================================

-- ---- スコアテーブル ----
CREATE TABLE IF NOT EXISTS scores (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  TEXT UNIQUE NOT NULL,
  nickname    TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 30),
  game        TEXT NOT NULL CHECK (game IN ('physarum','quorum','hgt','redqueen')),
  xp          INTEGER NOT NULL CHECK (xp >= 0 AND xp <= 999999),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scores_game_xp_idx ON scores (game, xp DESC);
CREATE INDEX IF NOT EXISTS scores_created_idx ON scores (created_at DESC);

-- ---- セッションテーブル ----
CREATE TABLE IF NOT EXISTS sessions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  TEXT UNIQUE NOT NULL,
  game        TEXT NOT NULL CHECK (game IN ('physarum','quorum','hgt','redqueen')),
  events      JSONB DEFAULT '[]',
  duration_ms INTEGER DEFAULT 0,
  final_xp    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_game_idx      ON sessions (game);
CREATE INDEX IF NOT EXISTS sessions_final_xp_idx  ON sessions (final_xp DESC);

-- ---- RLS (Row Level Security) ----
ALTER TABLE scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 読み取りは全員OK
CREATE POLICY "scores_read_public"   ON scores   FOR SELECT USING (true);
CREATE POLICY "sessions_read_public" ON sessions FOR SELECT USING (true);

-- 書き込みはサービスロールキー（Cloudflare Functions）のみ
-- anon キーでは INSERT 不可（フロントから直接書き込み不可）
CREATE POLICY "scores_insert_service"   ON scores   FOR INSERT WITH CHECK (true);
CREATE POLICY "sessions_insert_service" ON sessions FOR INSERT WITH CHECK (true);

-- ---- ランキングビュー ----
CREATE OR REPLACE VIEW ranking_view AS
SELECT
  nickname,
  game,
  MAX(xp) AS best_xp,
  COUNT(*) AS play_count,
  MAX(created_at) AS last_played
FROM scores
GROUP BY nickname, game
ORDER BY best_xp DESC;

-- ---- ゲーム別統計ビュー ----
CREATE OR REPLACE VIEW game_stats_view AS
SELECT
  game,
  COUNT(*)                     AS total_plays,
  AVG(xp)::INTEGER             AS avg_xp,
  MAX(xp)                      AS max_xp,
  PERCENTILE_CONT(0.5)
    WITHIN GROUP (ORDER BY xp) AS median_xp
FROM scores
GROUP BY game;

-- ---- サンプルデータ（初期シード） ----
INSERT INTO scores (session_id, nickname, game, xp, created_at) VALUES
  ('seed-001', 'PhysarumKing',  'physarum', 4280, NOW() - INTERVAL '2 days'),
  ('seed-002', 'QuorumMaster',  'quorum',   3960, NOW() - INTERVAL '1 day'),
  ('seed-003', 'RedQueenAI',    'redqueen', 3750, NOW() - INTERVAL '3 hours'),
  ('seed-004', 'SlimeMold99',   'physarum', 3100, NOW() - INTERVAL '5 hours'),
  ('seed-005', 'HGTSpeed',      'hgt',      2890, NOW() - INTERVAL '6 hours'),
  ('seed-006', 'BuzzThreshold', 'quorum',   2340, NOW() - INTERVAL '12 hours'),
  ('seed-007', 'NetworkOptim',  'physarum', 1980, NOW() - INTERVAL '1 day'),
  ('seed-008', 'MutantDefense', 'redqueen', 1750, NOW() - INTERVAL '2 days')
ON CONFLICT (session_id) DO NOTHING;
