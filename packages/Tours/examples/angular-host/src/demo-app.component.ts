import { ChangeDetectionStrategy, Component, ViewChild } from '@angular/core';
import {
  MJ_TOUR_DEFINITION_SOURCE,
  MJ_TOUR_HOST,
  MJ_TOUR_PROGRESS_STORE,
  MJTourAnchorDirective,
  MJTourHostComponent,
} from '@memberjunction/ng-tours';
import { InlineTourSource, MemoryProgressStore } from '@memberjunction/tours-runtime';
import { DemoAngularTourHost } from './demo-tour-host';
import { SAMPLE_ANGULAR_HOST_TOUR } from './sample-tour';

@Component({
  selector: 'demo-angular-tour-app',
  standalone: true,
  imports: [MJTourHostComponent, MJTourAnchorDirective],
  providers: [
    DemoAngularTourHost,
    { provide: MJ_TOUR_HOST, useExisting: DemoAngularTourHost },
    {
      provide: MJ_TOUR_DEFINITION_SOURCE,
      useFactory: () => new InlineTourSource([SAMPLE_ANGULAR_HOST_TOUR]),
    },
    {
      provide: MJ_TOUR_PROGRESS_STORE,
      useFactory: () => new MemoryProgressStore(),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="padding: 24px; display: grid; gap: 16px; max-width: 640px;">
      <header style="display: flex; justify-content: space-between; align-items: center;">
        <h1>Standalone Angular Host</h1>
        <button type="button" (click)="StartTour()">Launch Tour</button>
      </header>

      <div style="display: flex; gap: 12px; align-items: center;">
        <button type="button" mjTourAnchor="demo.workspace.create-btn">Create Project</button>
        <input
          type="text"
          mjTourAnchor="demo.workspace.name-input"
          placeholder="Workspace name"
          aria-label="Workspace name"
        />
      </div>

      <mj-tour-host #tourHost [Definitions]="tours" />
    </main>
  `,
})
export class DemoAngularTourAppComponent {
  @ViewChild('tourHost') private tourHost?: MJTourHostComponent;
  protected readonly tours = [SAMPLE_ANGULAR_HOST_TOUR];

  public StartTour(): void {
    void this.tourHost?.Start(SAMPLE_ANGULAR_HOST_TOUR.TourKey);
  }
}
