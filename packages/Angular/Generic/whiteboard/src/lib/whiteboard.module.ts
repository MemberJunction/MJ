import { NgModule } from '@angular/core';
import { RealtimeWhiteboardBoardComponent } from './whiteboard-board.component';
import { RealtimeWhiteboardToolbarComponent } from './whiteboard-toolbar.component';
import { RealtimeWhiteboardZoomComponent } from './whiteboard-zoom.component';
import { RealtimeWhiteboardPagesComponent } from './whiteboard-pages.component';
import { RealtimeWhiteboardAgentSeesPopoverComponent } from './whiteboard-agent-sees-popover.component';
import { RealtimeWhiteboardHostComponent } from './whiteboard-host.component';
import { WhiteboardSnapshotComponent } from './whiteboard-snapshot.component';

/**
 * Convenience NgModule that re-exports every standalone whiteboard component, for
 * consumers organized around NgModules. All components in this package are STANDALONE —
 * apps using standalone bootstrapping can import the component classes directly and skip
 * this module entirely.
 */
@NgModule({
  imports: [
    RealtimeWhiteboardBoardComponent,
    RealtimeWhiteboardToolbarComponent,
    RealtimeWhiteboardZoomComponent,
    RealtimeWhiteboardPagesComponent,
    RealtimeWhiteboardAgentSeesPopoverComponent,
    RealtimeWhiteboardHostComponent,
    WhiteboardSnapshotComponent
  ],
  exports: [
    RealtimeWhiteboardBoardComponent,
    RealtimeWhiteboardToolbarComponent,
    RealtimeWhiteboardZoomComponent,
    RealtimeWhiteboardPagesComponent,
    RealtimeWhiteboardAgentSeesPopoverComponent,
    RealtimeWhiteboardHostComponent,
    WhiteboardSnapshotComponent
  ]
})
export class WhiteboardModule {}

/**
 * Tree-shaking prevention hook. The whiteboard components are usually referenced
 * statically (standalone `imports` arrays), which is enough to retain them — call this
 * from your bootstrap path only when every usage in your app is resolved DYNAMICALLY
 * (e.g. a plugin returns a component type through the MJ ClassFactory) and the bundler
 * would otherwise see no static reference to this package.
 */
export function LoadWhiteboardComponents(): void {
  // intentional no-op — referencing this module creates the static code path
}
