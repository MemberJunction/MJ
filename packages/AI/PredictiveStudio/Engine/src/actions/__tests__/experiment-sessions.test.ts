import { describe, it, expect } from 'vitest';
import { ExperimentSessions } from '@memberjunction/predictive-studio-core';
import { ExperimentSessionsUnavailableError } from '../run-experiment.deps';

describe('ExperimentSessions', () => {
  it('is switched off with one reason the UI and the error share', () => {
    expect(ExperimentSessions.Enabled).toBe(false);
    expect(new ExperimentSessionsUnavailableError().message).toBe(ExperimentSessions.DisabledReason);
  });
});
