#!/usr/bin/env bash
# Q7. Same verdicts from (a) a head worktree and (b) base worktree + head's changed files copied in?
set -euo pipefail
BASE=$1; HEAD=$2; PKGDIR=$3        # PKGDIR e.g. packages/MJCore
ROOT=$(git rev-parse --show-toplevel); WORK=${RUNNER_TEMP:-/tmp}/jit-q7; rm -rf "$WORK"; mkdir -p "$WORK"
PKGNAME=$(node -p "require('$ROOT/$PKGDIR/package.json').name")
# Spike only, on your own machine, with merged (trusted) PRs: a plain host install is acceptable here.
# The tool itself never installs head on the host (Task 1.11 and design §5.4).
prep() { git worktree add --detach "$1" "$2"; ( cd "$1" && pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild && npx turbo run build --filter="$PKGNAME..." >/dev/null ); }
prep "$WORK/base" "$BASE"; prep "$WORK/head" "$HEAD"
run() { ( cd "$1/$PKGDIR" && TZ=UTC npx vitest run --reporter=json --outputFile="$2" --sequence.seed=1 >/dev/null 2>&1 || true ); }
run "$WORK/head" "$WORK/a.json"
# (b) copy head's version of each changed src file over base, no rebuild
git -C "$ROOT" diff --name-only "$BASE" "$HEAD" -- "$PKGDIR/src" | while read -r f; do cp "$WORK/head/$f" "$WORK/base/$f"; done
run "$WORK/base" "$WORK/b.json"
node -e '
const [a,b]=process.argv.slice(1).map(p=>JSON.parse(require("fs").readFileSync(p,"utf8")));
const m=r=>new Map(r.testResults.flatMap(f=>f.assertionResults.map(t=>[f.name.replace(/.*\/packages\//,"")+"::"+t.fullName,t.status])));
const A=m(a),B=m(b); let diff=0; for(const [k,v] of A){ if(B.get(k)!==v){diff++; console.log("DIFF",k,v,"vs",B.get(k));} }
console.log("tests:",A.size,"differences:",diff);' "$WORK/a.json" "$WORK/b.json"
git worktree remove --force "$WORK/base"; git worktree remove --force "$WORK/head"
