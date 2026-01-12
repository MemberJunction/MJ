import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

@RegisterClass(BaseDashboard, 'RestaurantDashboard')
@Component({
  selector: 'mj-restaurant-dashboard',
  template: `
    <div class="restaurant-dashboard">
      <div class="restaurant-dashboard__header">
        <div class="dashboard-title">
          <i class="fa-solid fa-utensils dashboard-icon"></i>
          <h1>Foodie Dashboard</h1>
        </div>
        <p class="dashboard-subtitle">Track your culinary adventures</p>
      </div>

      <div class="restaurant-dashboard__content">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .restaurant-dashboard {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: linear-gradient(135deg, #fff5f5 0%, #ffe6e6 100%);
    }

    .restaurant-dashboard__header {
      background: white;
      padding: 24px 32px;
      box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);
      border-bottom: 3px solid #ef4444;
    }

    .dashboard-title {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }

    .dashboard-icon {
      font-size: 32px;
      color: #ef4444;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .dashboard-title h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
      letter-spacing: -0.02em;
    }

    .dashboard-subtitle {
      margin: 0;
      color: #64748b;
      font-size: 14px;
      padding-left: 48px;
    }

    .restaurant-dashboard__content {
      flex: 1;
      overflow: auto;
      padding: 24px;
    }
  `]
})
export class RestaurantDashboardComponent extends BaseDashboard {
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Restaurants";
  }

  protected initDashboard(): void {
    // Dashboard initialization - tabs are loaded dynamically
  }

  protected loadData(): void {
    // Data loading handled by child components
  }
}

export function LoadRestaurantDashboard() {
  // Tree-shaking prevention
}
