#!/usr/bin/env bash
# Q1 + Q8. Measures the designed path:
#   job 1: base worktree, host install, host build with read-only remote cache
#   job 2: head worktree; host `pnpm fetch` from head's lockfile alone; sandbox offline install + `pnpm rebuild` + turbo build with no token
set -euo pipefail
BASE=$1; HEAD=$2; PKG=$3            # e.g. abc123 def456 @memberjunction/core
ROOT=$(git rev-parse --show-toplevel)
WORK=${RUNNER_TEMP:-/tmp}/jit-q1; rm -rf "$WORK"; mkdir -p "$WORK"
STORE=$WORK/pnpm-store              # filled on the host by `pnpm fetch`, mounted into the sandbox at /pnpm-store
IMG=jit-sandbox:spike
docker build -q -f "$ROOT/plans/catching-jittests-spike/Dockerfile.sandbox" -t $IMG "$ROOT/plans/catching-jittests-spike"
t() { date +%s; }
disk() { du -sm "$1" | cut -f1; }

echo "== job 1: base $BASE"
T0=$(t); git worktree add --detach "$WORK/base" "$BASE"
( cd "$WORK/base" && pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild )
T1=$(t); echo "base install: $((T1-T0))s, disk after install: $(disk "$WORK/base")MB"
( cd "$WORK/base" && TURBO_CACHE_DIR=.turbo/cache npx turbo run build --filter="$PKG..." --cache=local:rw,remote:r --summarize >/dev/null )
T2=$(t); echo "base build (remote:r): $((T2-T1))s, disk: $(disk "$WORK/base")MB"
node -e 'const s=require("fs").readdirSync(process.argv[1]).map(f=>require(process.argv[1]+"/"+f)).at(-1);const c=s.tasks.map(t=>t.cache.status);console.log("base cache statuses:",JSON.stringify(c.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{})))' "$WORK/base/.turbo/runs"

echo "== job 2: head $HEAD"
T3=$(t); git worktree add --detach "$WORK/head" "$HEAD"
# Host side: only the lockfile leaves the worktree. No manifest, .npmrc or .pnpmfile.cjs in the fetch folder,
# so pnpm reads nothing from head as configuration and runs the host's own pnpm version.
mkdir -p "$WORK/fetch" "$STORE"; cp "$WORK/head/pnpm-lock.yaml" "$WORK/fetch/"
( cd "$WORK/fetch" && pnpm fetch --store-dir "$STORE" )
T4=$(t); echo "head fetch (host, lockfile only): $((T4-T3))s, store: $(disk "$STORE")MB"
cp -r "$WORK/base/.turbo/cache" "$WORK/head/.turbo-seed"
mkdir -p "$WORK/head/.turbo/cache"   # mount point owned by the runner user, not created by Docker as root
docker run --rm --network none --pids-limit 1024 --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
  -e TURBO_CACHE_DIR=/work/.turbo/cache -e TURBO_TELEMETRY_DISABLED=1 -e HOME=/tmp \
  -v "$WORK/head:/work" -v "$STORE:/pnpm-store" -v "$WORK/head/.turbo-seed:/work/.turbo/cache" $IMG \
  sh -c "cd /work && pnpm install --offline --frozen-lockfile --ignore-scripts && echo INSTALLED && pnpm rebuild && npx turbo run build --filter='$PKG...' --cache=local:rw,remote:r --summarize >/dev/null"
T5=$(t); echo "head install+rebuild+build (sandbox, offline, no token): $((T5-T4))s, disk head: $(disk "$WORK/head")MB"
node -e 'const s=require("fs").readdirSync(process.argv[1]).map(f=>require(process.argv[1]+"/"+f)).at(-1);const c=s.tasks.map(t=>t.cache.status);console.log("head cache statuses:",JSON.stringify(c.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{})))' "$WORK/head/.turbo/runs"
echo "total disk: $(disk "$WORK")MB; free: $(df -m "$WORK" | tail -1 | awk '{print $4}')MB"
git worktree remove --force "$WORK/base"; git worktree remove --force "$WORK/head"
