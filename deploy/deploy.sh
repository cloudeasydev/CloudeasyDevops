#!/usr/bin/env bash
# Production deploy — run on the server (or via .github/workflows/prod.yml).
# Preserves backend/.env, frontend/.env, deploy/ttyd/.env across git reset.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/CloudeasyDevops}"
WEB_ROOT="${WEB_ROOT:-/var/www/html}"
GIT_BRANCH="${GIT_BRANCH:-main}"
ENV_FILES=(backend/.env frontend/.env deploy/ttyd/.env)

log() { echo ">>> $*"; }

load_node() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
  if [ -s "$HOME/.profile" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.profile"
  fi
  nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
}

load_node

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node with nvm on the server, then re-run deploy."
  exit 1
fi
log "Node $(node -v), npm $(npm -v)"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Repository not found at $APP_DIR — clone it on the server first."
  exit 1
fi

cd "$APP_DIR"

ENV_BACKUP_DIR="$(mktemp -d)"
for rel in "${ENV_FILES[@]}"; do
  if [ -f "$APP_DIR/$rel" ]; then
    cp -a "$APP_DIR/$rel" "$ENV_BACKUP_DIR/$(echo "$rel" | tr '/' '_')"
  fi
done

log "Pull latest $GIT_BRANCH (server .env files backed up and restored)"
git fetch origin "$GIT_BRANCH"
git checkout "$GIT_BRANCH"
git reset --hard "origin/$GIT_BRANCH"

for rel in "${ENV_FILES[@]}"; do
  bak="$ENV_BACKUP_DIR/$(echo "$rel" | tr '/' '_')"
  if [ -f "$bak" ]; then
    mkdir -p "$(dirname "$APP_DIR/$rel")"
    cp -a "$bak" "$APP_DIR/$rel"
  fi
done
rm -rf "$ENV_BACKUP_DIR"

log "Terminal (ttyd Docker) — terminal.cloudeasy.site"
TTYD_DIR="$APP_DIR/deploy/ttyd"
if [ -f "$TTYD_DIR/docker-compose.yml" ]; then
  if command -v docker >/dev/null 2>&1; then
    cd "$TTYD_DIR"
    if [ ! -f .env ]; then
      echo "WARN: $TTYD_DIR/.env missing — copy .env.example to .env and set TTYD_CREDENTIALS"
    else
      docker compose pull -q 2>/dev/null || true
      docker compose up -d --remove-orphans
      docker compose ps
    fi
  else
    echo "WARN: docker not installed — skip ttyd (run manually on port 3000)"
  fi
fi

log "Backend: npm ci, build, PM2 (PORT from backend/.env, e.g. 8000)"
cd "$APP_DIR/backend"
npm ci
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 not found. Install: npm i -g pm2"
  exit 1
fi
pm2 startOrRestart ecosystem.config.cjs --only cloudeasy-backend --update-env
pm2 save

log "Frontend: npm ci, build (uses frontend/.env on server)"
cd "$APP_DIR/frontend"
npm ci
npm run build

log "Publish frontend to $WEB_ROOT"
sudo rsync -a --delete --exclude '.env' --exclude '.env.*' "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT"

if command -v nginx >/dev/null 2>&1; then
  log "Reload nginx (api vhost must proxy /api/ to backend PORT, e.g. 8000, with WebSocket upgrade)"
  sudo nginx -t
  sudo systemctl reload nginx
else
  echo "nginx not found — serve frontend/dist with your web server."
fi

log "Deploy finished"
