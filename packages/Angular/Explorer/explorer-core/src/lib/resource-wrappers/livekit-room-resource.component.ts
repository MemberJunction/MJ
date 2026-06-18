import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

/**
 * LiveKit Room Resource — hosts the MJ-native LiveKit room (`mj-livekit-agent-room`) as an Explorer tab
 * so the realtime room/agent experience can be opened and tested in-app. The optional `ResourceRecordID`
 * is treated as the target AI Agent id; when omitted the binding starts a room and mints a client token.
 *
 * Registered via `@RegisterClass(BaseResourceComponent, 'LiveKitRoomResource')` — surface it by adding a
 * nav item with `DriverClass = 'LiveKitRoomResource'` to an application's `DefaultNavItems`.
 */
@RegisterClass(BaseResourceComponent, 'LiveKitRoomResource')
@Component({
  standalone: false,
  selector: 'mj-livekit-room-resource',
  template: `
    <mj-livekit-agent-room
      class="mj-livekit-room-resource"
      [AgentID]="agentId"
      [Mode]="agentId ? 'agent' : 'agent'"
      [Provider]="ProviderToUse"
      [ShowAgentState]="true"
      [ShowWhiteboard]="true"
      [EnableLayoutSwitcher]="true"
      [EnablePinning]="true"
      (Connected)="NotifyLoadComplete()"
      (ErrorOccurred)="NotifyLoadComplete()"
    ></mj-livekit-agent-room>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .mj-livekit-room-resource {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class LiveKitRoomResource extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
  /** The target AI Agent id (from the resource record), or null to start a default room. */
  public agentId: string | null = null;

  override ngOnInit(): void {
    super.ngOnInit();
    this.agentId = this.Data?.ResourceRecordID ? String(this.Data.ResourceRecordID) : null;
  }

  ngAfterViewInit(): void {
    // Clear the shell loading screen even if connection is slow/unconfigured — the room shows its
    // own connecting/error state, so the loader must not hang on direct URL navigation.
    this.NotifyLoadComplete();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Live Room';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-video';
  }
}
