#!/bin/bash
# Fix @include dependencies in fixture files by replacing them with proper registry references

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../fixtures/valid-components"
METADATA_FILE="/Users/jordanfanapour/Documents/GitHub/MJ/metadata/components/.components.json"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║              Fix @include Dependencies in Fixtures                           ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

if [ ! -f "$METADATA_FILE" ]; then
  echo "❌ Metadata file not found: $METADATA_FILE"
  exit 1
fi

FIXED=0
SKIPPED=0

for fixture_file in "$FIXTURES_DIR"/*.json; do
  if [ ! -f "$fixture_file" ]; then
    continue
  fi

  fixture_name=$(basename "$fixture_file")
  echo "🔧 Processing: $fixture_name"

  # Check if file has @include directives
  if ! grep -q "@include:" "$fixture_file"; then
    echo "   ⏭️  No @include directives found, skipping"
    ((SKIPPED++))
    continue
  fi

  # Create a Node.js script to fix the dependencies
  node -e "
    const fs = require('fs');
    const metadataRaw = fs.readFileSync('$METADATA_FILE', 'utf8');
    const metadata = JSON.parse(metadataRaw);

    // Create lookup map for components
    const componentMap = {};
    metadata.forEach(item => {
      const name = item.fields.Name;
      const namespace = item.fields.Namespace;
      const version = item.fields.Version || '1.0.0';
      componentMap[name] = { name, namespace, version };
    });

    // Load fixture
    const fixtureRaw = fs.readFileSync('$fixture_file', 'utf8');
    const fixture = JSON.parse(fixtureRaw);

    // Fix dependencies if they exist
    if (fixture.dependencies && Array.isArray(fixture.dependencies)) {
      fixture.dependencies = fixture.dependencies.map(dep => {
        // If it's already a proper object, keep it
        if (typeof dep === 'object' && !dep.startsWith) {
          return dep;
        }

        // If it's @include directive, resolve it
        if (typeof dep === 'string' && dep.startsWith('@include:')) {
          const specFile = dep.replace('@include:', '');
          // Try multiple naming conventions
          const baseName = specFile.replace('.spec.json', '');

          // Convert kebab-case to PascalCase
          const pascalCase = baseName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

          // Also try with 'AI' as a single unit
          const pascalCaseWithAI = baseName
            .replace(/^ai-/, 'AI')  // Start with AI
            .split('-')
            .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

          // Try to find component with either naming convention
          let component = componentMap[pascalCase] || componentMap[pascalCaseWithAI];

          // If still not found, try case-insensitive search
          if (!component) {
            const lowerBase = baseName.replace(/-/g, '').toLowerCase();
            for (const key in componentMap) {
              if (key.toLowerCase() === lowerBase) {
                component = componentMap[key];
                break;
              }
            }
          }

          if (component) {
            return {
              name: component.name,
              location: 'registry',
              namespace: component.namespace,
              version: '^' + component.version
            };
          } else {
            console.error('   ⚠️  Component not found: ' + baseName + ' (tried: ' + pascalCase + ', ' + pascalCaseWithAI + ')');
            return dep; // Keep original if not found
          }
        }

        return dep;
      });

      // Write back
      fs.writeFileSync('$fixture_file', JSON.stringify(fixture, null, 2));
      process.exit(0);
    } else {
      process.exit(1); // No dependencies
    }
  " && echo "   ✅ Fixed dependencies" && ((FIXED++)) || echo "   ⏭️  No dependencies to fix" && ((SKIPPED++))
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "📊 Summary"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  Fixed: $FIXED"
echo "  Skipped: $SKIPPED"
echo ""
