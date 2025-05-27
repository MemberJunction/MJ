import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-home-wrapper',
  templateUrl: './home-wrapper.component.html',
  styleUrls: ['./home-wrapper.component.css']
})
@RegisterClass(BaseNavigationComponent, 'Home')
export class HomeWrapperComponent extends BaseNavigationComponent {
}