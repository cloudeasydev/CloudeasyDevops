CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  slug varchar(200) NOT NULL,
  excerpt varchar(500),
  content text NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_idx ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS blog_posts_author_idx ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS blog_posts_public_idx ON blog_posts(is_public, updated_at DESC);
