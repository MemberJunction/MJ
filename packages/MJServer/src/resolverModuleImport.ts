/** Loads one resolver module by specifier. Injectable so the failure path can be tested. */
export type ResolverModuleImporter = (specifier: string) => Promise<Record<string, unknown>>;

const defaultImporter: ResolverModuleImporter = (specifier) => import(specifier) as Promise<Record<string, unknown>>;

/**
 * Imports every globbed resolver file. Each import is awaited inside its own try/catch, so a
 * failing module logs which path failed before the rejection propagates (#3741). A synchronous
 * try/catch around `import()` cannot catch its rejection.
 */
export async function ImportResolverModules(
  modulePaths: string[],
  isWindows: boolean,
  failureLabel: string,
  importModule: ResolverModuleImporter = defaultImporter,
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    modulePaths.map(async (modulePath) => {
      try {
        return await importModule(isWindows ? `file://${modulePath}` : modulePath);
      } catch (e) {
        console.error(`${failureLabel} at '${modulePath}'`, e);
        throw e;
      }
    }),
  );
}
