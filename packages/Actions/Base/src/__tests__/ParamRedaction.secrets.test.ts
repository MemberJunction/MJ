import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class MockBaseEntity {
        public GetAll(): Record<string, unknown> { return {}; }
    }
}));

import { RedactParamsToJSON } from '../ParamRedaction';
import { ActionParam } from '../ActionEngine-Base';
import { MJActionParamEntity } from '@memberjunction/core-entities';

const MARKER = 'marker-value-123';

function param(name: string, value: unknown, type: 'Input' | 'Output' | 'Both' = 'Input'): ActionParam {
    return { Name: name, Value: value, Type: type };
}

/** Definitions with the default LogValue (true), as most actions ship. */
function definitions(...names: string[]): MJActionParamEntity[] {
    return names.map((n, i) => ({ ID: `def-${i}`, Name: n, LogValue: true }) as MJActionParamEntity);
}

describe('RedactParamsToJSON and secret-named parameters', () => {
    it('does not log the value of a parameter named as a secret', () => {
        const params = [param('ClientID', 'client-1'), param('ClientSecret', MARKER), param('AccessToken', MARKER, 'Output'), param('RefreshToken', MARKER, 'Output')];
        const json = RedactParamsToJSON(params, definitions('ClientID', 'ClientSecret', 'AccessToken', 'RefreshToken'));
        expect(json).not.toContain(MARKER);
        expect(json).toContain('client-1');
    });

    it('does not log the value of a secret-named parameter that has no definition', () => {
        expect(RedactParamsToJSON([param('Password', MARKER)])).not.toContain(MARKER);
    });

    it('does not log secret-named keys inside an object parameter', () => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${MARKER}`, 'X-API-Key': MARKER };
        const json = RedactParamsToJSON([param('Headers', headers)], definitions('Headers'));
        expect(json).not.toContain(MARKER);
        expect(json).toContain('application/json');
    });
});
