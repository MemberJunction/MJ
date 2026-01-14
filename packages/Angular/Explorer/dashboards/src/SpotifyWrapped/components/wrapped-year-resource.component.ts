import { Component, OnInit, OnDestroy } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * Tree-shaking prevention function
 */
export function LoadSpotifyWrappedYearResource() {
  // Force inclusion in production builds
}

@RegisterClass(BaseResourceComponent, 'SpotifyWrappedYearResource')
@Component({
  selector: 'mj-spotify-wrapped-year-resource',
  template: `
    <div class="wrapped-container">
      <mj-spotify-wrapped-year></mj-spotify-wrapped-year>
    </div>
  `,
  styles: [`
    .wrapped-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 20px;
      box-sizing: border-box;
      background: linear-gradient(135deg, #1db954 0%, #191414 100%);
    }
  `]
})
export class SpotifyWrappedYearResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return '2024 Wrapped';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-star';
  }
}
