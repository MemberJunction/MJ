/**
 * MemberJunction Explorer - Application Component
 *
 * MJ 3.0 Minimal App Shell Pattern:
 * Reduced from 158 lines to 12 lines by using @memberjunction/ng-explorer-app
 */

import { Component } from '@angular/core';
import { LoadGeneratedEntities } from 'mj_generatedentities';

LoadGeneratedEntities(); // forces the generated entities library to load up, sometimes tree shaking in the build process can break this, so this is a workaround that ensures it always happens

@Component({
  selector: 'app-root',
  template: '<mj-explorer-app></mj-explorer-app>'
})
export class AppComponent {}