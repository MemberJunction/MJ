import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'RSUDashboard')
@Component({
  standalone: false,
  selector: 'mj-rsu-dashboard',
  templateUrl: './rsu-dashboard.component.html',
  styleUrls: ['./rsu-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RSUDashboardComponent extends BaseResourceComponent {
  private cdr = inject(ChangeDetectorRef);

  ActiveTab: 'create' | 'history' | 'status' = 'create';

  OnTabChange(tab: 'create' | 'history' | 'status'): void {
    this.ActiveTab = tab;
    this.cdr.markForCheck();
  }
}

export function LoadRSUDashboard() {
  // tree-shaking prevention
}
