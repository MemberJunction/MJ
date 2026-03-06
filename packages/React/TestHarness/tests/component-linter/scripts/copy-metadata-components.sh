#!/bin/bash
# Copy root-level dashboard components from metadata/components to fixtures/valid-components

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../fixtures/valid-components"
METADATA_DIR="/Users/jordanfanapour/Documents/GitHub/MJ/metadata/components"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║         Copy Metadata Components to Fixtures/Valid-Components               ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Ensure fixtures directory exists
mkdir -p "$FIXTURES_DIR"

# Root-level dashboard components
DASHBOARDS=(
  "entity-browser"
  "ai-performance-dashboard"
  "accounts-by-industry"
  "deals-by-stage-board"
  "sales-pipeline-dashboard"
  "invoice-status-dashboard"
  "financial-analytics-dashboard"
  "ai-prompts-cluster"
)

echo "📋 Copying 8 root-level dashboard components..."
echo ""

COPIED=0
SKIPPED=0

for component in "${DASHBOARDS[@]}"; do
  SPEC_FILE="$METADATA_DIR/spec/${component}.spec.json"
  CODE_FILE="$METADATA_DIR/code/${component}.js"

  if [ ! -f "$SPEC_FILE" ]; then
    echo "  ⚠️  Spec not found: ${component}.spec.json"
    ((SKIPPED++))
    continue
  fi

  if [ ! -f "$CODE_FILE" ]; then
    echo "  ⚠️  Code not found: ${component}.js"
    ((SKIPPED++))
    continue
  fi

  # Create combined fixture file
  FIXTURE_FILE="$FIXTURES_DIR/${component}.json"

  # Use jq to properly escape and merge the code into the spec
  # The --rawfile reads the code as a raw string, properly escaped
  jq --rawfile code "$CODE_FILE" '. + {code: $code}' "$SPEC_FILE" > "$FIXTURE_FILE"

  echo "  ✅ Copied: ${component}.json"
  ((COPIED++))
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "📊 Summary"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  Total Dashboards: ${#DASHBOARDS[@]}"
echo "  Copied: $COPIED"
echo "  Skipped: $SKIPPED"
echo ""
echo "🎉 Components copied to: $FIXTURES_DIR"
echo ""
echo "Next steps:"
echo "  1. Run: npm run test:fixtures"
echo "  2. Review any violations"
echo "  3. Fix issues in source components"
