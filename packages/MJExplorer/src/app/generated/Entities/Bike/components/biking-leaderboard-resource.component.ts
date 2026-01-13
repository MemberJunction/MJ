import { Component, OnInit, OnDestroy } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingLeaderboardResource() {
  // Force inclusion in production builds
}

/**
 * Biking Leaderboard Resource - View rankings and achievements
 */
@RegisterClass(BaseResourceComponent, 'BikingLeaderboardResource')
@Component({
  selector: 'mj-biking-leaderboard-resource',
  template: `
    <div class="resource-container">
      <div class="placeholder-content">
        <i class="fa-solid fa-trophy placeholder-icon"></i>
        <h2>Leaderboard</h2>
        <p>View rider rankings, compete with others, and track your achievements.</p>
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
export class BikingLeaderboardResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Leaderboard';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-trophy';
  }
}
