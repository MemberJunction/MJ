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
# Counts turbo task cache results by status/source (e.g. HIT/REMOTE) from the newest run summary.
statuses() { node -e 'const d=process.argv[1];const s=require("fs").readdirSync(d).sort().map(f=>require(d+"/"+f)).at(-1);const c=s.tasks.map(t=>t.cache.status+(t.cache.source?"/"+t.cache.source:""));console.log(JSON.stringify(c.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{})))' "$1" 2>/dev/null || echo "no run summary"; }
# Runs the build half in the sandbox: no network, no token, store and turbo cache seed mounted.
sandbox() { docker run --rm --network none --pids-limit 1024 --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
  -e TURBO_CACHE_DIR=/work/.turbo/cache -e TURBO_TELEMETRY_DISABLED=1 -e HOME=/tmp \
  -v "$1:/work" -v "$2:/pnpm-store" -v "$1/.turbo-seed:/work/.turbo/cache" $IMG sh -c "$3"; }

echo "== job 1: base $BASE"
T0=$(t); git worktree add --detach "$WORK/base" "$BASE"
( cd "$WORK/base" && pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild )
T1=$(t); echo "base install: $((T1-T0))s, disk after install: $(disk "$WORK/base")MB"
( cd "$WORK/base" && TURBO_CACHE_DIR=.turbo/cache npx turbo run build --filter="$PKG..." --cache=local:rw,remote:r --summarize >/dev/null )
T2=$(t); echo "base build (remote:r): $((T2-T1))s, disk: $(disk "$WORK/base")MB"
echo "base cache statuses: $(statuses "$WORK/base/.turbo/runs")"

echo "== job 2: head $HEAD"
T3=$(t); git worktree add --detach "$WORK/head" "$HEAD"
# Host side: only the lockfile leaves the worktree. No manifest, .npmrc or .pnpmfile.cjs in the fetch folder,
# so pnpm reads nothing from head as configuration and runs the host's own pnpm version.
mkdir -p "$WORK/fetch" "$STORE"; cp "$WORK/head/pnpm-lock.yaml" "$WORK/fetch/"
FETCHED=no
if ( cd "$WORK/fetch" && pnpm fetch --store-dir "$STORE" ); then
  FETCHED=lockfile; T4=$(t); echo "head fetch (host, lockfile only): OK $((T4-T3))s, store: $(disk "$STORE")MB"
else
  T4=$(t); echo "head fetch (host, lockfile only): FAILED after $((T4-T3))s, store: $(disk "$STORE")MB"
  # Variant: also copy patches/ (diff files named by the lockfile's patchedDependencies; data, not configuration).
  if [ -d "$WORK/head/patches" ]; then
    cp -r "$WORK/head/patches" "$WORK/fetch/"
    if ( cd "$WORK/fetch" && pnpm fetch --store-dir "$STORE" ); then FETCHED=lockfile+patches; fi
    T4b=$(t); echo "head fetch (host, lockfile + patches/, store warm from the failed try): $FETCHED $((T4b-T4))s, store: $(disk "$STORE")MB"; T4=$T4b
  fi
fi
cp -r "$WORK/base/.turbo/cache" "$WORK/head/.turbo-seed"
mkdir -p "$WORK/head/.turbo/cache"   # mount point owned by the runner user, not created by Docker as root
BUILD="s=\$(date +%s); pnpm rebuild >/dev/null && r=\$(date +%s) && echo \"REBUILT in \$((r-s))s\" && npx turbo run build --filter='$PKG...' --cache=local:rw,remote:r --summarize >/dev/null && echo \"BUILT in \$((\$(date +%s)-r))s\""
if [ "$FETCHED" != no ]; then
  sandbox "$WORK/head" "$STORE" "cd /work && s=\$(date +%s) && pnpm install --offline --frozen-lockfile --ignore-scripts >/tmp/i.log 2>&1 && echo \"INSTALLED in \$((\$(date +%s)-s))s\" || { tail -20 /tmp/i.log; exit 1; }; $BUILD" && rc=0 || rc=$?
  T5=$(t); echo "head install+rebuild+build (sandbox, offline, no token, fetch=$FETCHED): exit $rc, $((T5-T4))s, disk head: $(disk "$WORK/head")MB"
  echo "head cache statuses: $(statuses "$WORK/head/.turbo/runs")"
fi
echo "disk after designed path: $(disk "$WORK")MB; free: $(df -m "$WORK" | tail -1 | awk '{print $4}')MB"

if [ "$FETCHED" != lockfile ]; then
  echo "== fallback (fetch from the lockfile alone failed): install container with network, then build with --network none"
  T6=$(t); git worktree add --detach "$WORK/head-fb" "$HEAD" >/dev/null 2>&1; mkdir -p "$WORK/fb-store" "$WORK/head-fb/.turbo/cache"
  cp -r "$WORK/base/.turbo/cache" "$WORK/head-fb/.turbo-seed"
  # Install step only has network. Still non-root, no capabilities, empty environment.
  docker run --rm --pids-limit 1024 --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp \
    -v "$WORK/head-fb:/work" -v "$WORK/fb-store:/pnpm-store" $IMG \
    sh -c 'cd /work && pnpm install --frozen-lockfile --ignore-scripts >/tmp/i.log 2>&1 && echo INSTALLED || { tail -20 /tmp/i.log; exit 1; }' && rc=0 || rc=$?
  T7=$(t); echo "fallback install (container, network): exit $rc, $((T7-T6))s, store: $(disk "$WORK/fb-store")MB"
  sandbox "$WORK/head-fb" "$WORK/fb-store" "cd /work && $BUILD" && rc=0 || rc=$?
  T8=$(t); echo "fallback rebuild+build (sandbox, --network none): exit $rc, $((T8-T7))s, disk head-fb: $(disk "$WORK/head-fb")MB"
  echo "fallback cache statuses: $(statuses "$WORK/head-fb/.turbo/runs")"
fi
echo "total disk: $(disk "$WORK")MB; free: $(df -m "$WORK" | tail -1 | awk '{print $4}')MB"
for w in base head head-fb; do [ -d "$WORK/$w" ] && git worktree remove --force "$WORK/$w"; done; true
