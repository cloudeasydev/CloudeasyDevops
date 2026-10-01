CREATE TABLE IF NOT EXISTS drive_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES drive_nodes(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  node_type varchar(10) NOT NULL,
  s3_key text,
  mime_type varchar(120),
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_nodes_user_parent_idx ON drive_nodes(user_id, parent_id);
