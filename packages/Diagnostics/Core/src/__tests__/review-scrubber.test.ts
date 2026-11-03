import { describe, it, expect } from 'vitest';
import { NormalizeSqlLiterals, ScrubString, ScrubValue, ScrubHeaders, ScrubBundleData } from '../index.js';
import { EmptyBundleData } from './reviewFixtures.js';

function elapsedMs(work: () => void): number {
    const started = performance.now();
    work();
    return performance.now() - started;
}

describe('NormalizeSqlLiterals running time', () => {
    it('normalizes 400 KB of repeated WHERE keywords in well under a second', () => {
        const sql = 'WHERE a '.repeat(50_000);
        expect(elapsedMs(() => NormalizeSqlLiterals(sql))).toBeLessThan(500);
    }, 60_000);

    it('replaces every literal of a 400 KB statement and keeps none past the length cap', () => {
        const sql = "SELECT * FROM T WHERE a = 'x' ".repeat(10_000) + "AND Email = 'alice@example.com' AND Age = 42";
        let out = '';
        expect(elapsedMs(() => (out = NormalizeSqlLiterals(sql)))).toBeLessThan(500);
        expect(out).not.toContain('alice@example.com');
        expect(out).not.toContain('42');
        expect(out.length).toBeLessThan(70_000);
    }, 60_000);

    it('replaces an unterminated string literal', () => {
        const out = NormalizeSqlLiterals("SELECT * FROM Users WHERE Email = 'alice@example.com");
        expect(out).not.toContain('alice');
    });

    it('replaces every value of an IN list and of a BETWEEN range', () => {
        const out = NormalizeSqlLiterals('SELECT * FROM T WHERE ID IN (101, 202, 303) AND Age BETWEEN 18 AND 65');
        for (const n of ['101', '202', '303', '18', '65']) {
            expect(out).not.toContain(n);
        }
    });
});

// These inputs make a backtracking pattern run for minutes. The bound sits well above linear time on a shared CI runner
// (535 ms was measured for the 1.6 MB case while six test shards ran) and far below what a backtracking regression costs.
const LINEAR_TIME_BOUND_MS = 2_000;

describe('Stage 1 running time', () => {
    it('scrubs 400 KB of JWT-like dashed segments in linear time', () => {
        const hostile = 'eyJ-'.repeat(100_000);
        expect(elapsedMs(() => ScrubString(hostile, 'FullRaw'))).toBeLessThan(LINEAR_TIME_BOUND_MS);
    }, 60_000);

    it('scrubs 1.6 MB of sensitive name: value lines with no carriage return in linear time', () => {
        const hostile = 'pwd:x\n'.repeat(280_000);
        expect(elapsedMs(() => ScrubString(hostile, 'FullRaw'))).toBeLessThan(LINEAR_TIME_BOUND_MS);
    }, 60_000);
});

describe('Stage 1 secret shapes in strings', () => {
    it('redacts an Authorization: Basic credential and keeps the scheme', () => {
        const out = ScrubString('Authorization: Basic dXNlcjpwYXNzd29yZA==', 'FullRaw');
        expect(out).not.toContain('dXNlcjpwYXNzd29yZA');
        expect(out).toContain('Authorization: Basic');
    });

    it('redacts single-quoted and double-quoted connection string passwords', () => {
        const single = ScrubString("Server=db;Password='p@ss;word one';User ID=sa", 'FullRaw');
        expect(single).not.toContain('p@ss');
        expect(single).not.toContain('word one');
        const double = ScrubString('Server=db;Pwd="hunter2 two";User ID=sa', 'FullRaw');
        expect(double).not.toContain('hunter2');
    });

    it('redacts URI credentials and keeps the scheme and host', () => {
        const pg = ScrubString('connecting to postgres://dbuser:s3cretPass@db.example.com:5432/mj', 'FullRaw');
        expect(pg).not.toContain('s3cretPass');
        expect(pg).toContain('postgres://');
        expect(pg).toContain('@db.example.com:5432/mj');
        const web = ScrubString('GET https://admin:hunter2pw@api.example.com/v1', 'FullRaw');
        expect(web).not.toContain('hunter2pw');
        expect(web).toContain('https://');
        expect(web).toContain('@api.example.com/v1');
    });

    it('redacts JSON key-value secrets inside a string, plain and escaped', () => {
        const plain = ScrubString('body {"user":"bob","password":"hunter2x","dbPassword": "p4ss"}', 'FullRaw');
        expect(plain).not.toContain('hunter2x');
        expect(plain).not.toContain('p4ss');
        expect(plain).toContain('"user":"bob"');
        const escaped = ScrubString('{"body":"{\\"password\\":\\"hunter2z\\"}"}', 'FullRaw');
        expect(escaped).not.toContain('hunter2z');
    });

    it('redacts YAML key-value secrets', () => {
        const out = ScrubString('db:\n  host: localhost\n  password: hunter2y\n  port: 5432', 'FullRaw');
        expect(out).not.toContain('hunter2y');
        expect(out).toContain('host: localhost');
        expect(out).toContain('port: 5432');
    });

    it('redacts AWS_SECRET_ACCESS_KEY assignments', () => {
        const out = ScrubString('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY', 'FullRaw');
        expect(out).not.toContain('wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY');
    });

    it('redacts AWS signed-URL query parameters', () => {
        const url =
            'https://b.s3.amazonaws.com/o?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=myaccesskeyid%2F20260101%2Fus-east-1' +
            '&X-Amz-Signature=abcdef0123456789&X-Amz-Security-Token=FwoGZXIvYXdzEJr';
        const out = ScrubString(url, 'FullRaw');
        expect(out).not.toContain('myaccesskeyid');
        expect(out).not.toContain('abcdef0123456789');
        expect(out).not.toContain('FwoGZXIvYXdzEJr');
        expect(out).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    });

    it('redacts client_secret in a form body', () => {
        const out = ScrubString('grant_type=client_credentials&client_secret=abc123secretvalue&client_id=app', 'FullRaw');
        expect(out).not.toContain('abc123secretvalue');
        expect(out).toContain('client_id=app');
    });

    it("redacts SQL Server N'…' literals in parameter assignments under every profile", () => {
        const sql = "exec spUpdate @Name=N'Bob', @AccessToken=N'ya29.tok', @Password = N'it''s pw', @RefreshToken=n'1//rt'";
        for (const profile of ['FullRaw', 'Standard'] as const) {
            const out = ScrubString(sql, profile);
            expect(out).not.toContain('ya29.tok');
            expect(out).not.toContain('pw');
            expect(out).not.toContain('1//rt');
        }
        expect(ScrubString(sql, 'FullRaw')).toContain("@Name=N'Bob'");
        expect(ScrubString("Password=N'x'", 'FullRaw')).toBe('Password=[REDACTED_SECRET]');
        expect(ScrubString("@ClientSecret=N'cs-abc'", 'FullRaw')).toBe('@ClientSecret=[REDACTED_SECRET]');
    });

    it('redacts an x-api-key header line', () => {
        const out = ScrubString('request headers:\nx-api-key: abcdef123456\naccept: */*', 'FullRaw');
        expect(out).not.toContain('abcdef123456');
        expect(out).toContain('accept: */*');
    });
});

describe('Stage 1 unterminated quoted values', () => {
    it('still checks pairs after an unterminated quoted value of a non-sensitive key', () => {
        const out = ScrubString("msg='it client_secret=SUPERSECRET; api_key=KKKK1234", 'FullRaw');
        expect(out).not.toContain('SUPERSECRET');
        expect(out).not.toContain('KKKK1234');
    });
});

describe('Stage 1 colon-form values', () => {
    it('redacts an unquoted value after a sensitive name to the end of the line', () => {
        const yaml = ScrubString('password: my secret phrase\nhost: db', 'FullRaw');
        expect(yaml).not.toContain('secret phrase');
        expect(yaml).toContain('password: [REDACTED_SECRET]');
        expect(yaml).toContain('host: db');
        const tight = ScrubString('pwd:hunter2 extra words', 'FullRaw');
        expect(tight).not.toContain('extra words');
    });

    it('ends a quoted value after a sensitive name at its closing quote', () => {
        const out = ScrubString('token: "abc def" then the request failed', 'FullRaw');
        expect(out).not.toContain('abc def');
        expect(out).toContain('then the request failed');
    });
});

describe('Stage 1 boolean-looking text values', () => {
    it('redacts the text true or false under a sensitive name', () => {
        expect(ScrubString('password: false', 'FullRaw')).toBe('password: [REDACTED_SECRET]');
        expect(ScrubString('pwd: true', 'FullRaw')).toBe('pwd: [REDACTED_SECRET]');
        expect(ScrubString('password=false', 'FullRaw')).toBe('password=[REDACTED_SECRET]');
        expect(ScrubString('{"password": "false"}', 'FullRaw')).not.toContain('"false"');
    });
});

describe('Stage 1 tokens name', () => {
    it('keeps a tokens value only when it is a number', () => {
        expect(ScrubString('tokens=abc123', 'FullRaw')).not.toContain('abc123');
        const out = ScrubValue({ tokens: ['opaque-abc'] }, 'FullRaw');
        expect(JSON.stringify(out)).not.toContain('opaque-abc');
        expect(ScrubValue({ tokens: 120 }, 'FullRaw').tokens).toBe(120);
    });
});

describe('Stage 1 all-caps ID suffix', () => {
    it('keeps an all-caps name only when ID follows a separator', () => {
        expect(ScrubString('AUTH_TOKEN_VALID=abc123', 'FullRaw')).not.toContain('abc123');
        const out = ScrubValue({ AUTH_TOKEN_VALID: 'v1', CLIENT_SECRET_ANDROID: 'v2', API_KEY_ID: 'k-2', apiKeyId: 'k-1' }, 'FullRaw');
        expect(out.AUTH_TOKEN_VALID).toBe('[REDACTED_KEY]');
        expect(out.CLIENT_SECRET_ANDROID).toBe('[REDACTED_KEY]');
        expect(out.API_KEY_ID).toBe('k-2');
        expect(out.apiKeyId).toBe('k-1');
    });
});

describe('Stage 1 count and length names', () => {
    it('keeps a Count or Length value only when it is a number', () => {
        const out = ScrubValue({ passwordLength: 'hunter2', secretCount: 'x1', tokenLength: 7 }, 'FullRaw');
        expect(out.passwordLength).toBe('[REDACTED_KEY]');
        expect(out.secretCount).toBe('[REDACTED_KEY]');
        expect(out.tokenLength).toBe(7);
        expect(ScrubString('secretCount: hunter2', 'FullRaw')).not.toContain('hunter2');
        expect(ScrubString('passwordLength=hunter2', 'FullRaw')).not.toContain('hunter2');
        expect(ScrubString('passwordLength: 12', 'FullRaw')).toContain('12');
    });
});

describe('Stage 1 sensitive object keys', () => {
    it('keeps boolean values and id, type, version, policy, count, length and token-usage names', () => {
        const out = ScrubValue(
            {
                hasPassword: true,
                apiKeyId: 'k-1',
                API_KEY_ID: 'k-2',
                credentialType: 'oauth',
                signatureVersion: 'v4',
                passwordPolicy: 'strict',
                passwordLength: 12,
                secretCount: 3,
                tokens: 120,
                tokenUsage: 30,
                password: 1234,
            },
            'FullRaw'
        );
        expect(out.hasPassword).toBe(true);
        expect(out.apiKeyId).toBe('k-1');
        expect(out.API_KEY_ID).toBe('k-2');
        expect(out.credentialType).toBe('oauth');
        expect(out.signatureVersion).toBe('v4');
        expect(out.passwordPolicy).toBe('strict');
        expect(out.passwordLength).toBe(12);
        expect(out.secretCount).toBe(3);
        expect(out.tokens).toBe(120);
        expect(out.tokenUsage).toBe(30);
        expect(out.password).toBe('[REDACTED_KEY]');
    });

    it('redacts keys that contain a secret word and keeps token-count keys', () => {
        const out = ScrubValue(
            {
                dbPassword: 'a1',
                DB_PASSWORD: 'a2',
                'x-api-key': 'a3',
                token: 'a4',
                tokenCount: 10,
                maxTokens: 20,
                promptTokens: 30,
                tokenizer: 'cl100k',
            },
            'FullRaw'
        );
        expect(out.dbPassword).toBe('[REDACTED_KEY]');
        expect(out.DB_PASSWORD).toBe('[REDACTED_KEY]');
        expect(out['x-api-key']).toBe('[REDACTED_KEY]');
        expect(out.token).toBe('[REDACTED_KEY]');
        expect(out.tokenCount).toBe(10);
        expect(out.maxTokens).toBe(20);
        expect(out.promptTokens).toBe(30);
        expect(out.tokenizer).toBe('cl100k');
    });
});

describe('ScrubHeaders token, key and secret headers', () => {
    it('redacts X-Auth-Token and other *-token, *-key and *-secret headers', () => {
        const out = ScrubHeaders({
            'X-Auth-Token': 't1',
            'X-Session-Token': 't2',
            'X-Client-Key': 'k1',
            'X-Webhook-Secret': 's1',
            'Content-Type': 'application/json',
        });
        expect(out['X-Auth-Token']).toBe('[REDACTED_HEADER]');
        expect(out['X-Session-Token']).toBe('[REDACTED_HEADER]');
        expect(out['X-Client-Key']).toBe('[REDACTED_HEADER]');
        expect(out['X-Webhook-Secret']).toBe('[REDACTED_HEADER]');
        expect(out['Content-Type']).toBe('application/json');
    });
});

describe('Standard profile literal scrubbing outside serverSql[].sql', () => {
    it('normalizes SQL literals in client and server log text', () => {
        const data = EmptyBundleData();
        const message = "RunView failed: SELECT * FROM vwUsers WHERE Email = 'alice@example.com' AND Age > 42";
        data.clientLogs = [{ timestamp: '2026-11-02T00:00:00Z', severity: 'error', source: 'client', message }];
        data.serverLogs = [{ timestamp: '2026-11-02T00:00:00Z', severity: 'info', source: 'server', message: "filter Name = 'Bob Smith'" }];
        const standard = ScrubBundleData(data, 'Standard');
        expect(standard.clientLogs[0].message).not.toContain('alice@example.com');
        expect(standard.clientLogs[0].message).not.toContain('42');
        expect(standard.serverLogs[0].message).not.toContain('Bob Smith');
        expect(ScrubBundleData(data, 'FullRaw').clientLogs[0].message).toContain('alice@example.com');
    });

    it('normalizes ExtraFilter, OrderBy and batch Filters in client telemetry params', () => {
        const data = EmptyBundleData();
        data.clientTelemetry = [
            {
                id: 'e1',
                category: 'RunView',
                operation: 'ProviderBase.RunView',
                startTimeUnixMs: 1,
                params: {
                    EntityName: 'MJ: Users',
                    ExtraFilter: "Email = 'alice@example.com' AND Age > 42",
                    OrderBy: "CASE WHEN Name = 'Carol' THEN 0 ELSE 1 END",
                    Filters: ["Status = 'Dave-Status'", undefined],
                },
            },
        ];
        const params = ScrubBundleData(data, 'Standard').clientTelemetry[0].params ?? {};
        expect(JSON.stringify(params)).not.toContain('alice@example.com');
        expect(JSON.stringify(params)).not.toContain('Carol');
        expect(JSON.stringify(params)).not.toContain('Dave-Status');
        expect(params['EntityName']).toBe('MJ: Users');
    });

    it('normalizes literals in query plan XML and keeps plan numbers', () => {
        const data = EmptyBundleData();
        data.serverSql = [
            {
                timestamp: '2026-11-02T00:00:00Z',
                sql: 'SELECT 1',
                durationMs: 1,
                parameterTypes: [],
                executionPlanXml:
                    '<ShowPlanXML><StmtSimple StatementText="SELECT * FROM U WHERE Email = N\'alice@example.com\'" StatementEstRows="1">' +
                    '<ScalarOperator ScalarString="[Email]=N\'carol@example.com\'"/>' +
                    '<ColumnReference Column="@p0" ParameterCompiledValue="N\'bob@example.com\'"/></StmtSimple></ShowPlanXML>',
            },
        ];
        const plan = ScrubBundleData(data, 'Standard').serverSql[0].executionPlanXml ?? '';
        expect(plan).not.toContain('alice@example.com');
        expect(plan).not.toContain('bob@example.com');
        expect(plan).not.toContain('carol@example.com');
        expect(plan).toContain('StatementEstRows="1"');
    });
});
