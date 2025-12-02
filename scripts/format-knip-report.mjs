#!/usr/bin/env node

/**
 * Format Knip dependency check output into readable markdown
 * for GitHub PR comments
 *
 * Usage:
 *   node scripts/format-knip-report.mjs <knip-output-file>
 *
 * Output:
 *   Formatted markdown written to stdout
 */

import { readFileSync } from 'fs';

const inputFile = process.argv[2] || 'knip-report.txt';

let rawReport;
try {
  rawReport = readFileSync(inputFile, 'utf8');
} catch (error) {
  console.error(`Error reading ${inputFile}:`, error.message);
  process.exit(1);
}

/**
 * Parse Knip output into structured data
 * @param {string} output - Raw Knip output
 * @returns {Map<string, Set<string>>} - Map of package paths to dependency names
 */
function parseKnipOutput(output) {
  const lines = output.trim().split('\n').filter(l => l.trim());
  const depsByPackage = new Map();

  for (const line of lines) {
    // Format: @package-name  file-path:line:column
    const match = line.match(/^(@?[^\s]+)\s+(.+?):\d+:\d+/);
    if (!match) continue;

    const [, depName, filePath] = match;

    // Extract package path from file path
    // e.g., packages/Actions/CoreActions/src/file.ts -> packages/Actions/CoreActions
    const packageMatch = filePath.match(/(packages\/[^\/]+(?:\/[^\/]+)*?)\/(?:src|dist|lib)/);
    const packagePath = packageMatch ? packageMatch[1] : 'root';

    if (!depsByPackage.has(packagePath)) {
      depsByPackage.set(packagePath, new Set());
    }
    depsByPackage.get(packagePath).add(depName);
  }

  return depsByPackage;
}

/**
 * Format the report as markdown
 * @param {Map<string, Set<string>>} depsByPackage - Parsed dependencies
 * @returns {string} - Formatted markdown
 */
function formatReport(depsByPackage) {
  if (depsByPackage.size === 0) {
    return `## ✅ Dependency Check Results

**All dependencies are properly declared!**

No missing dependencies detected in this PR.`;
  }

  const totalPackages = depsByPackage.size;
  const totalDeps = Array.from(depsByPackage.values())
    .reduce((sum, deps) => sum + deps.size, 0);

  let output = `## ⚠️ Missing Dependencies Detected

Found **${totalDeps} missing dependencies** across **${totalPackages} packages**.

<details>
<summary><b>📦 Click to see affected packages</b></summary>

`;

  // Sort packages alphabetically
  const sortedPackages = Array.from(depsByPackage.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [packagePath, deps] of sortedPackages) {
    const sortedDeps = Array.from(deps).sort();
    output += `\n### \`${packagePath}\`\n\n`;
    output += `Missing ${sortedDeps.length} dependencies:\n`;
    for (const dep of sortedDeps) {
      output += `- \`${dep}\`\n`;
    }
  }

  output += `
</details>

---

### 🔧 How to Fix

**Option 1: Auto-fix (recommended)**
\`\`\`bash
npm run deps:fix-missing:dry  # Preview changes
npm run deps:fix-missing       # Apply fixes
\`\`\`

**Option 2: Manual fix**
Add the missing dependencies to each package's \`package.json\` file, then run:
\`\`\`bash
npm install
\`\`\`

### 📚 Documentation
- [Dependency Management Guide](../scripts/README.md)
- [Why This Matters](../.github/workflows/DEPENDENCY-CHECK.md#why-this-matters)
`;

  return output;
}

// Main execution
const depsByPackage = parseKnipOutput(rawReport);
const formattedReport = formatReport(depsByPackage);

// Output to stdout
console.log(formattedReport);
