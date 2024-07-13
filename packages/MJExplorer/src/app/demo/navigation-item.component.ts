import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-fun-demo',
  template: '<div>Fun Demo!!!</div>'
})
@RegisterClass(BaseNavigationComponent, 'Fun')
export class NavigationItemDemoComponent extends BaseNavigationComponent {
  constructor() {
    super();
  }
}
