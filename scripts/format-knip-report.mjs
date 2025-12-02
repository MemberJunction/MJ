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
 * Strip ANSI color codes from text
 * @param {string} text - Text with ANSI codes
 * @returns {string} - Clean text
 */
function stripAnsiCodes(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Check if a string is a valid npm package name
 * Note: Some common directory names (src, lib, dist) ARE valid npm packages,
 * but are extremely unlikely to be legitimately imported in code. We filter
 * them as false positives since Knip commonly misreports them.
 * @param {string} name - Potential package name
 * @returns {boolean} - True if valid package name
 */
function isValidDependencyName(name) {
  if (!name || typeof name !== 'string') return false;

  // Common false positives - directory names that Knip incorrectly reports
  // Note: 'src' and 'lib' are real (but obscure) npm packages, but in practice
  // they're almost always false positives from Knip misinterpreting directory names
  const falsePositives = ['src', 'dist', 'lib', 'node_modules', 'build', 'out', 'environments', 'app', 'public'];
  if (falsePositives.includes(name.toLowerCase())) return false;

  // Scoped packages: @scope/package-name
  if (name.startsWith('@')) {
    const regex = /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/;
    if (!regex.test(name)) return false;

    // Filter scoped packages with common directory names as scope or package
    const [scope, pkg] = name.substring(1).split('/');
    if (falsePositives.includes(scope) || falsePositives.includes(pkg)) return false;

    return true;
  }

  // Regular packages: package-name
  // Must start with lowercase letter or number, can contain -, _, .
  return /^[a-z0-9-~][a-z0-9-._~]*$/.test(name) && !name.includes('/');
}

/**
 * Parse Knip output into structured data
 * Handles both default and compact reporter formats
 * @param {string} output - Raw Knip output
 * @returns {Map<string, Set<string>>} - Map of package paths to dependency names
 */
function parseKnipOutput(output) {
  // Strip ANSI codes first
  const cleanOutput = stripAnsiCodes(output);
  const lines = cleanOutput.trim().split('\n').filter(l => l.trim());
  const depsByPackage = new Map();

  for (const line of lines) {
    // Skip configuration hints and other non-dependency lines
    if (line.includes('Configuration hints') ||
        line.includes('knip.json') ||
        line.includes('Package entry file') ||
        line.match(/^\.\.\.\d+\s+more/)) {
      continue;
    }

    // Try compact format first: file-path: dep1, dep2, dep3
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const beforeColon = line.substring(0, colonIndex).trim();
      const afterColon = line.substring(colonIndex + 1).trim();

      // Check if this is compact format (file path before colon, no line numbers)
      if (beforeColon.includes('/') && !beforeColon.match(/:\d+$/)) {
        const filePath = beforeColon;
        const deps = afterColon.split(',').map(d => d.trim()).filter(d => d);

        if (deps.length > 0) {
          // Extract package path from file path
          const packageMatch = filePath.match(/(packages\/[^\/]+(?:\/[^\/]+)*?)\/(?:src|dist|lib|environments)/);
          const packagePath = packageMatch ? packageMatch[1] : 'root';

          if (!depsByPackage.has(packagePath)) {
            depsByPackage.set(packagePath, new Set());
          }

          for (const dep of deps) {
            // Only add valid package names (not file paths or common false positives)
            if (isValidDependencyName(dep)) {
              depsByPackage.get(packagePath).add(dep);
            }
          }
          continue;
        }
      }
    }

    // Fall back to default format: @package-name  file-path:line:column
    const match = line.match(/^(@?[a-zA-Z0-9@\/\-_]+)\s+(.+?):\d+:\d+/);
    if (!match) continue;

    const [, depName, filePath] = match;

    // Validate dependency name
    if (!isValidDependencyName(depName)) continue;

    // Extract package path from file path
    const packageMatch = filePath.match(/(packages\/[^\/]+(?:\/[^\/]+)*?)\/(?:src|dist|lib|environments)/);
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
    return `<!-- dependency-check-report -->
## ✅ Dependency Check Results

**All dependencies are properly declared!**

No missing dependencies detected in this PR.`;
  }

  const totalPackages = depsByPackage.size;
  const totalDeps = Array.from(depsByPackage.values())
    .reduce((sum, deps) => sum + deps.size, 0);

  // If all dependencies were filtered out (false positives), show success message
  if (totalDeps === 0) {
    return `<!-- dependency-check-report -->
## ✅ Dependency Check Results

**All dependencies are properly declared!**

Knip reported some issues, but they were all false positives (e.g., directory names like \`src\`, \`dist\`) that have been filtered out.`;
  }

  let output = `<!-- dependency-check-report -->
## ⚠️ Missing Dependencies Detected

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
