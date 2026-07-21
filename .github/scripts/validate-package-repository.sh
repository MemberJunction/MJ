#!/bin/bash

# Validates that all publishable @memberjunction packages have the correct repository.url
# Required for npm sigstore provenance verification

EXPECTED_URL="https://github.com/MemberJunction/MJ"
ERRORS=0
PRIVATE_SKIPPED=0

echo "Checking repository.url in all @memberjunction packages..."

for pkg in $(find packages -name "package.json" -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  # Check if this is a @memberjunction package
  name=$(jq -r '.name // ""' "$pkg" 2>/dev/null)
  if [[ "$name" == @memberjunction/* ]]; then
    # Skip packages marked private. repository.url exists for npm sigstore provenance, which
    # only applies to published packages -- npm refuses to attest a private one, and changesets
    # never publishes one (@changesets/cli: `packages.filter(pkg => !pkg.packageJson.private)`).
    # Same predicate and rationale as validate-npm-packages.sh, so both publish gates agree on
    # what "a package we publish" means. Logged rather than silent so an accidental
    # `"private": true` is still visible in CI output. A jq failure yields an empty string,
    # which is not "true", so the package still gets checked -- the conservative direction.
    if [[ "$(jq -r '.private // false' "$pkg" 2>/dev/null)" == "true" ]]; then
      echo "   ⏭️  $name - private, never published (repository.url not required)"
      PRIVATE_SKIPPED=$((PRIVATE_SKIPPED + 1))
      continue
    fi

    repo_url=$(jq -r '.repository.url // ""' "$pkg" 2>/dev/null)

    if [[ -z "$repo_url" ]]; then
      echo "::error file=$pkg::Missing repository.url in $pkg"
      ERRORS=$((ERRORS + 1))
    elif [[ "$repo_url" != "$EXPECTED_URL" ]]; then
      echo "::error file=$pkg::Invalid repository.url in $pkg: expected '$EXPECTED_URL', got '$repo_url'"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  echo "::error::Found $ERRORS package(s) with missing or invalid repository.url"
  echo "All publishable @memberjunction packages must have:"
  echo '  "repository": {'
  echo '    "type": "git",'
  echo '    "url": "https://github.com/MemberJunction/MJ"'
  echo '  }'
  exit 1
fi

echo "All publishable @memberjunction packages have valid repository.url"
if [[ $PRIVATE_SKIPPED -gt 0 ]]; then
  echo "   ($PRIVATE_SKIPPED private package(s) skipped - never published)"
fi
