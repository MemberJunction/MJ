import { describe, it, expect } from 'vitest';
import { ParseDelegationResultJson } from '../lib/services/delegation-result-parser';

describe('ParseDelegationResultJson', () => {
  it('parses a successful result with a runId', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ success: true, output: 'all done', runId: 'run-123' }));
    expect(parsed).toEqual({ Success: true, Output: 'all done', RunID: 'run-123' });
  });

  it('parses a successful result without a runId (RunID undefined)', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ success: true, output: 'all done' }));
    expect(parsed.Success).toBe(true);
    expect(parsed.Output).toBe('all done');
    expect(parsed.RunID).toBeUndefined();
  });

  it('ignores an empty-string runId', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ success: true, output: 'x', runId: '' }));
    expect(parsed.RunID).toBeUndefined();
  });

  it('parses the structured error shape ({success:false, error})', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ success: false, error: 'boom' }));
    expect(parsed).toEqual({ Success: false, Output: 'boom', RunID: undefined });
  });

  it('still carries runId on a failed result that reported one', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ success: false, error: 'boom', runId: 'run-9' }));
    expect(parsed.Success).toBe(false);
    expect(parsed.RunID).toBe('run-9');
  });

  it('treats success as true unless explicitly false', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ output: 'no flag' }));
    expect(parsed.Success).toBe(true);
    expect(parsed.Output).toBe('no flag');
  });

  it('surfaces a non-JSON payload as the raw output (success assumed)', () => {
    const parsed = ParseDelegationResultJson('plain text result');
    expect(parsed).toEqual({ Success: true, Output: 'plain text result' });
  });

  it('prefers output over error when both are present', () => {
    const parsed = ParseDelegationResultJson(JSON.stringify({ success: false, output: 'partial', error: 'late failure' }));
    expect(parsed.Output).toBe('partial');
  });

  describe('artifacts', () => {
    it('parses artifacts into PascalCase entries', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({
        success: true,
        output: 'done',
        runId: 'run-1',
        artifacts: [{ artifactId: 'a-1', artifactVersionId: 'av-1', name: 'Weather Report' }]
      }));
      expect(parsed.Artifacts).toEqual([
        { ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' }
      ]);
    });

    it('leaves Artifacts undefined when the field is absent', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({ success: true, output: 'done' }));
      expect(parsed.Artifacts).toBeUndefined();
    });

    it('leaves Artifacts undefined for an empty array', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({ success: true, output: 'done', artifacts: [] }));
      expect(parsed.Artifacts).toBeUndefined();
    });

    it('leaves Artifacts undefined when the field is not an array', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({ success: true, output: 'done', artifacts: 'nope' }));
      expect(parsed.Artifacts).toBeUndefined();
    });

    it('drops malformed entries (missing ids) and keeps valid ones', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({
        success: true,
        output: 'done',
        artifacts: [
          { artifactId: 'a-1' },                                      // no version id → dropped
          { artifactVersionId: 'av-2' },                              // no artifact id → dropped
          { artifactId: 42, artifactVersionId: 'av-3' },              // non-string id → dropped
          { artifactId: 'a-4', artifactVersionId: 'av-4', name: 'Kept' }
        ]
      }));
      expect(parsed.Artifacts).toEqual([{ ArtifactID: 'a-4', ArtifactVersionID: 'av-4', Name: 'Kept' }]);
    });

    it('falls back to "Artifact" for a missing or blank name', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({
        success: true,
        output: 'done',
        artifacts: [
          { artifactId: 'a-1', artifactVersionId: 'av-1' },
          { artifactId: 'a-2', artifactVersionId: 'av-2', name: '   ' }
        ]
      }));
      expect(parsed.Artifacts?.map(a => a.Name)).toEqual(['Artifact', 'Artifact']);
    });

    it('trims artifact names', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({
        success: true,
        output: 'done',
        artifacts: [{ artifactId: 'a-1', artifactVersionId: 'av-1', name: '  Q3 Summary  ' }]
      }));
      expect(parsed.Artifacts?.[0].Name).toBe('Q3 Summary');
    });

    it('still carries artifacts on a failed result that reported them', () => {
      const parsed = ParseDelegationResultJson(JSON.stringify({
        success: false,
        error: 'partial failure',
        artifacts: [{ artifactId: 'a-1', artifactVersionId: 'av-1', name: 'Partial' }]
      }));
      expect(parsed.Success).toBe(false);
      expect(parsed.Artifacts).toHaveLength(1);
    });
  });
});
