#!/bin/bash

# Run All Validation Scripts
# Executes all fixture validation scripts in sequence

cd "$(dirname "$0")/.."

echo "=== Running All Validation Scripts ==="
echo ""

# Track overall pass/fail
OVERALL_PASS=true

echo "1. JSON Syntax Validation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/validate-json-syntax.js
if [ $? -ne 0 ]; then
  OVERALL_PASS=false
fi
echo ""

echo "2. Utilities API Validation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/validate-utilities-api.js
if [ $? -ne 0 ]; then
  OVERALL_PASS=false
fi
echo ""

echo "3. Fixture Pairing Validation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/validate-fixture-pairs.js
if [ $? -ne 0 ]; then
  OVERALL_PASS=false
fi
echo ""

echo "4. JSON Structure Validation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/validate-json-structure.js
if [ $? -ne 0 ]; then
  OVERALL_PASS=false
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "=== Validation Complete ==="
echo ""

if [ "$OVERALL_PASS" = true ]; then
  echo "✅ ALL VALIDATIONS PASSED"
  echo ""
  echo "Next steps:"
  echo "  1. Run manual spot check: node scripts/generate-sample-list.js"
  echo "  2. Create validation report: FIXTURE-VALIDATION-REPORT.md"
  exit 0
else
  echo "❌ SOME VALIDATIONS FAILED"
  echo ""
  echo "Review the errors above and fix the issues before continuing."
  exit 1
fi
