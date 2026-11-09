/**
 * The Meet landing's preview-room card: shown to holders of `Realtime: Advanced Session Controls`, it opens the meeting
 * room in preview mode, and leaving that room comes back to the landing.
 *
 * The meeting room and the invite dialog are replaced with stubs that take the same inputs, so these tests assert the
 * resource's landing and what it hands the room, not the room itself.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
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

/**
 * The pre-join voice list: one option per persona, so two personas sharing a voice id (Puck, and Ben: Puck's voice with
 * a face) are two options, only the picked one shows picked, and either hands the room the voice id.
 */
describe('LiveKitRoomResource: the pre-join voice list (DOM)', () => {
  const MODELS: RealtimeModelVoices[] = [
    {
      ModelID: 'model-a',
      ModelName: 'Live Voice Model',
      Voices: [
        { ID: 'Puck', Name: 'Puck', PersonaID: 'p-puck' },
        { ID: 'Puck', Name: 'Ben', PersonaID: 'p-ben', AvatarID: 'Ben' },
        { ID: 'Kore', Name: 'Kore' },
      ],
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The pre-join picker, as once the agents and models are loaded, with a voice model chosen. */
  const picking = (): ComponentFixture<LiveKitRoomResource> => {
    vi.spyOn(LiveKitRoomResource.prototype, 'ngOnInit').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      declarations: [LiveKitRoomResource],
      imports: [StubAgentRoom, StubDialog],
      providers: [{ provide: NavigationService, useValue: {} }],
    });
    const f = TestBed.createComponent(LiveKitRoomResource);
    f.componentInstance.Phase = 'picking';
    f.componentInstance.CanPickModelVoice = true;
    f.componentInstance.RealtimeModels = MODELS;
    f.componentInstance.SelectedModelId = 'model-a';
    f.detectChanges();
    return f;
  };
  const voiceSelect = (f: ComponentFixture<LiveKitRoomResource>) => f.nativeElement.querySelector('#mj-lk-voice') as HTMLSelectElement;
  /** Picks the option at `index` (0 is "Default voice") the way the browser does. */
  const pick = (f: ComponentFixture<LiveKitRoomResource>, index: number) => {
    const select = voiceSelect(f);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    f.detectChanges();
  };
  const picked = (f: ComponentFixture<LiveKitRoomResource>) =>
    Array.from(voiceSelect(f).options).filter((o) => o.selected).map((o) => o.textContent?.trim());
  const room = (f: ComponentFixture<LiveKitRoomResource>): StubAgentRoom | null =>
    f.debugElement.query(By.directive(StubAgentRoom))?.componentInstance ?? null;

  it('lists two personas that share a voice id as two options, with no duplicate keys', () => {
    const warn = vi.spyOn(console, 'warn');
    const f = picking();
    expect(Array.from(voiceSelect(f).options).map((o) => o.textContent?.trim())).toEqual(['Default voice', 'Puck', 'Ben', 'Kore']);
    // Angular checks the keys when it updates a drawn list, not when it first draws one: check the list again.
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    expect(warn.mock.calls.some((call) => String(call[0]).includes('NG0955'))).toBe(false);
  });

  it('shows only the picked option as picked, and hands the room the voice id', () => {
    const f = picking();
    pick(f, 2);
    expect(picked(f)).toEqual(['Ben']);
    pick(f, 1);
    expect(picked(f)).toEqual(['Puck']);

    // Drawn again (back to the landing and in again), the list still shows the picked persona, not every match of its id.
    for (const phase of ['landing', 'picking'] as const) {
      f.componentInstance.Phase = phase;
      f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
      f.detectChanges();
    }
    expect(picked(f)).toEqual(['Puck']);

    pick(f, 2);
    expect(f.componentInstance.SelectedVoice).toBe('Puck');

    f.componentInstance.Phase = 'live';
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    expect(room(f)?.RealtimeVoice).toBe('Puck');
  });
});
