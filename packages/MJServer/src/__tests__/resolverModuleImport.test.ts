import { describe, it, expect, vi, afterEach } from 'vitest';
import { ImportResolverModules } from '../resolverModuleImport.js';

describe('ImportResolverModules', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns each module in path order', async () => {
    const importer = vi.fn(async (specifier: string) => ({ Name: specifier }));
    const modules = await ImportResolverModules(['/a.js', '/b.js'], false, 'Error loading dynamic module', importer);
    expect(modules).toEqual([{ Name: '/a.js' }, { Name: '/b.js' }]);
  });

  it('prefixes file:// on Windows', async () => {
    const importer = vi.fn(async () => ({}));
    await ImportResolverModules(['C:/r/a.js'], true, 'Error loading dynamic module', importer);
    expect(importer).toHaveBeenCalledWith('file://C:/r/a.js');
  });

  it('logs the failing path when the import rejects, then rethrows (#3741)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('boom');
    const importer = vi.fn(async (specifier: string) => {
      if (specifier === '/bad.js') throw failure;
      return {};
    });

    await expect(
      ImportResolverModules(['/good.js', '/bad.js'], false, 'Error loading dynamic module', importer),
    ).rejects.toBe(failure);
    expect(consoleError).toHaveBeenCalledWith("Error loading dynamic module at '/bad.js'", failure);
  });
});
