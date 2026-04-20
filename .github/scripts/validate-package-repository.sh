#!/bin/bash

# Validates that all @memberjunction packages have the correct repository.url
# Required for npm sigstore provenance verification

EXPECTED_URL="https://github.com/MemberJunction/MJ"
ERRORS=0

echo "Checking repository.url in all @memberjunction packages..."

for pkg in $(find packages -name "package.json" -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  # Check if this is a @memberjunction package
  name=$(jq -r '.name // ""' "$pkg" 2>/dev/null)
  if [[ "$name" == @memberjunction/* ]]; then
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
  echo "All @memberjunction packages must have:"
  echo '  "repository": {'
  echo '    "type": "git",'
  echo '    "url": "https://github.com/MemberJunction/MJ"'
  echo '  }'
  exit 1
fi

echo "All @memberjunction packages have valid repository.url"
