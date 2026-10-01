CREATE TABLE IF NOT EXISTS dev_generator_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  category varchar(40),
  model varchar(120) NOT NULL,
  files jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_generator_history_user_idx ON dev_generator_history(user_id, created_at DESC);
