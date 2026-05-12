-- DSA Revision Tracker — Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- NOTE: If you already ran the old schema, run the migration below instead

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id TEXT UNIQUE NOT NULL,
  telegram_username TEXT,
  link_code TEXT UNIQUE,
  link_code_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solved questions (logged by browser extension)
CREATE TABLE solved_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_title TEXT NOT NULL,
  question_slug TEXT,
  question_url TEXT,
  difficulty TEXT CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  topic TEXT,
  solved_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revision schedule (auto-created after each solve)
CREATE TABLE revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES solved_questions(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  revision_day INT CHECK (revision_day IN (1, 3, 7)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_revisions_due_date ON revisions(due_date);
CREATE INDEX idx_revisions_user ON revisions(user_id);
CREATE INDEX idx_solved_user ON solved_questions(user_id);

-- Auto-create revision schedule when a question is solved
CREATE OR REPLACE FUNCTION create_revision_schedule()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO revisions (user_id, question_id, due_date, revision_day)
  VALUES
    (NEW.user_id, NEW.id, NEW.solved_at + INTERVAL '1 day', 1),
    (NEW.user_id, NEW.id, NEW.solved_at + INTERVAL '3 days', 3),
    (NEW.user_id, NEW.id, NEW.solved_at + INTERVAL '7 days', 7);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_question_solved
AFTER INSERT ON solved_questions
FOR EACH ROW EXECUTE FUNCTION create_revision_schedule();

-- ─── MIGRATION (run this if you already have the old schema) ──────────────────
-- ALTER TABLE revisions DROP COLUMN IF EXISTS status;
-- ALTER TABLE revisions DROP COLUMN IF EXISTS carried_from;
-- ALTER TABLE revisions DROP COLUMN IF EXISTS is_carry_attempt;
-- ALTER TABLE revisions DROP COLUMN IF EXISTS notified_at;
-- ALTER TABLE revisions DROP COLUMN IF EXISTS completed_at;
-- DROP TABLE IF EXISTS notification_log;
-- DROP FUNCTION IF EXISTS handle_missed_revisions;