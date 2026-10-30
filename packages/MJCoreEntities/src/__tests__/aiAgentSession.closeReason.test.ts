/**
 * Pins the generated `MJ: AI Agent Sessions` CloseReason union (#6182 item 2). CodeGen builds it
 * from the table's CHECK constraint; if a migration and CodeGen drift apart, the janitor would
 * stamp a reason the generated entity rejects.
 */
import { describe, it, expect } from 'vitest';
import { MJAIAgentSessionSchema } from '../generated/entities/__mj.js';

const CLOSE_REASONS = ['Error', 'Explicit', 'Idle', 'Janitor', 'Shutdown', 'TimeLimit'] as const;
const shape = MJAIAgentSessionSchema.shape;

describe('MJ: AI Agent Sessions CloseReason', () => {
  it.each(CLOSE_REASONS)('accepts %s', (reason) => {
    expect(shape.CloseReason.safeParse(reason).success).toBe(true);
  });

  it('accepts null (an open session has no reason)', () => {
    expect(shape.CloseReason.safeParse(null).success).toBe(true);
  });

  it('rejects a reason outside the union', () => {
    expect(shape.CloseReason.safeParse('Nope').success).toBe(false);
  });
});
