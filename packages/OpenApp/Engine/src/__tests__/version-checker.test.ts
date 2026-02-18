/**
 * Tests for the MJ Open App version checker.
 *
 * Validates semver compatibility checking for MJ host versions,
 * dependency versions, and upgrade validation.
 */
import { describe, it, expect } from 'vitest';
import {
    CheckMJVersionCompatibility,
    CheckDependencyVersionCompatibility,
    IsValidUpgrade,
} from '../dependency/version-checker.js';

describe('CheckMJVersionCompatibility', () => {
    it('should accept MJ 4.3.1 for >=4.0.0 <5.0.0', () => {
        const result = CheckMJVersionCompatibility('4.3.1', '>=4.0.0 <5.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should accept exact lower bound (4.0.0 for >=4.0.0 <5.0.0)', () => {
        const result = CheckMJVersionCompatibility('4.0.0', '>=4.0.0 <5.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should reject MJ 3.9.0 for >=4.0.0', () => {
        const result = CheckMJVersionCompatibility('3.9.0', '>=4.0.0');
        expect(result.Compatible).toBe(false);
        expect(result.Message).toBeDefined();
    });

    it('should reject MJ 5.0.0 for >=4.0.0 <5.0.0', () => {
        const result = CheckMJVersionCompatibility('5.0.0', '>=4.0.0 <5.0.0');
        expect(result.Compatible).toBe(false);
    });

    it('should reject invalid MJ version', () => {
        const result = CheckMJVersionCompatibility('not-a-version', '>=4.0.0');
        expect(result.Compatible).toBe(false);
        expect(result.Message).toContain('Invalid MJ version');
    });

    it('should reject invalid range', () => {
        const result = CheckMJVersionCompatibility('4.0.0', 'not-a-range!!!');
        expect(result.Compatible).toBe(false);
        expect(result.Message).toContain('Invalid version range');
    });

    it('should accept caret range (4.5.2 for ^4.0.0)', () => {
        const result = CheckMJVersionCompatibility('4.5.2', '^4.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should accept tilde range (4.0.9 for ~4.0.0)', () => {
        const result = CheckMJVersionCompatibility('4.0.9', '~4.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should reject minor bump outside tilde range (4.1.0 for ~4.0.0)', () => {
        const result = CheckMJVersionCompatibility('4.1.0', '~4.0.0');
        expect(result.Compatible).toBe(false);
    });

    it('should handle pre-release version (4.0.0-beta.1 for >=4.0.0-beta.0)', () => {
        const result = CheckMJVersionCompatibility('4.0.0-beta.1', '>=4.0.0-beta.0');
        expect(result.Compatible).toBe(true);
    });
});

describe('CheckDependencyVersionCompatibility', () => {
    it('should accept installed 2.1.0 for ^2.0.0', () => {
        const result = CheckDependencyVersionCompatibility('2.1.0', '^2.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should reject installed 1.9.0 for ^2.0.0', () => {
        const result = CheckDependencyVersionCompatibility('1.9.0', '^2.0.0');
        expect(result.Compatible).toBe(false);
    });

    it('should accept exact match (2.0.0 for 2.0.0)', () => {
        const result = CheckDependencyVersionCompatibility('2.0.0', '2.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should accept range match (3.5.0 for >=3.0.0 <4.0.0)', () => {
        const result = CheckDependencyVersionCompatibility('3.5.0', '>=3.0.0 <4.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should reject invalid installed version', () => {
        const result = CheckDependencyVersionCompatibility('abc', '^1.0.0');
        expect(result.Compatible).toBe(false);
    });

    it('should reject invalid dependency range', () => {
        const result = CheckDependencyVersionCompatibility('1.0.0', 'garbage');
        expect(result.Compatible).toBe(false);
    });
});

describe('IsValidUpgrade', () => {
    it('should accept major upgrade (1.0.0 -> 2.0.0)', () => {
        const result = IsValidUpgrade('1.0.0', '2.0.0');
        expect(result.Compatible).toBe(true);
    });

    it('should accept minor upgrade (1.0.0 -> 1.1.0)', () => {
        const result = IsValidUpgrade('1.0.0', '1.1.0');
        expect(result.Compatible).toBe(true);
    });

    it('should accept patch upgrade (1.0.0 -> 1.0.1)', () => {
        const result = IsValidUpgrade('1.0.0', '1.0.1');
        expect(result.Compatible).toBe(true);
    });

    it('should reject same version', () => {
        const result = IsValidUpgrade('1.0.0', '1.0.0');
        expect(result.Compatible).toBe(false);
        expect(result.Message).toContain('same');
    });

    it('should reject downgrade', () => {
        const result = IsValidUpgrade('2.0.0', '1.0.0');
        expect(result.Compatible).toBe(false);
        expect(result.Message).toContain('older');
    });

    it('should reject invalid current version', () => {
        const result = IsValidUpgrade('nope', '1.0.0');
        expect(result.Compatible).toBe(false);
    });

    it('should reject invalid target version', () => {
        const result = IsValidUpgrade('1.0.0', 'nope');
        expect(result.Compatible).toBe(false);
    });

    it('should accept alpha to beta upgrade', () => {
        const result = IsValidUpgrade('1.0.0-alpha.1', '1.0.0-beta.1');
        expect(result.Compatible).toBe(true);
    });

    it('should accept RC to release upgrade', () => {
        const result = IsValidUpgrade('1.0.0-rc.1', '1.0.0');
        expect(result.Compatible).toBe(true);
    });
});
