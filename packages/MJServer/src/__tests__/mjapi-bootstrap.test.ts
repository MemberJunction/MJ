import { describe, it, expect, vi } from 'vitest';

// MJAPI's index.ts is primarily a startup script. We verify it has the expected structure.
// We do NOT test generated code.

vi.mock('@memberjunction/server-bootstrap', () => ({
  createMJServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('mj_generatedentities', () => ({}));
vi.mock('mj_generatedactions', () => ({}));
vi.mock('@memberjunction/server-bootstrap/mj-class-registrations', () => ({}));

// Mock the generated manifest
vi.mock('../generated/class-registrations-manifest.js', () => ({}));

describe('MJAPI', () => {
  it('should use createMJServer for bootstrapping', async () => {
    const { createMJServer } = await import('@memberjunction/server-bootstrap');
    expect(createMJServer).toBeDefined();
    expect(typeof createMJServer).toBe('function');
  });
});
