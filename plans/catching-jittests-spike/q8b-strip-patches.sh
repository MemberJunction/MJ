#!/usr/bin/env bash
# Q8 option (b). The host half runs `pnpm fetch` with a copy of the lockfile that has no patch
# information; the sandbox half installs offline with the real lockfile and `patches/`.
# Both halves run in Linux containers from jit-sandbox:spike (see Dockerfile.sandbox).
# Usage: q8b-strip-patches.sh  (run from inside the MJ checkout to test)
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel)
IMG=jit-sandbox:spike
WORK=${RUNNER_TEMP:-/tmp}/jit-q8b
PATCH_LINE=_mjBuildIndexes          # a line the type-graphql patch adds
rm -rf "$WORK"; mkdir -p "$WORK/fetch" "$WORK/store"
docker image inspect "$IMG" >/dev/null 2>&1 || docker build -t "$IMG" -f "$ROOT/plans/catching-jittests-spike/Dockerfile.sandbox" "$ROOT/plans/catching-jittests-spike"
SEC=(--user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp)

# Writes a stripped copy of lockfile $1 to $2. Mode: both | block | segments.
#   block    deletes the top-level `patchedDependencies:` block
#   segments deletes every `(patch_hash=<hash>)` segment
strip() {
  python3 -I - "$1" "$2" "$3" <<'PY'
import re, sys
src, dst, mode = sys.argv[1:]
lines = open(src).read().split('\n')
out, skip = [], False
for ln in lines:
    if mode in ('both', 'block'):
        if ln == 'patchedDependencies:':
            skip = True; continue
        if skip:
            if ln == '' or ln.startswith(' '):
                # the block ends at the first blank line; drop that one blank line too
                if ln == '': skip = False
                continue
            skip = False
    if mode in ('both', 'segments'):
        ln = re.sub(r'\(patch_hash=[0-9a-f]+\)', '', ln)
    out.append(ln)
open(dst, 'w').write('\n'.join(out))
PY
}

echo "=== 1+2. stripped lockfile + host fetch (network, Linux container) ==="
FETCH_RC=1
for MODE in both block segments; do
  rm -rf "$WORK/fetch" && mkdir -p "$WORK/fetch"
  strip "$ROOT/pnpm-lock.yaml" "$WORK/fetch/pnpm-lock.yaml" "$MODE"
  echo "--- variant: $MODE"
  echo "diff lines: $(diff "$ROOT/pnpm-lock.yaml" "$WORK/fetch/pnpm-lock.yaml" | wc -l | tr -d ' ')"
  diff "$ROOT/pnpm-lock.yaml" "$WORK/fetch/pnpm-lock.yaml" | grep -v '^---' | cut -c1-140
  echo "patch_hash left: $(grep -c patch_hash "$WORK/fetch/pnpm-lock.yaml")"
  ls -A "$WORK/fetch"
  T0=$(date +%s)
  docker run --rm "${SEC[@]}" -v "$WORK/fetch:/fetch" -v "$WORK/store:/pnpm-store" "$IMG" \
    sh -c 'cd /fetch && pnpm fetch' > "$WORK/fetch-$MODE.log" 2>&1
  FETCH_RC=$?
  HOST_SECS=$(( $(date +%s) - T0 ))
  tail -n 15 "$WORK/fetch-$MODE.log"
  echo "fetch exit=$FETCH_RC time=${HOST_SECS}s"
  [ $FETCH_RC -eq 0 ] && break
done
echo "store size: $(du -sm "$WORK/store" | cut -f1) MB"
echo "patch_hash dirs in fetch node_modules: $(ls "$WORK/fetch/node_modules/.pnpm" 2>/dev/null | grep -c patch_hash)"
ls "$WORK/fetch/node_modules/.pnpm" 2>/dev/null | grep type-graphql
echo "store files holding '$PATCH_LINE' after host fetch: $(grep -rlF "$PATCH_LINE" "$WORK/store" | wc -l | tr -d ' ')"

echo "=== 3. sandbox offline install (--network none, real lockfile + patches/) ==="
git -C "$ROOT" worktree add --detach "$WORK/head" HEAD >/dev/null 2>&1
T0=$(date +%s)
docker run --rm --network none --pids-limit 1024 "${SEC[@]}" -v "$WORK/head:/work" -v "$WORK/store:/pnpm-store" "$IMG" \
  sh -c 'cd /work && pnpm install --offline --frozen-lockfile --ignore-scripts && echo INSTALLED && pnpm rebuild && echo REBUILT' \
  > "$WORK/install.log" 2>&1
INSTALL_RC=$?
SANDBOX_SECS=$(( $(date +%s) - T0 ))
grep -E 'ERR_|INSTALLED|REBUILT|Done in|Packages:' "$WORK/install.log" | cut -c1-200
tail -n 5 "$WORK/install.log"
echo "install+rebuild exit=$INSTALL_RC time=${SANDBOX_SECS}s"

echo "=== 4. was the patch applied in the sandbox? ==="
ls "$WORK/head/node_modules/.pnpm" | grep type-graphql
for d in "$WORK/head"/node_modules/.pnpm/type-graphql@*/node_modules/type-graphql; do
  echo "$d:"; grep -rnF "$PATCH_LINE" "$d/build" | head -n 3 | cut -c1-200
done
echo "store files holding '$PATCH_LINE' after sandbox install: $(grep -rlF "$PATCH_LINE" "$WORK/store" | wc -l | tr -d ' ')"
ls -d "$WORK/store"/v*/index 2>/dev/null; grep -rl 'patch_hash\|type-graphql@2.0.0-beta.3' "$WORK/store"/v*/index 2>/dev/null | head -n 5

echo "=== 5. build smoke (--network none, capped at 20 min) ==="
T0=$(date +%s)
docker run --rm --network none --pids-limit 1024 "${SEC[@]}" -e TURBO_TELEMETRY_DISABLED=1 -e TURBO_CACHE_DIR=/work/.turbo/cache \
  -v "$WORK/head:/work" -v "$WORK/store:/pnpm-store" "$IMG" \
  sh -c 'cd /work && timeout 1200 npx turbo run build --filter=@memberjunction/core... --cache=local:rw' > "$WORK/build.log" 2>&1
BUILD_RC=$?
BUILD_SECS=$(( $(date +%s) - T0 ))
grep -E 'Tasks:|Cached:|Time:|ERR|error' "$WORK/build.log" | head -n 10
echo "build exit=$BUILD_RC time=${BUILD_SECS}s (124 = timeout, not completed)"

echo "=== 6. timing ==="
echo "host half (fetch, last variant): ${HOST_SECS}s; sandbox half (install+rebuild): ${SANDBOX_SECS}s; build: ${BUILD_SECS}s"

git -C "$ROOT" worktree remove --force "$WORK/head"
rm -rf "$WORK"
