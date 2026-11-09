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
VISIBLE_POLLS=30  # x 10s = 5 min; a fresh placeholder 404s on the registry and trust API for a while

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
        if (!s) return; // curl -f wrote nothing: no attestation yet
        for (const a of JSON.parse(s).attestations ?? []) {
          const p = a?.bundle?.dsseEnvelope?.payload; if (!p) continue;
          const w = JSON.parse(Buffer.from(p,"base64")).predicate?.buildDefinition?.externalParameters?.workflow;
          if (w?.path) { console.log(w.path); return; }
        }})' || true
}

registry_code() {
  curl -s -o /dev/null -w '%{http_code}' "https://registry.npmjs.org/$(enc "$1")"
}

# The seed job and `npm trust` both 404 until the registry serves the new placeholder.
wait_until_visible() {
  for _ in $(seq 1 "$VISIBLE_POLLS"); do
    [ "$(registry_code "$1")" = "200" ] && return 0
    echo "waiting for the registry to show $1"; sleep 10
  done
  echo "$1 still 404 on the registry after $((VISIBLE_POLLS * 10))s"; return 1
}

seed_one() {
  local pkg=$1
  case "$pkg" in @memberjunction/*) ;; *) echo "$pkg: not in @memberjunction scope"; return 1 ;; esac
  echo "=== $pkg"

  if [ "$(attested_workflow "$pkg")" = ".github/workflows/$WORKFLOW" ]; then
    echo "already seeded with provenance from $WORKFLOW — nothing to do"; return 0
  fi

  # Explicit `|| return 1` throughout: seed_one runs under `||`, which disables set -e here.
  local code
  code=$(registry_code "$pkg")
  if [ "$code" = "404" ]; then
    echo "creating placeholder"; npx -y setup-npm-trusted-publish "$pkg" || return 1
  elif [ "$code" != "200" ]; then
    echo "registry returned HTTP $code — check https://status.npmjs.org/"; return 1
  fi
  wait_until_visible "$pkg" || return 1

  # No pre-check: `npm trust list` needs 2FA, and piped into grep it cannot prompt, so it
  # always looked unset. A failure here is usually "already exists" from an earlier run; the
  # seed below succeeds only if trust is really attached, and the attestation check proves it.
  echo "attaching trusted publisher (2FA prompt)"
  npm trust github "$pkg" --file "$WORKFLOW" --repo "$REPO" --allow-publish -y \
    || echo "npm trust failed (fine if it said 'already exists') — continuing; the seed will prove it"

  # One seed at a time: publish.yml keeps a single pending run, so a second dispatch cancels a
  # queued one. The attestation wait below serializes packages; don't dispatch by hand meanwhile.
  echo "dispatching seed via $WORKFLOW"
  gh workflow run "$WORKFLOW" --repo "$REPO" --ref next \
    -f seed_package="$pkg" -f confirm_seed_package="$pkg" || return 1

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
