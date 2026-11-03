import { describe, it, expect } from 'vitest';
import {
  BoundedRingBuffer,
  TraceCorrelationBuffer,
  ScrubString,
  ScrubValue,
  ScrubHeaders,
  NormalizeSqlLiterals,
  TruncateStackFramePath,
  ScrubBundleData,
  ScrubStringWithCount,
  ScrubBundleDataWithCount,
  BuildMjdiagArchive,
  BuildCustomZipArchive,
  VerifyBundleArchive,
  ParseBundleDataFromArchive,
  GenerateDiagnosticKeyPair,
  SignRecipientPublicKey,
  VerifyRecipientPublicKeySignature,
  EncryptDiagnosticBundle,
  DecryptDiagnosticBundle,
  InspectEncryptedEnvelopeHeader,
  AnalyzeDiagnosticBundleData,
  ExportToPerfettoTrace,
  ExportToOtlpJson,
  BaseDiagnosticContributor,
  DiagnosticContributorRegistry,
  DiagnosticBundleData,
  DiagnosticContributionContext,
  ComputeSha256Hex
} from '../index.js';

function createSampleBundleData(): DiagnosticBundleData {
  return {
    environment: {
      mjVersion: '6.2.0',
      gitCommit: 'abc1234',
      nodeVersion: 'v24.10.0',
      osPlatform: 'darwin',
      osRelease: '24.1.0',
      osArch: 'arm64',
      databasePlatform: 'sqlserver',
      databaseVersion: '16.0.1000',
      browserUserAgent: 'Mozilla/5.0',
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 2,
      timezone: 'America/Chicago',
      clockSkewMs: 2500,
      featureFlags: { diagnostics: true }
    },
    repro: {
      url: 'https://app.example.com/resource/123?token=secret-token-value',
      route: '/resource/123',
      userComment: 'Save button hung for 4 seconds',
      ReproductionSteps: ['Clicked Save', 'Observed spinner'],
      breadcrumbs: [
        {
          timestamp: '2026-04-18T12:00:00.000Z',
          type: 'click',
          target: 'button[data-mj-action="save"]',
          route: '/resource/123'
        }
      ]
    },
    clientLogs: [
      {
        timestamp: '2026-04-18T12:00:01.000Z',
        severity: 'error',
        source: 'client',
        message: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456_signature failed',
        traceId: '0123456789abcdef0123456789abcdef'
      }
    ],
    clientWaterfall: [
      {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '1111222233334444',
        operationName: 'SaveEntityRecord',
        operationKind: 'mutation',
        startTimeUnixMs: 1000,
        durationMs: 2200,
        status: 'error',
        retryCount: 1,
        requestBytes: 512,
        responseBytes: 1024,
        errorMessage: 'GraphQL Timeout'
      }
    ],
    clientTelemetry: [
      {
        id: 'evt-1',
        category: 'BaseEntity',
        operation: 'BaseEntity.Save',
        startTimeUnixMs: 1000,
        durationMs: 2200,
        traceId: '0123456789abcdef0123456789abcdef',
        params: {
          Entity: 'MJ: Users',
          Success: false,
          apiKey: 'sk-proj-1234567890abcdefghijklmnop'
        }
      }
    ],
    serverTraces: [
      {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: 'aaaa222233334444',
        parentSpanId: '1111222233334444',
        name: 'GraphQL.SaveEntityRecord',
        layer: 'graphql',
        startTimeUnixMs: 1010,
        durationMs: 2150,
        status: 'ok',
        attributes: { operationName: 'SaveEntityRecord' }
      },
      {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: 'bbbb222233334444',
        parentSpanId: 'aaaa222233334444',
        name: 'SQL.spUpdateUser',
        layer: 'sql',
        startTimeUnixMs: 1800,
        durationMs: 1300,
        status: 'ok',
        attributes: { rowCount: 1 }
      }
    ],
    serverSql: [
      {
        timestamp: '2026-04-18T12:00:01.800Z',
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: 'bbbb222233334444',
        sql: "SELECT * FROM __mj.vwUsers WHERE Email = 'alice@example.com' AND IsActive = 1",
        durationMs: 1300,
        rowCount: 1,
        parameterTypes: [{ name: '@p0', sqlType: 'nvarchar(255)', byteLength: 34 }]
      },
      // N+1 pattern: 6 identical normalized queries in the same traceId
      ...Array.from({ length: 6 }, (_, i) => ({
        timestamp: `2026-04-18T12:00:02.${i}00Z`,
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: `cccc22223333444${i}`,
        sql: `SELECT * FROM __mj.vwUserRoles WHERE UserID = '550e8400-e29b-41d4-a716-44665544000${i}'`,
        durationMs: 25,
        rowCount: 2,
        parameterTypes: []
      }))
    ],
    serverLogs: [
      {
        timestamp: '2026-04-18T12:00:01.500Z',
        severity: 'warn',
        source: 'server',
        message: 'ConnectionString Password=mySuperSecretPassword123;User ID=sa;',
        traceId: '0123456789abcdef0123456789abcdef'
      }
    ],
    serverHealth: {
      timestamp: '2026-04-18T12:00:02.000Z',
      uptimeSeconds: 86400,
      eventLoopLagP95Ms: 42.5,
      memory: {
        rssBytes: 600_000_000,
        heapTotalBytes: 500_000_000,
        heapUsedBytes: 460_000_000, // 92% -> triggers high memory pressure finding
        externalBytes: 12_000_000
      },
      databasePool: {
        totalConnections: 20,
        activeConnections: 20,
        idleConnections: 0,
        waitingRequests: 4 // triggers pool exhaustion finding
      },
      cacheStats: {
        enabled: true,
        entryCount: 140
      },
      startupSummary: {
        totalStartupMs: 1450,
        phaseDurationsMs: { metadata: 600, resolvers: 850 }
      }
    },
    findings: [],
    contrib: {
      'ai-agent-runs': { recentRuns: 2 }
    }
  };
}

describe('BoundedRingBuffer & TraceCorrelationBuffer', () => {
  it('evicts oldest items when maxItems is exceeded and tracks DroppedCount', () => {
    const buffer = new BoundedRingBuffer<{ id: number }>({ maxItems: 3, maxBytes: 10_000 });
    buffer.Push({ id: 1 });
    buffer.Push({ id: 2 });
    buffer.Push({ id: 3 });
    buffer.Push({ id: 4 });

    expect(buffer.Count).toBe(3);
    expect(buffer.DroppedCount).toBe(1);
    expect(buffer.ToArray().map((x) => x.id)).toEqual([2, 3, 4]);
  });

  it('evicts oldest items when maxBytes budget is exceeded', () => {
    const buffer = new BoundedRingBuffer<string>({ maxItems: 100, maxBytes: 200 });
    buffer.Push('a'.repeat(40)); // ~80 bytes
    buffer.Push('b'.repeat(40)); // ~80 bytes
    buffer.Push('c'.repeat(40)); // ~80 bytes -> total 240 > 200, evicts 'a'

    const arr = buffer.ToArray();
    expect(arr.length).toBe(2);
    expect(arr[0]).toBe('b'.repeat(40));
    expect(buffer.DroppedCount).toBe(1);
  });

  it('indexes items by traceId in TraceCorrelationBuffer with O(1) lookup', () => {
    const traceBuf = new TraceCorrelationBuffer<{ traceId?: string; msg: string }>({
      maxTraces: 2,
      maxItemsPerTrace: 2,
      maxTotalBytes: 50_000
    });

    traceBuf.Record({ traceId: 'trace-1', msg: 'a' });
    traceBuf.Record({ traceId: 'trace-1', msg: 'b' });
    traceBuf.Record({ traceId: 'trace-1', msg: 'c' }); // drops 'a' inside trace-1

    expect(traceBuf.GetByTraceId('trace-1').map((x) => x.msg)).toEqual(['b', 'c']);

    traceBuf.Record({ traceId: 'trace-2', msg: 'd' });
    traceBuf.Record({ traceId: 'trace-3', msg: 'e' }); // evicts oldest trace ('trace-1')

    expect(traceBuf.GetByTraceId('trace-1')).toEqual([]);
    expect(traceBuf.GetByTraceId('trace-2').map((x) => x.msg)).toEqual(['d']);
    expect(traceBuf.GetByTraceId('trace-3').map((x) => x.msg)).toEqual(['e']);
  });
});

describe('Two-Stage Credential & Literal Scrubber', () => {
  it('Stage 1 (Always) scrubs JWTs, Bearer tokens, API keys, passwords, and PEM keys even in FullRaw mode', () => {
    const raw = [
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      'OpenAI key sk-proj-1234567890abcdefghijklmnop',
      'AWS key AKIAIOSFODNN7EXAMPLE',
      'GitHub ghp_1234567890abcdefghijklmnopqrstuvwxyz',
      'Server=tcp:myserver;Password=SecretPass!123;User ID=admin;',
      '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC\n-----END PRIVATE KEY-----'
    ].join('\n');

    const scrubbedRawMode = ScrubString(raw, { scrubberProfile: 'FullRaw' });
    expect(scrubbedRawMode).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(scrubbedRawMode).not.toContain('sk-proj-1234567890abcdefghijklmnop');
    expect(scrubbedRawMode).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(scrubbedRawMode).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
    expect(scrubbedRawMode).not.toContain('SecretPass!123');
    expect(scrubbedRawMode).not.toContain('MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC');
    expect(scrubbedRawMode).toContain('[REDACTED_PEM_KEY]');
  });

  it('ScrubHeaders redacts sensitive headers and scrubs remaining header values', () => {
    const headers = ScrubHeaders({
      Authorization: 'Bearer secret',
      Cookie: 'mj_session=xyz',
      'X-API-Key': 'my-key',
      'Content-Type': 'application/json'
    });
    expect(headers['Authorization']).toBe('[REDACTED_HEADER]');
    expect(headers['Cookie']).toBe('[REDACTED_HEADER]');
    expect(headers['X-API-Key']).toBe('[REDACTED_HEADER]');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('Stage 2 (Standard) normalizes inline SQL literals and truncates stack paths', () => {
    const sql = "SELECT * FROM Users WHERE Email = 'alice@example.com' AND ID = '550e8400-e29b-41d4-a716-446655440000' AND Age > 42";
    const normalized = NormalizeSqlLiterals(sql);
    expect(normalized).not.toContain('alice@example.com');
    expect(normalized).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(normalized).toContain('Email = ?');
    expect(normalized).toContain('ID = ?');
    expect(normalized).toContain('Age > ?');

    const stack = 'Error: boom\n    at UserService.Save (/Users/alice/develop/MJ/packages/MJCore/src/generic/baseEntity.ts:120:15)';
    const truncated = TruncateStackFramePath(stack);
    expect(truncated).not.toContain('/Users/alice/develop/MJ/');
    expect(truncated).toContain('packages/MJCore/src/generic/baseEntity.ts:120:15');
  });

  it('ScrubValue redacts sensitive object keys and applies custom Patterns', () => {
    const input = {
      userName: 'acct-9999',
      clientSecret: 'top-secret',
      nested: {
        refreshToken: 'refresh-123'
      }
    };
    const out = ScrubValue(input, {
      scrubberProfile: 'Standard',
      customPatterns: ['acct-\\d+']
    });
    expect(out.userName).toBe('[REDACTED_CUSTOM]');
    expect(out.clientSecret).toBe('[REDACTED_KEY]');
    expect(out.nested.refreshToken).toBe('[REDACTED_KEY]');
  });
});

describe('Scrubber redaction counts', () => {
  const threeSecretsOneLine =
    'key sk-proj-1234567890abcdefghijklmnop then AKIAIOSFODNN7EXAMPLE then Password=hunter2';

  it('ScrubStringWithCount counts each redaction, not each line', () => {
    const result = ScrubStringWithCount(threeSecretsOneLine, 'FullRaw');
    expect(result.RedactionCount).toBe(3);
    expect(result.Text).toBe(ScrubString(threeSecretsOneLine, 'FullRaw'));
  });

  it('counts a secret once when a later rule matches an earlier redaction marker', () => {
    const key = 'sk-proj-1234567890abcdefghijklmnop';
    expect(ScrubStringWithCount(`https://x/?token=${key}`, 'FullRaw').RedactionCount).toBe(1);
    expect(ScrubStringWithCount(`Password=${key}`, 'FullRaw').RedactionCount).toBe(1);
  });

  it('redacts the whole value when it starts with a key an earlier rule already redacted', () => {
    const conn = ScrubStringWithCount('Password=sk-proj-1234567890abcdefghijklmnop!hunter2tail;', 'FullRaw');
    expect(conn.Text).not.toContain('hunter2tail');
    expect(conn.RedactionCount).toBe(1);

    const query = ScrubStringWithCount('https://x/?password=AKIAIOSFODNN7EXAMPLE.mysecretpart&x=1', 'FullRaw');
    expect(query.Text).not.toContain('mysecretpart');
    expect(query.RedactionCount).toBe(1);
  });

  it('ScrubBundleDataWithCount counts the redactions across the whole bundle', () => {
    const data = createSampleBundleData();
    data.clientLogs = [{ timestamp: '2026-11-02T12:00:00.000Z', severity: 'info', source: 'client', message: threeSecretsOneLine }];
    data.serverLogs = [{ timestamp: '2026-11-02T12:00:00.000Z', severity: 'info', source: 'server', message: 'no secrets here' }];
    data.serverSql = [];
    data.serverTraces = [];
    data.clientWaterfall = [];
    data.clientTelemetry = [];
    data.contrib = undefined;
    data.repro = { breadcrumbs: [] };
    const result = ScrubBundleDataWithCount(data, 'FullRaw');
    expect(result.CredentialsScrubbedCount).toBe(3);
    expect(result.Data.clientLogs[0].message).not.toContain('hunter2');
  });
});

describe('Scrubber PEM private-key redaction', () => {
  it('finishes in linear time on many BEGIN headers with no END marker', () => {
    const header = '-----BEGIN PRIVATE KEY-----';
    const hostile = header.repeat(Math.ceil(1_200_000 / header.length));
    const started = Date.now();
    const out = ScrubString(hostile, 'FullRaw');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(out).toBe(hostile);
  });
});

describe('.mjdiag ZIP Archive Builder & Strict Structural Verifier', () => {
  it('builds a valid .mjdiag archive and round-trips through VerifyBundleArchive and ParseBundleDataFromArchive', async () => {
    const rawData = createSampleBundleData();
    const scrubbed = ScrubBundleData(rawData, { scrubberProfile: 'Standard' });
    scrubbed.findings = AnalyzeDiagnosticBundleData(scrubbed);

    const archiveBytes = await BuildMjdiagArchive(scrubbed, {
      bundleId: 'bundle-test-001',
      sessionId: 'session-test-001',
      captureReason: 'Manual',
      scrubberProfile: 'Standard',
      redactionSummary: {
        credentialsScrubbedCount: 3,
        sqlLiteralsNormalizedCount: 7,
        customPatternsAppliedCount: 0
      }
    });

    const verification = await VerifyBundleArchive(archiveBytes);
    expect(verification.valid).toBe(true);
    expect(verification.manifest?.bundleId).toBe('bundle-test-001');
    expect(verification.manifest?.schemaVersion).toBe('1.0');

    const parsed = ParseBundleDataFromArchive(verification);
    expect(parsed.environment.mjVersion).toBe('6.2.0');
    expect(parsed.clientWaterfall.length).toBe(1);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.contrib?.['ai-agent-runs']).toEqual({ recentRuns: 2 });
  });

  it('rejects non-ZIP magic bytes, path traversal entries, disallowed filenames, and tampered SHA-256 digests', async () => {
    // 1. Bad magic bytes
    const badMagic = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const resMagic = await VerifyBundleArchive(badMagic);
    expect(resMagic.valid).toBe(false);
    expect(resMagic.reasonCode).toBe('INVALID_ZIP_MAGIC');

    // 2. Path traversal entry
    const traversalZip = await BuildCustomZipArchive([
      { name: '../evil.txt', data: new TextEncoder().encode('pwn') }
    ]);
    const resTraversal = await VerifyBundleArchive(traversalZip);
    expect(resTraversal.valid).toBe(false);
    expect(resTraversal.reasonCode).toBe('UNSAFE_ENTRY_PATH');

    // 3. Disallowed filename
    const disallowedZip = await BuildCustomZipArchive([
      { name: 'executable.sh', data: new TextEncoder().encode('#!/bin/sh') }
    ]);
    const resDisallowed = await VerifyBundleArchive(disallowedZip);
    expect(resDisallowed.valid).toBe(false);
    expect(resDisallowed.reasonCode).toBe('DISALLOWED_ENTRY_NAME');

    // 4. Tampered SHA-256 digest in manifest.json
    const validBundle = createSampleBundleData();
    const validArchive = await BuildMjdiagArchive(validBundle);
    const verified = await VerifyBundleArchive(validArchive);
    expect(verified.valid).toBe(true);

    const tamperedManifest = structuredClone(verified.manifest!);
    tamperedManifest.files['environment.json'].sha256 = '0'.repeat(64);
    const tamperedZip = await BuildCustomZipArchive([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(tamperedManifest)) },
      { name: 'environment.json', data: verified.entries!.get('environment.json')! }
    ]);
    const resTampered = await VerifyBundleArchive(tamperedZip);
    expect(resTampered.valid).toBe(false);
    expect(resTampered.reasonCode).toBe('ENTRY_SHA256_MISMATCH');
  });

  it('rejects zip-bomb compression ratios exceeding maxCompressionRatio', async () => {
    // Highly compressible payload (100 KB of zeros)
    const zeros = new Uint8Array(100_000);
    const zipBytes = await BuildCustomZipArchive([{ name: 'environment.json', data: zeros }]);
    const res = await VerifyBundleArchive(zipBytes, { maxCompressionRatio: 5 });
    expect(res.valid).toBe(false);
    expect(res.reasonCode).toBe('ZIP_BOMB_RATIO_EXCEEDED');
  });
});

describe('Hybrid Envelope Cryptography (X25519 + HKDF-SHA256 + AES-256-GCM + Ed25519)', () => {
  it('signs and verifies recipient public key pins with Ed25519', async () => {
    const recipientX25519 = await GenerateDiagnosticKeyPair('X25519', 'mjc-2026-04');
    const authorityEd25519 = await GenerateDiagnosticKeyPair('Ed25519', 'root-authority');

    const signature = await SignRecipientPublicKey(
      recipientX25519.keyId,
      recipientX25519.publicKeyBase64,
      authorityEd25519.privateKeyBase64
    );

    const valid = await VerifyRecipientPublicKeySignature(
      recipientX25519.keyId,
      recipientX25519.publicKeyBase64,
      signature,
      authorityEd25519.publicKeyBase64
    );
    expect(valid).toBe(true);

    // Tampered keyId should fail verification
    const invalid = await VerifyRecipientPublicKeySignature(
      'mjc-tampered',
      recipientX25519.publicKeyBase64,
      signature,
      authorityEd25519.publicKeyBase64
    );
    expect(invalid).toBe(false);
  });

  it('encrypts, inspects header, and decrypts a .mjdiag.enc bundle with sender authentication', async () => {
    const recipientKey = await GenerateDiagnosticKeyPair('X25519', 'mjc-2026-04');
    const authorityKey = await GenerateDiagnosticKeyPair('Ed25519', 'mjc-root');
    const senderKey = await GenerateDiagnosticKeyPair('Ed25519', 'customer-env-prod');

    const recipientSig = await SignRecipientPublicKey(
      recipientKey.keyId,
      recipientKey.publicKeyBase64,
      authorityKey.privateKeyBase64
    );

    const bundleData = ScrubBundleData(createSampleBundleData(), { scrubberProfile: 'Standard' });
    const archiveBytes = await BuildMjdiagArchive(bundleData);
    const verifiedArchive = await VerifyBundleArchive(archiveBytes);

    const encrypted = await EncryptDiagnosticBundle(archiveBytes, {
      recipientKeyId: recipientKey.keyId,
      recipientPublicKeyBase64: recipientKey.publicKeyBase64,
      recipientKeySignatureBase64: recipientSig,
      pinnedAuthorityPublicKeyBase64: authorityKey.publicKeyBase64,
      senderSigningPrivateKeyBase64: senderKey.privateKeyBase64,
      senderKeyId: senderKey.keyId,
      senderEnvironmentId: 'env-prod-1',
      manifestSha256: await ComputeSha256Hex(archiveBytes)
    });

    // Fast header inspection
    const headerCheck = InspectEncryptedEnvelopeHeader(encrypted, ['mjc-2026-04']);
    expect(headerCheck.valid).toBe(true);
    expect(headerCheck.header?.recipientKeyId).toBe('mjc-2026-04');

    // Full AEAD decrypt + inner ZIP verification
    const decrypted = await DecryptDiagnosticBundle(encrypted, {
      PrivateKeysByKeyId: { [recipientKey.keyId]: recipientKey.privateKeyBase64 },
      SenderPublicKeysByKeyId: { [senderKey.keyId]: senderKey.publicKeyBase64 },
      RequireSenderSignature: true
    });

    expect(decrypted.valid).toBe(true);
    expect(decrypted.senderVerified).toBe(true);
    expect(decrypted.archiveVerification?.valid).toBe(true);
  });

  it('fails AEAD authentication if unencrypted header AAD is tampered', async () => {
    const recipientKey = await GenerateDiagnosticKeyPair('X25519', 'mjc-2026-04');
    const archiveBytes = await BuildMjdiagArchive(createSampleBundleData());

    const encrypted = await EncryptDiagnosticBundle(archiveBytes, {
      recipientKeyId: recipientKey.keyId,
      recipientPublicKeyBase64: recipientKey.publicKeyBase64,
      senderEnvironmentId: 'env-prod-1',
      manifestSha256: 'a'.repeat(64)
    });

    // Flip a byte inside the JSON header (byte offset 25)
    const tampered = new Uint8Array(encrypted);
    tampered[25] ^= 0x01;

    const decrypted = await DecryptDiagnosticBundle(tampered, {
      PrivateKeysByKeyId: { [recipientKey.keyId]: recipientKey.privateKeyBase64 }
    });
    expect(decrypted.valid).toBe(false);
  });
});

describe('Automated Findings Engine & Perfetto / OTLP Exporters', () => {
  it('detects N+1 SQL queries, slow SQL, waterfall errors, failed entity saves, memory pressure, pool exhaustion, and clock skew', () => {
    const data = createSampleBundleData();
    const findings = AnalyzeDiagnosticBundleData(data);
    const categories = new Set(findings.map((f) => f.category));

    expect(categories.has('n_plus_one_sql')).toBe(true);
    expect(categories.has('slow_sql')).toBe(true);
    expect(categories.has('graphql_error_rate')).toBe(true);
    expect(categories.has('failed_entity_save')).toBe(true);
    expect(categories.has('memory_pressure')).toBe(true);
    expect(categories.has('db_pool_exhaustion')).toBe(true);
    expect(categories.has('clock_skew')).toBe(true);
  });

  it('skips the pool rule when the health snapshot has no database pool block', () => {
    const data = createSampleBundleData();
    delete data.serverHealth!.databasePool;
    const findings = AnalyzeDiagnosticBundleData(data);
    const categories = new Set(findings.map((f) => f.category));

    expect(categories.has('db_pool_exhaustion')).toBe(false);
    expect(categories.has('memory_pressure')).toBe(true);
  });

  it('exports client and server spans to Perfetto TraceEvents and OTLP JSON', () => {
    const data = createSampleBundleData();
    const perfetto = ExportToPerfettoTrace(data);
    expect(perfetto.traceEvents.length).toBeGreaterThanOrEqual(3);
    expect(perfetto.traceEvents.some((e) => e.cat === 'client.graphql')).toBe(true);

    const otlp = ExportToOtlpJson(data);
    expect(otlp.resourceSpans.length).toBe(1);
    expect(otlp.resourceSpans[0].scopeSpans[0].spans.length).toBe(3);
  });
});

describe('BaseDiagnosticContributor & DiagnosticContributorRegistry', () => {
  class MockContributor extends BaseDiagnosticContributor {
    public get SectionKey(): string {
      return 'mock-section';
    }
    public async Collect(context: DiagnosticContributionContext): Promise<Record<string, unknown>> {
      return { sessionId: context.sessionId, ok: true };
    }
  }

  it('collects contributor payloads and isolates contributor timeouts/failures', async () => {
    DiagnosticContributorRegistry.Instance.RegisterContributor(new MockContributor());
    const result = await DiagnosticContributorRegistry.Instance.CollectAll({
      sessionId: 'sess-123',
      scrubberProfile: 'Standard'
    });
    expect(result['mock-section']).toEqual({ sessionId: 'sess-123', ok: true });
  });
});
