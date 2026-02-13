/**
 * Tests for the MJ Open App version checker.
 *
 * Validates semver compatibility checking for MJ host versions,
 * dependency versions, and upgrade validation.
 *
 * Run: npx tsx tests/open-app/test-version-checker.ts
 */
import {
    CheckMJVersionCompatibility,
    CheckDependencyVersionCompatibility,
    IsValidUpgrade,
} from '@memberjunction/mj-open-app-engine';

// ── Helpers ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
    if (condition) {
        passed++;
        console.log(`  ✓ ${label}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${label}`);
    }
}

// ── Test Suites ────────────────────────────────────────────

console.log('\n=== Version Checker Tests ===\n');

// -- MJ Version Compatibility --

console.log('▸ CheckMJVersionCompatibility');

(function testCompatibleMJVersion() {
    const result = CheckMJVersionCompatibility('4.3.1', '>=4.0.0 <5.0.0');
    assert(result.Compatible === true, 'MJ 4.3.1 satisfies >=4.0.0 <5.0.0');
})();

(function testExactLowerBound() {
    const result = CheckMJVersionCompatibility('4.0.0', '>=4.0.0 <5.0.0');
    assert(result.Compatible === true, 'MJ 4.0.0 satisfies >=4.0.0 <5.0.0 (exact lower bound)');
})();

(function testIncompatibleOldVersion() {
    const result = CheckMJVersionCompatibility('3.9.0', '>=4.0.0');
    assert(result.Compatible === false, 'MJ 3.9.0 does NOT satisfy >=4.0.0');
    assert(result.Message !== undefined, 'Error message is provided');
})();

(function testIncompatibleNewVersion() {
    const result = CheckMJVersionCompatibility('5.0.0', '>=4.0.0 <5.0.0');
    assert(result.Compatible === false, 'MJ 5.0.0 does NOT satisfy >=4.0.0 <5.0.0');
})();

(function testInvalidMJVersion() {
    const result = CheckMJVersionCompatibility('not-a-version', '>=4.0.0');
    assert(result.Compatible === false, 'Invalid MJ version is rejected');
    assert(result.Message!.includes('Invalid MJ version'), 'Error identifies invalid version');
})();

(function testInvalidRange() {
    const result = CheckMJVersionCompatibility('4.0.0', 'not-a-range!!!');
    assert(result.Compatible === false, 'Invalid range is rejected');
    assert(result.Message!.includes('Invalid version range'), 'Error identifies invalid range');
})();

(function testCaretRange() {
    const result = CheckMJVersionCompatibility('4.5.2', '^4.0.0');
    assert(result.Compatible === true, 'MJ 4.5.2 satisfies ^4.0.0');
})();

(function testTildeRange() {
    const result = CheckMJVersionCompatibility('4.0.9', '~4.0.0');
    assert(result.Compatible === true, 'MJ 4.0.9 satisfies ~4.0.0');
})();

(function testTildeRangeIncompat() {
    const result = CheckMJVersionCompatibility('4.1.0', '~4.0.0');
    assert(result.Compatible === false, 'MJ 4.1.0 does NOT satisfy ~4.0.0');
})();

// -- Dependency Version Compatibility --

console.log('\n▸ CheckDependencyVersionCompatibility');

(function testDepCompatible() {
    const result = CheckDependencyVersionCompatibility('2.1.0', '^2.0.0');
    assert(result.Compatible === true, 'Installed 2.1.0 satisfies ^2.0.0');
})();

(function testDepIncompatible() {
    const result = CheckDependencyVersionCompatibility('1.9.0', '^2.0.0');
    assert(result.Compatible === false, 'Installed 1.9.0 does NOT satisfy ^2.0.0');
})();

(function testDepExactMatch() {
    const result = CheckDependencyVersionCompatibility('2.0.0', '2.0.0');
    assert(result.Compatible === true, 'Installed 2.0.0 satisfies exact 2.0.0');
})();

(function testDepRangeMatch() {
    const result = CheckDependencyVersionCompatibility('3.5.0', '>=3.0.0 <4.0.0');
    assert(result.Compatible === true, 'Installed 3.5.0 satisfies >=3.0.0 <4.0.0');
})();

(function testDepInvalidVersion() {
    const result = CheckDependencyVersionCompatibility('abc', '^1.0.0');
    assert(result.Compatible === false, 'Invalid installed version is rejected');
})();

(function testDepInvalidRange() {
    const result = CheckDependencyVersionCompatibility('1.0.0', 'garbage');
    assert(result.Compatible === false, 'Invalid dependency range is rejected');
})();

// -- IsValidUpgrade --

console.log('\n▸ IsValidUpgrade');

(function testValidUpgrade() {
    const result = IsValidUpgrade('1.0.0', '2.0.0');
    assert(result.Compatible === true, 'Upgrade from 1.0.0 to 2.0.0 is valid');
})();

(function testMinorUpgrade() {
    const result = IsValidUpgrade('1.0.0', '1.1.0');
    assert(result.Compatible === true, 'Upgrade from 1.0.0 to 1.1.0 is valid');
})();

(function testPatchUpgrade() {
    const result = IsValidUpgrade('1.0.0', '1.0.1');
    assert(result.Compatible === true, 'Upgrade from 1.0.0 to 1.0.1 is valid');
})();

(function testSameVersion() {
    const result = IsValidUpgrade('1.0.0', '1.0.0');
    assert(result.Compatible === false, 'Same version is NOT a valid upgrade');
    assert(result.Message!.includes('same'), 'Error mentions "same"');
})();

(function testDowngrade() {
    const result = IsValidUpgrade('2.0.0', '1.0.0');
    assert(result.Compatible === false, 'Downgrade from 2.0.0 to 1.0.0 is rejected');
    assert(result.Message!.includes('older'), 'Error mentions "older"');
})();

(function testInvalidCurrentVersion() {
    const result = IsValidUpgrade('nope', '1.0.0');
    assert(result.Compatible === false, 'Invalid current version is rejected');
})();

(function testInvalidTargetVersion() {
    const result = IsValidUpgrade('1.0.0', 'nope');
    assert(result.Compatible === false, 'Invalid target version is rejected');
})();

// -- Pre-release Version Edge Cases --

console.log('\n▸ Pre-release Edge Cases');

(function testPreReleaseCompatibility() {
    const result = CheckMJVersionCompatibility('4.0.0-beta.1', '>=4.0.0-beta.0');
    assert(result.Compatible === true, 'Pre-release 4.0.0-beta.1 satisfies >=4.0.0-beta.0');
})();

(function testPreReleaseUpgrade() {
    const result = IsValidUpgrade('1.0.0-alpha.1', '1.0.0-beta.1');
    assert(result.Compatible === true, 'Upgrade from alpha to beta is valid');
})();

(function testPreReleaseToRelease() {
    const result = IsValidUpgrade('1.0.0-rc.1', '1.0.0');
    assert(result.Compatible === true, 'Upgrade from RC to release is valid');
})();

// ── Summary ────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50) + '\n');

if (failed > 0) {
    process.exit(1);
}
