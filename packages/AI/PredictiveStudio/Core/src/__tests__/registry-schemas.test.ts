/**
 * The registry-column validators: a `Delivery` view, a `CodeVersion` and an `OutputSemantics` read back from a model
 * row are checked against their contracts before an entry is built from them.
 */
import { describe, it, expect } from 'vitest';
import { RegistrySchemas } from '../registry-schemas';
import type { RegisteredDeliveryView } from '../registry-contracts';
import type { CodeVersion } from '../trainer-contract';

const sha = 'a'.repeat(64);
const delivered: RegisteredDeliveryView = {
  kind: 'delivered',
  gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
  shipped: 'glm',
  shippedRole: 'simpleBaseline',
  artifact: { fileId: 'F1', storageProviderId: 'P1', providerKey: 'predictive-studio/model-artifacts/k/glm.json', sha256: sha, sizeBytes: 42, writeOnce: true },
};
const codeVersion: CodeVersion = { psGitSha: 'abc', sidecarVersion: '6.2.0', libraryVersions: { numpy: '1.26.4' }, threads: 1, seed: 0 };

describe('RegistrySchemas', () => {
  it('accepts a stored delivery and a no-signal delivery', () => {
    expect(RegistrySchemas.ValidateDelivery(delivered)).toEqual({ Ok: true, Value: delivered });
    const none: RegisteredDeliveryView = { kind: 'no-signal', gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null }, artifact: null };
    expect(RegistrySchemas.ValidateDelivery(none).Ok).toBe(true);
  });

  it('refuses a stored delivery whose artifact hash is not lower-case hex or that carries an unknown key, naming the path', () => {
    const upper: RegisteredDeliveryView = { ...delivered, artifact: { ...delivered.artifact, sha256: 'A'.repeat(64) } };
    const upperResult = RegistrySchemas.ValidateDelivery(upper);
    expect(upperResult.Ok).toBe(false);
    if (upperResult.Ok === false) expect(upperResult.Errors.join(' ')).toContain('artifact.sha256');
    const extra = { ...delivered, shippedAt: '2026-11-11' };
    expect(RegistrySchemas.ValidateDelivery(extra).Ok).toBe(false);
  });

  it('checks a stored code version', () => {
    expect(RegistrySchemas.ValidateCodeVersion(codeVersion)).toEqual({ Ok: true, Value: codeVersion });
    expect(RegistrySchemas.ValidateCodeVersion({ ...codeVersion, threads: 1.5 }).Ok).toBe(false);
  });

  it('parses output semantics through the task-type rules and refuses another key or an invalid task', () => {
    const task = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 };
    expect(RegistrySchemas.ParseOutputSemantics(JSON.stringify({ task }))).toEqual({ Ok: true, Value: { task } });
    expect(RegistrySchemas.ParseOutputSemantics(JSON.stringify({ task, scoredClass: 'Lapsed' }))).toEqual({ Ok: false, Errors: ['OutputSemantics has keys other than "task": scoredClass'] });
    expect(RegistrySchemas.ParseOutputSemantics(JSON.stringify({ task: { ...task, adverseIndex: 2 } }))).toEqual({ Ok: false, Errors: ['binary adverseIndex must be 0 or 1'] });
    expect(RegistrySchemas.ParseOutputSemantics(null).Ok).toBe(false);
  });
});
