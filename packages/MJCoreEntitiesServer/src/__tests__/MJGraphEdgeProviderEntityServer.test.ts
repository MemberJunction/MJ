import { describe, it, expect } from 'vitest';
import {
    ValidateGraphEdgeProviderConfigurationJson,
    ValidateGraphEdgeProviderDriverClass,
} from '../custom/MJGraphEdgeProviderEntityServer.server';

describe('MJGraphEdgeProviderEntityServer (DriverClass & Configuration invariants)', () => {
    it('accepts a registered BaseGraphEdgeProvider DriverClass and valid JSON Configuration', () => {
        expect(ValidateGraphEdgeProviderDriverClass('QueryMetadataEdgeProvider', () => true)).toBeNull();
        expect(ValidateGraphEdgeProviderConfigurationJson(null)).toBeNull();
        expect(ValidateGraphEdgeProviderConfigurationJson('{"minCount": 5}')).toBeNull();
    });

    it('refuses an unregistered or blank DriverClass', () => {
        const blankErr = ValidateGraphEdgeProviderDriverClass('   ', () => true);
        expect(blankErr?.Source).toBe('DriverClass');

        const unregErr = ValidateGraphEdgeProviderDriverClass('NonExistentEdgeProvider', () => false);
        expect(unregErr).not.toBeNull();
        expect(unregErr?.Source).toBe('DriverClass');
        expect(unregErr?.Message).toContain('not registered under BaseGraphEdgeProvider');
    });

    it('refuses malformed JSON or non-object JSON in Configuration', () => {
        expect(ValidateGraphEdgeProviderConfigurationJson('{invalid')?.Source).toBe('Configuration');
        expect(ValidateGraphEdgeProviderConfigurationJson('[1, 2, 3]')?.Message).toContain('must be a JSON object');
        expect(ValidateGraphEdgeProviderConfigurationJson('"string"')?.Message).toContain('must be a JSON object');
    });
});
