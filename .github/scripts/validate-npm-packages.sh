#!/bin/bash

# Script to validate that all packages in the monorepo exist on npm
# This prevents publish failures when new packages are added without placeholders

set -e

echo "🔍 Checking for new packages that need npm placeholders..."

# Find all package.json files (excluding node_modules and root)
packages=$(find packages -name package.json -type f -not -path "*/node_modules/*")

new_packages=()
missing_count=0
checked_count=0
mj_checked_count=0
total_count=$(echo "$packages" | wc -l | tr -d ' ')

# Check each package
for pkg_file in $packages; do
  pkg_name=$(jq -r '.name' "$pkg_file")
  ((checked_count++))

  # Skip if no name or not @memberjunction scope
  if [[ -z "$pkg_name" || ! "$pkg_name" =~ ^@memberjunction/ ]]; then
    continue
  fi

  ((mj_checked_count++))

  # Show progress every 20 packages
  if (( mj_checked_count % 20 == 0 )); then
    echo "   Checked $mj_checked_count @memberjunction packages..."
  fi

  # Check if package exists on npm
  if npm view "$pkg_name" version &>/dev/null; then
    # Package exists, continue
    :
  else
    # Package doesn't exist
    echo "❌ $pkg_name - NOT FOUND on npm"
    new_packages+=("$pkg_name")
    ((missing_count++))
  fi
done

# Report results
if [ $missing_count -eq 0 ]; then
  echo ""
  echo "✅ All $mj_checked_count @memberjunction packages exist on npm"
  exit 0
else
  echo "❌ Found $missing_count package(s) without npm placeholders:"
  echo ""
  for pkg in "${new_packages[@]}"; do
    echo "  - $pkg"
  done
  echo ""
  echo "📋 Required actions:"
  echo ""
  echo "For each missing package, run:"
  echo "  npx setup-npm-trusted-publish <package-name>"
  echo ""
  echo "Then configure OIDC at:"
  echo "  https://www.npmjs.com/package/<package-name>/access"
  echo ""
  echo "See NEW_PACKAGE_SETUP.md for detailed instructions."
  echo ""
  exit 1
fi
