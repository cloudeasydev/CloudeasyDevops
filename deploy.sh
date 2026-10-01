#!/usr/bin/env bash
# Production deploy — run on the server: ./deploy.sh
# Or via GitHub Actions: .github/workflows/prod.yml
# Preserves backend/.env and frontend/.env across git reset.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
WEB_ROOT="${WEB_ROOT:-/var/www/html}"
GIT_BRANCH="${GIT_BRANCH:-main}"
ENV_FILES=(backend/.env frontend/.env)

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

log "Backend: npm ci, build, PM2"
cd "$APP_DIR/backend"
npm ci
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 not found. Install: npm i -g pm2"
  exit 1
fi
pm2 startOrRestart ecosystem.config.cjs --only cloudeasy-backend --update-env
pm2 save

log "Frontend: npm ci, build"
cd "$APP_DIR/frontend"
npm ci
npm run build

log "Publish frontend to $WEB_ROOT"
sudo rsync -a --delete --exclude '.env' --exclude '.env.*' "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT"

if command -v nginx >/dev/null 2>&1; then
  log "Reload nginx"
  sudo nginx -t
  sudo systemctl reload nginx
fi

log "Deploy finished"
