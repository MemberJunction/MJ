/**
 * MemberJunction 3.0 Bootstrap Component
 *
 * Minimal placeholder component for future fully encapsulated bootstrap.
 * Currently applications should use MJInitializationService directly in their app.component.
 */

import { Component, Inject, OnInit } from '@angular/core';
import { SetProductionStatus } from '@memberjunction/core';
import { MJEnvironmentConfig, MJ_ENVIRONMENT } from './bootstrap.types';

@Component({
  standalone: false,
  selector: 'mj-bootstrap',
  template: `
    <div class="mj-bootstrap-container">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .mj-bootstrap-container {
      display: block;
      width: 100%;
      height: 100%;
    }
  `]
})
export class MJBootstrapComponent implements OnInit {
  constructor(
    @Inject(MJ_ENVIRONMENT) private environment: MJEnvironmentConfig
  ) {}

  ngOnInit() {
    console.log('🚀 MemberJunction 3.0 Bootstrap');
    SetProductionStatus(this.environment.production);
  }
}
