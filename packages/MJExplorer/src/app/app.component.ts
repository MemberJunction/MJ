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
  template: `<mj-explorer-app />
    @if (ShowDemo) { <app-onvalidated-demo (Closed)="ShowDemo = false"></app-onvalidated-demo> }
    @else { <button class="ov-launch" (click)="ShowDemo = true">⚡ OnValidated demo</button> }`,
  styles: [`.ov-launch{ position:fixed; right:16px; bottom:16px; z-index:99998; background:#264FAF; color:#fff;
    border:0; padding:10px 14px; border-radius:999px; font-weight:600; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.25); }`]
})
export class AppComponent {
  public ShowDemo = false;
}