#!/usr/bin/env bash
# Deploy textflow to Cloudflare Workers static assets (Worker sebland-textflow, route textflow.sebland.com/*).
# Builds the repo's own Dockerfile (same toolchain the nginx container used), copies the served
# dir (/usr/share/nginx/html) out of the image, adds cf/_headers + icon fallbacks, then wrangler deploy.
#   ./cf-deploy.sh             build + deploy
#   ./cf-deploy.sh --dry-run   build + wrangler deploy --dry-run
set -euo pipefail
cd "$(dirname "$0")"
OUT=dist-cf; img=cfdeploy-textflow
docker build -q -t "$img" . >/dev/null
cid=$(docker create "$img"); trap 'docker rm -f "$cid" >/dev/null; docker rmi "$img" >/dev/null 2>&1 || true' EXIT
rm -rf "$OUT"; docker cp -q "$cid:/usr/share/nginx/html" "$OUT"
# Caddy: uri strip_prefix /textflow (the build links /textflow/assets/...): same files at / and /textflow/
mkdir -p "$OUT.tmp" && cp -a "$OUT" "$OUT.tmp/textflow" && cp -a "$OUT.tmp/textflow" "$OUT/textflow" && rm -rf "$OUT.tmp"
cp cf/_headers "$OUT/_headers"
# icon probes must never get the HTML shell (iOS Safari spinner): own icon, else the sebland one,
# exactly what Caddy's proxy_icons/nginx did before
[ -e "$OUT/favicon.ico" ] || cp "$( [ -e "$OUT/favicon.png" ] && echo "$OUT/favicon.png" || echo cf/icons/favicon.ico)" "$OUT/favicon.ico"
[ -e "$OUT/apple-touch-icon-precomposed.png" ] || cp "$( [ -e "$OUT/apple-touch-icon.png" ] && echo "$OUT/apple-touch-icon.png" || echo cf/icons/apple-touch-icon-precomposed.png)" "$OUT/apple-touch-icon-precomposed.png"
for f in favicon.png apple-touch-icon.png; do [ -e "$OUT/$f" ] || cp "cf/icons/$f" "$OUT/$f"; done
set -a; . /root/seb/.env; set +a
export CLOUDFLARE_API_TOKEN=$CF_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID
npx -y wrangler@4 deploy "$@"
