import { Component, OnInit, OnDestroy } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * Tree-shaking prevention function
 */
export function LoadMusicReflectionResource() {
  // Force inclusion in production builds
}

@RegisterClass(BaseResourceComponent, 'MusicReflectionResource')
@Component({
  selector: 'mj-music-reflection-resource',
  template: `
    <div class="reflection-container">
      <mj-music-reflection></mj-music-reflection>
    </div>
  `,
  styles: [`
    .reflection-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      background: #121212;
    }
  `]
})
export class MusicReflectionResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Music Reflection';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-book-heart';
  }
}
