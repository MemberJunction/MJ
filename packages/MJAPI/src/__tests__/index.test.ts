import { describe, it, expect, vi } from 'vitest';

// MJAPI's index.ts is a startup script: it imports the generated registration
// modules and calls createMJServer. Mock the boundaries so importing the REAL
// entry exercises its import graph without starting a server or touching a DB.

const createMJServerMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@memberjunction/server-bootstrap', () => ({
  createMJServer: createMJServerMock,
}));

vi.mock('mj_generatedentities', () => ({}));
vi.mock('mj_generatedactions', () => ({}));
vi.mock('@memberjunction/server-bootstrap/mj-class-registrations', () => ({}));
vi.mock('../generated/class-registrations-manifest.js', () => ({}));

describe('mj_api entry point', () => {
  it('imports cleanly and boots via createMJServer with resolver paths', async () => {
    await import('../index');

    expect(createMJServerMock).toHaveBeenCalledTimes(1);
    const options = createMJServerMock.mock.calls[0][0] as { resolverPaths: string[] };
    expect(Array.isArray(options.resolverPaths)).toBe(true);
    expect(options.resolverPaths.length).toBeGreaterThan(0);
    expect(options.resolverPaths[0]).toContain('generated');
  });
});
