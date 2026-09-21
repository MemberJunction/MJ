/**
 * @fileoverview Content hash for a component hierarchy, used as its registry version.
 * @module @memberjunction/react-runtime/utilities
 */

import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Computes a stable version key from every piece of code in a component hierarchy.
 *
 * `ComponentManager` keys its registry on `name + namespace + version + contentHash`. A spec that
 * carries no explicit `version` therefore needs one derived from its content, or two different
 * revisions of the same component name collide in the registry and the first one compiled wins
 * forever.
 *
 * The walk covers the root and every descendant, because a change confined to a child still
 * changes what the root renders.
 *
 * This lives in the runtime rather than in a host because the value must be identical across
 * hosts: an Angular surface and a React Native surface loading the same spec have to agree on its
 * version, or the same component is registered twice under two keys and each host silently gets a
 * different compiled instance.
 *
 * @param spec The root component spec.
 * @returns A short version string of the form `v1a2b3c4d`.
 */
export function generateComponentHierarchyHash(spec: ComponentSpec): string {
  const codeStrings: string[] = [];

  const collectCode = (s: ComponentSpec): void => {
    if (s.code) {
      codeStrings.push(s.code);
    }
    if (s.dependencies) {
      for (const dep of s.dependencies) {
        collectCode(dep);
      }
    }
  };

  collectCode(spec);

  // djb2-style 32-bit rolling hash. Not cryptographic — it only has to change when the code does.
  const fullCode = codeStrings.join('|');
  let hash = 0;
  for (let i = 0; i < fullCode.length; i++) {
    const char = fullCode.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const hexHash = Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
  return `v${hexHash}`;
}
