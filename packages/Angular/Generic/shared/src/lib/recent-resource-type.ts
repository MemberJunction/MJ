export type RecentResourceType = 'record' | 'view' | 'dashboard' | 'artifact' | 'report';

/**
 * Resource type for an entity name in the recents list. Accepts the `MJ: ` prefix and the legacy
 * unprefixed names.
 */
export function ResourceTypeForEntity(entityName: string): RecentResourceType {
  const normalized = (entityName || '').trim().toLowerCase().replace(/^mj:\s*/, '');
  if (normalized === 'user views') return 'view';
  if (normalized === 'dashboards') return 'dashboard';
  if (normalized === 'conversation artifacts') return 'artifact';
  if (normalized === 'reports') return 'report';
  return 'record';
}
