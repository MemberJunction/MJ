import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingFleetResource() {
  // Force inclusion in production builds
}

/**
 * Biking Fleet Resource - Manage your bike fleet and equipment
 */
@RegisterClass(BaseResourceComponent, 'BikingFleetResource')
@Component({
  selector: 'mj-biking-fleet-resource',
  template: `
    <div class="resource-container">
      <div class="placeholder-content">
        <i class="fa-solid fa-bicycle placeholder-icon"></i>
        <h2>Fleet</h2>
        <p>Manage your bike fleet, track maintenance schedules, and monitor equipment status.</p>
      </div>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
    }
    .placeholder-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 2rem;
      text-align: center;
      color: #64748b;
    }
    .placeholder-icon {
      font-size: 4rem;
      color: #059669;
      margin-bottom: 1rem;
    }
    .placeholder-content h2 {
      margin: 0 0 0.5rem 0;
      color: #1e293b;
      font-size: 1.5rem;
    }
    .placeholder-content p {
      margin: 0;
      max-width: 400px;
    }
  `]
})
export class BikingFleetResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Fleet';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-bicycle';
  }
}
