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

    it('does not log an authentication object, a webhook URL or a passphrase, and keeps paging and limit values', () => {
        const params = [
            param('Authentication', { type: 'bearer', token: MARKER }),
            param('WebhookURL', `https://hooks.example.test/${MARKER}`),
            param('Passphrase', MARKER),
            param('NextPageToken', 'page-cursor-1'),
            param('MaxTokens', 512),
            param('CredentialID', 'credential-id-1'),
        ];
        const json = RedactParamsToJSON(params, definitions('Authentication', 'WebhookURL', 'Passphrase', 'NextPageToken', 'MaxTokens', 'CredentialID'));
        expect(json).not.toContain(MARKER);
        expect(json).toContain('page-cursor-1');
        expect(json).toContain('512');
        expect(json).toContain('credential-id-1');
    });

    it('does not log a cookie header or token and bearer keys inside an object parameter', () => {
        const params = [
            param('Headers', { Cookie: `session=${MARKER}`, Accept: 'text/html' }),
            param('Options', { token: MARKER, bearer: MARKER, NextPageToken: 'page-cursor-2' }),
        ];
        const json = RedactParamsToJSON(params, definitions('Headers', 'Options'));
        expect(json).not.toContain(MARKER);
        expect(json).toContain('text/html');
        expect(json).toContain('page-cursor-2');
    });
});
