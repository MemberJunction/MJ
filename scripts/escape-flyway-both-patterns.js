#!/usr/bin/env node
/**
 * Escape Flyway placeholders for both single and double dollar patterns
 *
 * Proper escaping for Flyway migration files:
 * - ${flyway:defaultSchema} → stays as-is (Flyway processes it)
 * - ${value} → $'+'{value}' (SQL concatenation for single $)
 * - $${value} → $'+'$'+'{value}' (SQL concatenation for double $$, BOTH $ signs broken up)
 *
 * How it works:
 * - Single $: SQL concatenates $ + {value} = ${value}
 * - Double $$: SQL concatenates $ + $ + {value} = $${value}
 *
 * IMPORTANT: For double $$, BOTH dollar signs must be broken up with concatenation.
 * Using '$$' + '{value}' does NOT work because Flyway still sees the $${ pattern
 * in the SQL concatenation and treats it as an escaped placeholder ($${ → ${).
 */

const fs = require('fs');
const readline = require('readline');

function processLine(line) {
  let changes = 0;

  // Step 1: Handle $${ patterns (double dollar) - convert to $'+'$'+'{
  // Must do this BEFORE handling single $ to avoid double-processing
  // Both $ signs must be broken up to prevent Flyway from seeing $${ pattern
  let result = line.replace(/\$\$\{(?!flyway:)/g, (match, offset) => {
    changes++;
    return "$'+'$'+'{";
  });

  // Step 2: Handle remaining ${ patterns (single dollar) - convert to $'+'{
  result = result.replace(/\$\{(?!flyway:)/g, (match, offset) => {
    changes++;
    return "$'+'{";
  });

  return { line: result, changes };
}

async function processFile(inputFile, outputFile) {
  let totalChanges = 0;
  let linesProcessed = 0;
  let linesWithChanges = 0;

  const readStream = fs.createReadStream(inputFile, { encoding: 'utf8' });
  const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });

  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    linesProcessed++;

    const { line: fixedLine, changes } = processLine(line);

    if (changes > 0) {
      totalChanges += changes;
      linesWithChanges++;
    }

    writeStream.write(fixedLine + '\n');
  }

  writeStream.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => {
      resolve({
        linesProcessed,
        linesWithChanges,
        totalChanges
      });
    });
    writeStream.on('error', reject);
  });
}

async function main() {
  if (process.argv.length !== 3) {
    console.error('Usage: node escape-flyway-both-patterns.js <migration-file>');
    console.error('');
    console.error('Escapes both single and double dollar placeholders:');
    console.error('  - $' + '{flyway:...} → stays as-is');
    console.error('  - $' + '{value} → $\'+\'+' + '{value}\' (single dollar)');
    console.error('  - $$' + '{value} → $\'+\'$\'+\'' + '{value}\' (double dollar, BOTH $ broken up)');
    process.exit(1);
  }

  const migrationFile = process.argv[2];

  if (!fs.existsSync(migrationFile)) {
    console.error('Error: File not found: ' + migrationFile);
    process.exit(1);
  }

  console.log('Processing: ' + migrationFile);
  console.log('');
  console.log('Applying SQL concatenation escaping for both patterns:');
  console.log('  - $' + '{flyway:...} → left as-is (Flyway processes)');
  console.log('  - $' + '{value} → $\'+\'+' + '{value}\' (single dollar)');
  console.log('  - $$' + '{value} → $\'+\'$\'+\'' + '{value}\' (double dollar, BOTH $ broken up)');
  console.log('');

  // Create backup
  const backupFile = migrationFile + '.both-patterns-backup';
  console.log('Creating backup: ' + backupFile);
  fs.copyFileSync(migrationFile, backupFile);

  // Process file
  const tempFile = migrationFile + '.tmp';

  try {
    const stats = await processFile(migrationFile, tempFile);

    console.log('');
    console.log('='.repeat(70));
    console.log('Summary:');
    console.log('='.repeat(70));
    console.log('Lines processed: ' + stats.linesProcessed);
    console.log('Lines with changes: ' + stats.linesWithChanges);
    console.log('Total transformations: ' + stats.totalChanges);

    // Replace original with fixed version
    fs.renameSync(tempFile, migrationFile);

    console.log('');
    console.log('✓ Done! Both single and double dollar patterns escaped.');
    console.log('');
    console.log('Examples:');
    console.log('  - $\'+\'+' + '{type}\' → SQL concatenates to $' + '{type}');
    console.log('  - $\'+\'$\'+\'' + '{value}\' → SQL concatenates to $$' + '{value}');
    console.log('');
    console.log('  Original backed up to: ' + backupFile);

  } catch (error) {
    console.error('');
    console.error('❌ Error during processing: ' + error.message);
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error: ' + error.message);
    process.exit(1);
  });
}

module.exports = { processLine };
