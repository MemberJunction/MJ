# Fixture Validation Scripts

Automated validation scripts for component linter test fixtures.

## Quick Start

Run all validations:
```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests
./scripts/run-all-validations.sh
```

## Individual Scripts

### 1. JSON Syntax Validation
Checks that all fixture files are valid JSON.

```bash
node scripts/validate-json-syntax.js
```

**Validates:**
- Valid JSON syntax
- No parsing errors
- Proper structure

### 2. Utilities API Validation
Checks for correct MemberJunction React runtime API usage.

```bash
node scripts/validate-utilities-api.js
```

**Validates:**
- ✅ Uses `utilities.rv.RunView()` NOT `utilities.RunView()`
- ✅ Uses `utilities.rq.RunQuery()` NOT `utilities.RunQuery()`
- ✅ Accesses `result.Results` NOT `result.records`, `result.data`
- ✅ Uses global React hooks NOT `React.useState()`

### 3. Fixture Pairing Validation
Checks that every broken fixture has a matching fixed fixture.

```bash
node scripts/validate-fixture-pairs.js
```

**Validates:**
- Broken fixtures have corresponding fixed fixtures
- Fixed fixtures have corresponding broken fixtures
- File paths match expected structure

### 4. JSON Structure Validation
Checks that fixtures have required fields and proper structure.

```bash
node scripts/validate-json-structure.js
```

**Validates:**
- Required fields: `name`, `type`, `title`, `description`, `code`
- Valid component type
- Proper `dataRequirements` structure
- `dependencies` array exists

### 5. Generate Manual Review Sample
Creates a random sample of fixtures for manual spot-checking.

```bash
node scripts/generate-sample-list.js --count=23
```

**Output:**
- List of randomly selected fixtures
- Grouped by category for easier review
- Saved to `manual-review-sample.txt`

## Exit Codes

All validation scripts follow these conventions:
- `0` - All checks passed
- `1` - One or more checks failed

## Requirements

These scripts require Node.js and the following npm packages:
- `glob` - For file pattern matching

Install dependencies:
```bash
npm install
```

## Usage in CI/CD

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Validate Fixtures
  run: |
    cd tests/component-linter-tests
    ./scripts/run-all-validations.sh
```

## Troubleshooting

### Script won't execute
Make sure the shell script is executable:
```bash
chmod +x scripts/run-all-validations.sh
```

### "Cannot find module 'glob'"
Install dependencies:
```bash
npm install
```

### False positives
If the validation scripts report issues that seem incorrect, check:
1. Is the pattern a legitimate edge case?
2. Does the fixture use a newer API pattern?
3. Is the regex pattern in the script too broad?

Report false positives to the development team for script updates.

## Adding New Validations

To add a new validation check:

1. Create a new script: `scripts/validate-[check-name].js`
2. Follow the pattern of existing scripts
3. Export proper exit codes (0 = pass, 1 = fail)
4. Update `run-all-validations.sh` to include the new check
5. Update this README with the new validation

## Related Documentation

- [FIXTURE-PROOFREAD-INSTRUCTIONS.md](../FIXTURE-PROOFREAD-INSTRUCTIONS.md) - Manual proof-reading guide
- [FIXTURE-COVERAGE-ANALYSIS.md](../FIXTURE-COVERAGE-ANALYSIS.md) - Fixture planning document
- [FIXTURE-MIGRATION.md](../FIXTURE-MIGRATION.md) - Directory structure guide
