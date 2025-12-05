#!/bin/bash

# Script to validate package-lock.json doesn't have case mismatches
# This prevents macOS case-insensitive filesystem issues from causing
# Linux (GitHub Actions) npm ci failures

set -e

echo "🔍 Validating package-lock.json for case-sensitivity issues..."

if [ ! -f "package-lock.json" ]; then
  echo "✅ No package-lock.json found, skipping validation"
  exit 0
fi

# Get all workspace package paths from package-lock.json
lockfile_paths=$(jq -r '.packages | keys[] | select(startswith("packages/"))' package-lock.json 2>/dev/null | sort)

if [ -z "$lockfile_paths" ]; then
  echo "✅ No workspace packages found in lockfile"
  exit 0
fi

# Check each path against git's actual casing
errors=0
while IFS= read -r path; do
  # Skip node_modules links
  if [[ "$path" == node_modules/* ]]; then
    continue
  fi

  # Check if path exists in git with exact casing
  # git ls-files is case-sensitive even on macOS
  if ! git ls-files --error-unmatch "$path/package.json" &>/dev/null; then
    # Path doesn't exist in git - might be case mismatch
    # Try to find the actual path in git (case-insensitive)
    dir_path=$(dirname "$path")

    # Get all package.json files in git and check for case-insensitive match
    actual_path=$(git ls-files "$dir_path*/package.json" | grep -i "^$path/package.json$" | head -1)

    if [ -n "$actual_path" ]; then
      actual_dir=$(dirname "$actual_path")
      if [ "$actual_dir" != "$path" ]; then
        echo "❌ Case mismatch detected:"
        echo "   Lockfile has: $path"
        echo "   Git has:      $actual_dir"
        ((errors++))
      fi
    fi
  fi
done <<< "$lockfile_paths"

if [ $errors -gt 0 ]; then
  echo ""
  echo "❌ Found $errors case mismatch(es) in package-lock.json"
  echo ""
  echo "This happens when macOS (case-insensitive) generates lockfile with"
  echo "different casing than what git stores. This will cause npm ci to fail"
  echo "on Linux (case-sensitive) systems like GitHub Actions."
  echo ""
  echo "To fix:"
  echo "  1. Check the actual casing in git:"
  echo "     git ls-files packages/ | grep -i <package-path>"
  echo ""
  echo "  2. Rename local directory to match git (use temp name as intermediate):"
  echo "     mv packages/Path packages/temp"
  echo "     mv packages/temp packages/path"
  echo ""
  echo "  3. Regenerate package-lock.json:"
  echo "     rm package-lock.json && npm install"
  echo ""
  exit 1
fi

echo "✅ No case-sensitivity issues found in package-lock.json"
exit 0
