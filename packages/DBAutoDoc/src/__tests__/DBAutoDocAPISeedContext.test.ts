import { describe, it, expect, vi } from 'vitest';
import { DBAutoDocConfig } from '../types/config.js';

/**
 * DBAutoDocAPI accepted a seedContext but buildFullConfig never copied it into the config it hands
 * the orchestrator, so programmatic callers got no seed context in any prompt.
 */

const captured = vi.hoisted(() => ({ configs: [] as DBAutoDocConfig[] }));

vi.mock('../core/AnalysisOrchestrator.js', () => ({
  AnalysisOrchestrator: class {
    constructor(options: { config: DBAutoDocConfig }) {
      captured.configs.push(options.config);
    }
    async execute() {
      return { success: false, errorMessage: 'not run in this test' };
    }
  },
}));

import { DBAutoDocAPI } from '../api/DBAutoDocAPI.js';

describe('DBAutoDocAPI seed context', () => {
  it('passes seedContext, including keyPassMaxChars, to the analysis', async () => {
    const seedContext = { overallPurpose: 'Membership', customInstructions: 'dues.dues_mbr_key references member.mbr_key', keyPassMaxChars: 2000 };
    await new DBAutoDocAPI().Analyze({
      database: { provider: 'sqlserver', server: 'localhost', database: 'unused', user: 'u', password: 'p' },
      ai: { provider: 'gemini', model: 'm', apiKey: 'k' },
      seedContext,
    });
    expect(captured.configs.at(-1)?.seedContext).toEqual(seedContext);
  });
});
