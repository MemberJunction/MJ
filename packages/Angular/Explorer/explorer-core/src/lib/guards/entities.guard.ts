import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import {EntityPermissionType, Metadata} from "@memberjunction/core";
  
export function checkUserEntityPermissions(type: EntityPermissionType): (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any {
    return (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
      const md = new Metadata();
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
  