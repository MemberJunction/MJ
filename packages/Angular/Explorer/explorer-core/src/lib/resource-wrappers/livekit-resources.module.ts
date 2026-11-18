import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogComponent } from '@memberjunction/ng-ui-components';
import { MJConversationOffersComponent } from '@memberjunction/ng-conversation-offers';
import {
  MJLiveKitRoomComponent,
  MJMeetingListComponent,
  MJMeetingScheduleFormComponent,
  MJMeetingLobbyComponent,
} from '@memberjunction/ng-mj-livekit-room';

import { LiveKitRoomResource } from './livekit-room-resource.component';
import { HumanHandoffConsoleResource } from './human-handoff-console-resource.component';
import { MeetingsResource } from './meetings-resource.component';

/**
 * Lazy-loaded module containing the LiveKit room, human-handoff console, and
 * meetings resource wrappers so `livekit-client` (~6 MB) stays out of the
 * initial Explorer shell bundle until a realtime/meetings tab is opened.
 */
@NgModule({
  declarations: [
    LiveKitRoomResource,
    HumanHandoffConsoleResource,
    MeetingsResource,
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJDialogComponent,
    MJConversationOffersComponent,
    MJLiveKitRoomComponent,
    MJMeetingListComponent,
    MJMeetingScheduleFormComponent,
    MJMeetingLobbyComponent,
  ],
  exports: [
    LiveKitRoomResource,
    HumanHandoffConsoleResource,
    MeetingsResource,
  ],
})
export class LiveKitResourcesModule {}

export { LiveKitRoomResource } from './livekit-room-resource.component';
export { HumanHandoffConsoleResource } from './human-handoff-console-resource.component';
export { MeetingsResource } from './meetings-resource.component';
