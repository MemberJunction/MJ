import { UUIDsEqual } from '@memberjunction/global';
import { ResourceTypeForEntity } from '@memberjunction/ng-shared-generic';

/** True for the dashboards entity, with or without the `MJ: ` prefix. */
export function IsDashboardEntity(entityName: string | null | undefined): boolean {
  return ResourceTypeForEntity(entityName ?? '') === 'dashboard';
}

/** Dashboard ids among a user's favorites, in the favorites' order. Lists each dashboard once. */
export function DashboardFavoriteIds(favorites: ReadonlyArray<{ Entity: string; RecordID: string }>): string[] {
  const ids: string[] = [];
  for (const favorite of favorites) {
    if (IsDashboardEntity(favorite.Entity) && !ids.some(id => UUIDsEqual(id, favorite.RecordID))) {
      ids.push(favorite.RecordID);
    }
  }
  return ids;
}
