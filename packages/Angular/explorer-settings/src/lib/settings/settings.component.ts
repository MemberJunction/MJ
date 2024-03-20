import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'mj-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  public currentItem: 'EntityPermissions' | 'Users' | 'Roles' | 'Role' = 'EntityPermissions';
  public baseRoute: string = '/settings';

  public selectedRoleName: string = '';

  public selectItem(item: 'EntityPermissions' | 'Users' | 'Roles' | 'Role', changeRoute: boolean = true) {
    this.currentItem = item;
    if (changeRoute)
        this.changeRoute(item.toLowerCase());
  }

  changeRoute(subPath: string) {
    // Constructs a navigation path relative to the /settings base route
    this.router.navigate([this.baseRoute, subPath]);
  }
  
  constructor(private router: Router, private activatedRoute: ActivatedRoute) { }
 

  ngOnInit() {
    // manually update the first time
    this.updateComponentStateBasedOnPath();

    // Listen to changes in the route
    this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        this.updateComponentStateBasedOnPath();
      });

//     this.activatedRoute.url.subscribe(urlSegments => {
//       const fullPath = window.location.pathname + window.location.search;
  
//       // Split the fullPath into segments and query string as needed
//       const [path, queryString] = fullPath.split('?');
//       const segments = path.split('/').filter(segment => segment.length > 0);
  
//       // Your logic to handle the segments and query string
//       const firstSegment = segments.length > 1 ? segments[1] : '';
//         switch (firstSegment.trim().toLowerCase()) {
//         case 'entitypermissions':
//           this.selectItem('EntityPermissions', false);
//           break;
//         case 'users':
//           this.selectItem('Users', false);
//           break;
//         case 'roles':
//             this.selectItem('Roles', false);
//             break;
//         case 'role':
//             this.selectedRoleName = segments.length > 2 ? segments[2] : '';
//             this.selectItem('Role', false);
//             break;
//         default:
//           break;
//       }
//     });
   }

  updateComponentStateBasedOnPath() {
    // On each navigation end, access the current URL from window.location
    const fullPath = window.location.pathname + window.location.search;

    // Split the fullPath into segments and query string as needed
    const [path, queryString] = fullPath.split('?');
    const segments = path.split('/').filter(segment => segment.length > 0);

    
    // Place your switch-case logic here
    const firstSegment = segments.length > 1 ? segments[1] : '';
    switch (firstSegment.trim().toLowerCase()) {
      case 'entitypermissions':
        this.selectItem('EntityPermissions', false);
        break;
      case 'users':
        this.selectItem('Users', false);
        break;
      case 'roles':
          this.selectItem('Roles', false);
          break;
      case 'role':
          this.selectedRoleName = segments.length > 2 ? segments[2] : '';
          this.selectItem('Role', false);
          break;
      default:
        break;
    }
  }
}
