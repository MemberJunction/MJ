#!/bin/bash

# Script to validate that all packages in the monorepo exist on npm
# This prevents publish failures when new packages are added without placeholders

set -e

# Configuration
MAX_RETRIES=3
RETRY_DELAY=2
NPM_TIMEOUT=10

echo "🔍 Checking for new packages that need npm placeholders..."

# Find all package.json files (excluding node_modules and root)
packages=$(find packages -name package.json -type f -not -path "*/node_modules/*")

if [ -z "$packages" ]; then
  echo "❌ Error: No package.json files found in packages/ directory"
  exit 1
fi

new_packages=()
missing_count=0
checked_count=0
mj_checked_count=0
private_skipped_count=0
total_count=$(echo "$packages" | wc -l | tr -d ' ')
error_count=0
max_errors=5

echo "Found $total_count package.json files to check"

# Function to check if package exists on npm with retry logic
check_package_exists() {
  local pkg_name="$1"
  local attempt=1

  while [ $attempt -le $MAX_RETRIES ]; do
    # Use timeout if available (Linux/GitHub Actions), otherwise run without timeout (macOS)
    if command -v timeout &>/dev/null; then
      timeout $NPM_TIMEOUT npm view "$pkg_name" version &>/dev/null
    else
      npm view "$pkg_name" version &>/dev/null
    fi

    local exit_code=$?

    # Exit code 0 = package exists
    if [ $exit_code -eq 0 ]; then
      return 0
    fi

    # Exit codes: 1 = not found, 124 = timeout, others = network error
    # For "not found", don't retry - it legitimately doesn't exist
    if [ $exit_code -eq 1 ]; then
      # Check if this is a genuine "not found" by looking at npm's behavior
      # npm returns exit code 1 for both "not found" and network errors
      # We'll treat first attempt exit code 1 as "not found" unless we see retries succeed
      if [ $attempt -eq 1 ]; then
        return 1  # Package doesn't exist
      fi
    fi

    # For timeout (124) or other errors, retry
    if [ $attempt -lt $MAX_RETRIES ]; then
      echo "   ⚠️  Retry $attempt/$MAX_RETRIES for $pkg_name (network issue, exit code: $exit_code)"
      sleep $RETRY_DELAY
      attempt=$((attempt + 1))
    else
      echo "   ❌ Failed to check $pkg_name after $MAX_RETRIES attempts"
      return 2  # Error after retries
    fi
  done

  return 2  # Should not reach here, but fail safe
}

# Check each package
for pkg_file in $packages; do
  pkg_name=$(jq -r '.name' "$pkg_file" 2>/dev/null)

  if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Failed to parse $pkg_file (invalid JSON?)"
    error_count=$((error_count + 1))
    if [ $error_count -ge $max_errors ]; then
      echo "❌ Too many errors encountered. Stopping validation."
      exit 1
    fi
    continue
  fi

  checked_count=$((checked_count + 1))

  # Skip if no name or not @memberjunction scope
  if [[ -z "$pkg_name" || "$pkg_name" == "null" || ! "$pkg_name" =~ ^@memberjunction/ ]]; then
    continue
  fi

  # Skip packages marked private. This gate exists to predict whether `npm run change publish`
  # will succeed, and changesets never publishes a private package
  # (@changesets/cli: `packages.filter(pkg => !pkg.packageJson.private)`), so requiring an npm
  # entry for one asks a question that has no bearing on the outcome it gates.
  # Logged rather than silent so an accidental `"private": true` is still visible in CI output.
  # A jq failure yields an empty string here, which falls through to the normal npm check --
  # the conservative direction.
  if [[ "$(jq -r '.private // false' "$pkg_file" 2>/dev/null)" == "true" ]]; then
    echo "   ⏭️  $pkg_name - private, never published (skipped)"
    private_skipped_count=$((private_skipped_count + 1))
    continue
  fi

  mj_checked_count=$((mj_checked_count + 1))

  # Show progress every 10 packages (more frequent updates)
  if (( mj_checked_count % 10 == 0 )); then
    echo "   Checked $mj_checked_count @memberjunction packages..."
  fi

  # Check if package exists on npm with retry logic
  # Disable set -e for this call since we expect non-zero returns for missing packages
  set +e
  check_package_exists "$pkg_name"
  result=$?
  set -e

  if [ $result -eq 0 ]; then
    # Package exists, continue
    :
  elif [ $result -eq 1 ]; then
    # Package doesn't exist
    echo "❌ $pkg_name - NOT FOUND on npm"
    new_packages+=("$pkg_name")
    missing_count=$((missing_count + 1))
  else
    # Network/timeout error after retries
    echo "❌ Error: Unable to verify $pkg_name due to network issues"
    echo "   This could be a transient npm registry problem."
    echo "   Please re-run the workflow or check npm registry status at: https://status.npmjs.org/"
    exit 1
  fi
done

# Report results
if [ $missing_count -eq 0 ]; then
  echo ""
  echo "✅ All $mj_checked_count publishable @memberjunction packages exist on npm"
  if [ $private_skipped_count -gt 0 ]; then
    echo "   ($private_skipped_count private package(s) skipped - never published)"
  fi
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
