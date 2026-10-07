/**
 * The Meet landing's preview-room card: shown to holders of `Realtime: Advanced Session Controls`, it opens the meeting
 * room in preview mode, and leaving that room comes back to the landing.
 *
 * The meeting room and the invite dialog are replaced with stubs that take the same inputs, so these tests assert the
 * resource's landing and what it hands the room, not the room itself.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeModelVoices } from '@memberjunction/graphql-dataprovider';
import type { MJLiveKitConnectionMode, TurnAddressingChoice, TurnModeChoice } from '@memberjunction/ng-mj-livekit-room';
import { NavigationService } from '@memberjunction/ng-shared';
import { LiveKitRoomResource } from './livekit-room-resource.component';

@Component({ selector: 'mj-livekit-agent-room', standalone: true, template: '' })
class StubAgentRoom {
  @Input() Mode: MJLiveKitConnectionMode = 'agent';
  @Input() RoomName: string | null = null;
  @Input() AgentID: string | null = null;
  @Input() TargetAgentID: string | null = null;
  @Input() AgentName: string | null = null;
  @Input() AvailableAgents: { ID: string; Name: string }[] = [];
  @Input() RealtimeModelID: string | null = null;
  @Input() RealtimeVoice: string | null = null;
  @Input() CanPickModelVoice = false;
  @Input() AvailableModels: RealtimeModelVoices[] = [];
  @Input() Provider: IMetadataProvider | null = null;
  @Input() ShowAgentState = false;
  @Input() ShowWhiteboard = false;
  @Input() EnableLayoutSwitcher = false;
  @Input() EnablePinning = false;
  @Input() TurnMode: TurnModeChoice | null = null;
  @Input() TurnAddressing: TurnAddressingChoice | null = null;
  @Output() Connected = new EventEmitter<void>();
  @Output() Disconnected = new EventEmitter<void>();
  @Output() ErrorOccurred = new EventEmitter<void>();
  @Output() InvitePeopleRequested = new EventEmitter<string | null>();
}

@Component({ selector: 'mj-dialog', standalone: true, template: '<ng-content></ng-content>' })
class StubDialog {
  @Input() Visible = false;
  @Input() Title = '';
  @Input() Size = '';
  @Input() Width = 0;
  @Output() Close = new EventEmitter<void>();
}

describe('LiveKitRoomResource: the preview room card (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The Meet landing, as once the agents are resolved; whether the user holds the advanced session controls as given. */
  const landing = (holdsAdvancedControls: boolean): ComponentFixture<LiveKitRoomResource> => {
    // Resolving the agents needs the AI engine; these tests start from the landing it leads to.
    vi.spyOn(LiveKitRoomResource.prototype, 'ngOnInit').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      declarations: [LiveKitRoomResource],
      imports: [StubAgentRoom, StubDialog],
      providers: [{ provide: NavigationService, useValue: {} }],
    });
    const f = TestBed.createComponent(LiveKitRoomResource);
    f.componentInstance.Phase = 'landing';
    f.componentInstance.CanPickModelVoice = holdsAdvancedControls;
    f.detectChanges();
    return f;
  };
  const titles = (f: ComponentFixture<LiveKitRoomResource>): string[] =>
    Array.from<Element>(f.nativeElement.querySelectorAll('.mj-lk-card__t')).map((t) => t.firstChild?.textContent?.trim() ?? '');
  const room = (f: ComponentFixture<LiveKitRoomResource>): StubAgentRoom | null =>
    f.debugElement.query(By.directive(StubAgentRoom))?.componentInstance ?? null;

  it('shows the preview room card to holders of the advanced session controls', () => {
    expect(titles(landing(true))).toEqual(['New room', 'Join existing', 'History', 'Preview room']);
  });

  it('shows no preview room card to anyone else', () => {
    expect(titles(landing(false))).toEqual(['New room', 'Join existing', 'History']);
  });

  it('opens the meeting room in preview mode, and leaving it comes back to the landing', () => {
    const f = landing(true);
    (f.nativeElement.querySelector('.mj-lk-card--preview') as HTMLButtonElement).click();
    f.detectChanges();
    expect(room(f)?.Mode).toBe('preview');

    f.componentInstance.OnRoomLeft();
    f.detectChanges();
    expect(room(f)).toBeNull();
    expect(f.componentInstance.RoomMode).toBe('agent');
    expect(titles(f)).toContain('Preview room');
  });
});
