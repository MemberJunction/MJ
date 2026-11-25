import type { DependenciesFromHead } from '@memberjunction/open-app-engine';

/** The engine option for the values of `--dependencies-from-head`; undefined when it is not given. */
export function ParseDependenciesFromHead(values: string[] | undefined): DependenciesFromHead | undefined {
  return values?.includes('all') ? 'all' : values;
}
