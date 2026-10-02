#!/usr/bin/env bash
# Human-run: take new @memberjunction/* packages from "missing on npm" to "seeded over OIDC",
# which is what the "Check new packages exist on npm" PR gate needs. Safe to re-run — every
# step checks live state first and skips if it's already done.
#
#   seed-new-npm-package.sh @memberjunction/ai-foo [@memberjunction/ai-bar ...]
#
# Needs: npm >= 11.15 logged in with 2FA (npm trust prompts for it), gh with MJ repo access.
set -euo pipefail

REPO=MemberJunction/MJ
WORKFLOW=publish.yml
SEED_VERSION=0.0.1-seed.1
ATTEST_POLLS=30   # x 20s = 10 min; npm takes a few minutes to expose a fresh attestation

[ $# -gt 0 ] || { echo "usage: $0 @memberjunction/<name> [...]"; exit 2; }
npm trust github --help 2>&1 | grep -q -- --allow-publish \
  || { echo "npm $(npm --version) is too old: run 'npm install -g npm@^11.15.0'"; exit 1; }
npm whoami >/dev/null || { echo "not logged in: run 'npm login'"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not logged in: run 'gh auth login'"; exit 1; }

enc() { echo "${1/\//%2f}"; }

# Prints the workflow path named by the seed's provenance attestation, or nothing.
attested_workflow() {
  curl -sf "https://registry.npmjs.org/-/npm/v1/attestations/$(enc "$1")@$SEED_VERSION" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        for (const a of JSON.parse(s).attestations ?? []) {
          const p = a?.bundle?.dsseEnvelope?.payload; if (!p) continue;
          const w = JSON.parse(Buffer.from(p,"base64")).predicate?.buildDefinition?.externalParameters?.workflow;
          if (w?.path) { console.log(w.path); return; }
        }})' || true
}

seed_one() {
  local pkg=$1
  case "$pkg" in @memberjunction/*) ;; *) echo "$pkg: not in @memberjunction scope"; return 1 ;; esac
  echo "=== $pkg"

  if [ "$(attested_workflow "$pkg")" = ".github/workflows/$WORKFLOW" ]; then
    echo "already seeded with provenance from $WORKFLOW — nothing to do"; return 0
  fi

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://registry.npmjs.org/$(enc "$pkg")")
  if [ "$code" = "404" ]; then
    echo "creating placeholder"; npx -y setup-npm-trusted-publish "$pkg"
  elif [ "$code" != "200" ]; then
    echo "registry returned HTTP $code — check https://status.npmjs.org/"; return 1
  fi

  if npm trust list "$pkg" 2>&1 | grep -q "file: $WORKFLOW"; then
    echo "trusted publisher already set"
  else
    echo "attaching trusted publisher (2FA prompt)"
    npm trust github "$pkg" --file "$WORKFLOW" --repo "$REPO" --allow-publish -y
  fi

  echo "dispatching seed via $WORKFLOW"
  gh workflow run "$WORKFLOW" --repo "$REPO" --ref next \
    -f seed_package="$pkg" -f confirm_seed_package="$pkg"

  local path
  for _ in $(seq 1 "$ATTEST_POLLS"); do
    path=$(attested_workflow "$pkg")
    [ -n "$path" ] && break
    sleep 20
  done
  if [ "$path" != ".github/workflows/$WORKFLOW" ]; then
    echo "no attestation naming $WORKFLOW after $((ATTEST_POLLS * 20))s (got '${path:-none}')."
    echo "check: gh run list --repo $REPO --workflow $WORKFLOW -L 3"; return 1
  fi
  echo "seeded: attestation names $path"
}

failed=0
for pkg in "$@"; do seed_one "$pkg" || failed=1; done
[ $failed = 0 ] && echo "All seeded. Re-run the failed 'Check new packages exist on npm' job on the PR."
exit $failed
