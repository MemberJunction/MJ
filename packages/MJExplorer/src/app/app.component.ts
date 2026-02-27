/**
 * MemberJunction Explorer - Application Component
 *
 * MJ 3.0 Minimal App Shell Pattern:
 * Reduced from 158 lines to 12 lines by using @memberjunction/ng-explorer-app
 */

import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-root',
  template: '<mj-explorer-app />'
})
export class AppComponent {}