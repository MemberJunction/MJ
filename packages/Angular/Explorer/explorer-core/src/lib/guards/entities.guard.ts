import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import {EntityPermissionType, Metadata, IMetadataProvider} from "@memberjunction/core";

/**
 * Module-level provider for the route guard. Set via `setEntitiesGuardProvider()`
 * from app-init / shell. Falls back to `Metadata.Provider` when not set, which
 * is fine for single-provider apps — guards are constructed by Angular DI and
 * don't have a natural per-component provider context.
 */
let _guardProvider: IMetadataProvider | null = null;

export function SetEntitiesGuardProvider(p: IMetadataProvider): void {
  _guardProvider = p;
}

/** @deprecated Use {@link SetEntitiesGuardProvider}. */
export function setEntitiesGuardProvider(p: IMetadataProvider): void {
  return SetEntitiesGuardProvider(p);
}

function getGuardProvider(): IMetadataProvider {
  return _guardProvider ?? Metadata.Provider;
}

export function CheckUserEntityPermissions(type: EntityPermissionType): (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any {
    return (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
      const md = getGuardProvider();
      const appName = route.params['appName'];
      const entityName = route.params['entityName'];
  
      if (md && md.Entities) {
        const entity = md.Entities.find(e => {
          return e.Name === entityName 
        });
    
        const permissions = entity?.GetUserPermisions(md.CurrentUser);
    
        if (permissions) {
          let bAllowed: boolean = false;
          switch (type) {
            case EntityPermissionType.Create:
              bAllowed = permissions.CanCreate;
              break;
            case EntityPermissionType.Read:
              bAllowed = permissions.CanRead;
              break;
            case EntityPermissionType.Update:
              bAllowed = permissions.CanUpdate;
              break;
            case EntityPermissionType.Delete:
              bAllowed = permissions.CanDelete;
              break;
          }
          return bAllowed
        }
        else {
          return false;
        }
      }
      else {
        return false; // entity metadata not loaded yet
      }
    }
  }

/** @deprecated Use {@link CheckUserEntityPermissions}. */
export function checkUserEntityPermissions(type: EntityPermissionType): (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any {
  return CheckUserEntityPermissions(type);
}
  