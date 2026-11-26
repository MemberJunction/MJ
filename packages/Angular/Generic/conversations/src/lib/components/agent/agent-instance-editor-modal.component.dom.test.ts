import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProviderBase } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
  MJAIAgentEntity,
  MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride,
  MJAIAgentUserPolicyEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';

const COS_ID = '11111111-0000-4000-8000-000000000001';
const RESEARCH_ID = '11111111-0000-4000-8000-000000000002';
const PEPPER_ID = '11111111-0000-4000-8000-000000000003';
const SALES_DEPT_ID = '11111111-0000-4000-8000-000000000004';
const AGENT_TYPE_ID = '33333333-0000-4000-8000-000000000001';
const SAGE_PERSONA_ID = '44444444-0000-4000-8000-000000000001';
const ONYX_PERSONA_ID = '44444444-0000-4000-8000-000000000002';
const CORAL_PERSONA_ID = '44444444-0000-4000-8000-000000000003';
const VERSE_PERSONA_ID = '44444444-0000-4000-8000-000000000004';
const ALICE_ID = '22222222-0000-4000-8000-000000000001';
const GENERATE_IMAGE_ACTION_ID = '048FF309-C2CD-44D8-8A8E-8C771ADA8284';

interface StubAgent {
  ID: string;
  Name: string;
  Description: string | null;
  BaseAgentID: string | null;
  OwnerUserID: string | null;
  TypeID: string;
  InstantiationMode: MJAIAgentEntity['InstantiationMode'];
  IsPrimaryInstance: boolean;
  IconClass: string | null;
  LogoURL: string | null;
  AdditionalInstructions: string | null;
  TypeConfiguration: string | null;
  Status: MJAIAgentEntity['Status'];
}

interface StubPersona {
  ID: string;
  Name: string;
  Description: string | null;
  IsActive: boolean;
  PreviewImageURL: string | null;
}

interface StubResolvedPersona {
  Persona: StubPersona;
  Tone: string | null;
  SpeakingStyle: string | null;
}

interface CapturedRunActionCall {
  actionId: string;
  params: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>;
}

interface MockActionResult {
  Success: boolean;
  Message: string;
  Result: object | null;
  LogEntry: null;
  Params: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>;
  RunParams: null;
}

const mockState = {
  instantiable: [] as StubAgent[],
  derived: [] as StubAgent[],
  personas: [] as StubPersona[],
  byId: new Map<string, StubAgent>(),
  resolvedPersonaByAgentId: new Map<string, StubResolvedPersona>(),
  resolvedPolicyMode: null as MJAIAgentUserPolicyEntity['CoordinationMode'] | null,
  savedAgents: [] as StubAgent[],
  savedPersonas: [] as Array<{
    AgentID: string;
    PersonaID: string;
    StyleOverrideObject: MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride | null;
  }>,
  savedPolicies: [] as Array<{
    AgentID: string;
    UserID: string;
    DisplayNameOverride: string | null;
    CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'];
  }>,
  runActionCalls: [] as CapturedRunActionCall[],
  runActionQueue: [] as MockActionResult[],
  notifications: [] as Array<{ message: string; style: string; duration?: number }>,
};

const mockEngine = {
  Config: vi.fn(async () => true),
  get Personas(): StubPersona[] {
    return mockState.personas;
  },
  GetInstantiableAgents: vi.fn(() => mockState.instantiable),
  GetUserDerivedAgents: vi.fn(() => mockState.derived),
  GetAgentByID: vi.fn((id: string) => mockState.byId.get(id.toLowerCase())),
  GetRootAgent: vi.fn((id: string) => {
    let cur = mockState.byId.get(id.toLowerCase());
    while (cur?.BaseAgentID) {
      const parent = mockState.byId.get(cur.BaseAgentID.toLowerCase());
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }),
  ResolveEffectiveAgentProperties: vi.fn((agent: StubAgent) => ({
    TypeID: agent.TypeID,
  })),
  ResolveAgentPersona: vi.fn(
    (agentId: string) => mockState.resolvedPersonaByAgentId.get(agentId.toLowerCase()) ?? null
  ),
};

const mockPolicyEngine = {
  ResolvePolicyForAgentAndUser: vi.fn(async () =>
    mockState.resolvedPolicyMode
      ? {
          status: 'found' as const,
          policy: {
            ID: '55555555-0000-4000-8000-000000000001',
            CoordinationMode: mockState.resolvedPolicyMode,
          },
        }
      : { status: 'not-found' as const, policy: null }
  ),
  SetCachedPolicy: vi.fn(),
};

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: {
    GetProviderInstance: () => mockEngine,
    get Instance() {
      return mockEngine;
    },
  },
}));

vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/ai-core-plus')>();
  return {
    ...actual,
    AgentUserPolicyEngine: {
      get Instance() {
        return mockPolicyEngine;
      },
    },
  };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
  GraphQLActionClient: class {
    public async RunAction(
      actionId: string,
      params?: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>
    ): Promise<MockActionResult> {
      mockState.runActionCalls.push({ actionId, params: params ?? [] });
      const next = mockState.runActionQueue.shift();
      if (next) {
        return next;
      }
      return {
        Success: true,
        Message: 'OK',
        Result: [],
        LogEntry: null,
        Params: params ?? [],
        RunParams: null,
      };
    }
  },
}));

vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: {
    get Instance() {
      return {
        CreateSimpleNotification: vi.fn((message: string, style: string, duration?: number) => {
          mockState.notifications.push({ message, style, duration });
        }),
      };
    },
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: {
      FromMetadataProvider: () => ({
        RunView: vi.fn(async (params: { EntityName?: string }) => {
          if (params?.EntityName === 'MJ: Actions') {
            return { Success: true, Results: [{ ID: GENERATE_IMAGE_ACTION_ID }] };
          }
          return { Success: true, Results: [] };
        }),
      }),
    },
  };
});

@Component({
  standalone: false,
  selector: 'mj-dialog',
  template: `
    <div class="stub-dialog" [attr.data-width]="Width">
      <h2 class="stub-dialog-title">{{ Title }}</h2>
      <ng-content></ng-content>
    </div>
  `,
})
class StubDialogComponent {
  @Input() Title = '';
  @Input() Visible = false;
  @Input() Width = 560;
  @Input() MinWidth = 320;
  @Output() Close = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-dialog-actions',
  template: `<div class="stub-dialog-actions"><ng-content></ng-content></div>`,
})
class StubDialogActionsComponent {}

@Component({
  standalone: false,
  selector: 'mj-loading',
  template: `<div class="stub-loading">{{ text }}</div>`,
})
class StubLoadingComponent {
  @Input() text = '';
  @Input() size = 'medium';
}

@Component({
  standalone: false,
  selector: 'mj-alert',
  template: `<div class="stub-alert"><ng-content></ng-content></div>`,
})
class StubAlertComponent {
  @Input() Variant = 'info';
}

import { AgentInstanceEditorModalComponent } from './agent-instance-editor-modal.component';
import {
  MjAvatarPickerTriggerComponent,
  MjAvatarStudioComponent,
} from '@memberjunction/ng-avatar-studio';

interface StubAgentPersonaRecord {
  AgentID: string;
  PersonaID: string;
  IsDefault: boolean;
  IsAllowed: boolean;
  Sequence: number;
  StyleOverrideObject: MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride | null;
  NewRecord: () => boolean;
  Save: () => Promise<boolean>;
  LatestResult: { CompleteMessage: string };
}

interface StubAgentPolicyRecord {
  AgentID: string;
  UserID: string;
  DisplayNameOverride: string | null;
  PreferredPersonaID: string | null;
  CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'];
  OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
  NewRecord: () => boolean;
  InnerLoad: () => Promise<boolean>;
  Save: () => Promise<boolean>;
  LatestResult: { CompleteMessage: string };
}

function buildStubProvider(user: UserInfo): IMetadataProvider {
  const getEntityObject = vi.fn(async (entityName: string) => {
    if (entityName === 'MJ: AI Agents') {
      const record: StubAgent & {
        NewRecord: () => boolean;
        InnerLoad: () => Promise<boolean>;
        Save: () => Promise<boolean>;
        LatestResult: { CompleteMessage: string };
      } = {
        ID: PEPPER_ID,
        Name: '',
        Description: null,
        BaseAgentID: null,
        OwnerUserID: null,
        TypeID: AGENT_TYPE_ID,
        InstantiationMode: 'None',
        IsPrimaryInstance: false,
        IconClass: null,
        LogoURL: null,
        AdditionalInstructions: null,
        TypeConfiguration: null,
        Status: 'Active',
        LatestResult: { CompleteMessage: '' },
        NewRecord: () => {
          record.ID = PEPPER_ID;
          return true;
        },
        InnerLoad: async () => true,
        Save: async () => {
          const snapshot: StubAgent = {
            ID: record.ID,
            Name: record.Name,
            Description: record.Description,
            BaseAgentID: record.BaseAgentID,
            OwnerUserID: record.OwnerUserID,
            TypeID: record.TypeID,
            InstantiationMode: record.InstantiationMode,
            IsPrimaryInstance: record.IsPrimaryInstance,
            IconClass: record.IconClass,
            LogoURL: record.LogoURL,
            AdditionalInstructions: record.AdditionalInstructions,
            TypeConfiguration: record.TypeConfiguration,
            Status: record.Status,
          };
          mockState.savedAgents.push(snapshot);
          mockState.byId.set(snapshot.ID.toLowerCase(), snapshot);
          return true;
        },
      };
      return record;
    }

    if (entityName === 'MJ: AI Agent Personas') {
      const personaRow: StubAgentPersonaRecord = {
        AgentID: '',
        PersonaID: '',
        IsDefault: true,
        IsAllowed: true,
        Sequence: 10,
        StyleOverrideObject: null,
        LatestResult: { CompleteMessage: '' },
        NewRecord: () => true,
        Save: async () => {
          mockState.savedPersonas.push({
            AgentID: personaRow.AgentID,
            PersonaID: personaRow.PersonaID,
            StyleOverrideObject: personaRow.StyleOverrideObject,
          });
          return true;
        },
      };
      return personaRow;
    }

    const policyRow: StubAgentPolicyRecord = {
      AgentID: '',
      UserID: '',
      DisplayNameOverride: null,
      PreferredPersonaID: null,
      CoordinationMode: 'Coordinator',
      OnboardingStatus: 'Completed',
      LatestResult: { CompleteMessage: '' },
      NewRecord: () => true,
      InnerLoad: async () => true,
      Save: async () => {
        mockState.savedPolicies.push({
          AgentID: policyRow.AgentID,
          UserID: policyRow.UserID,
          DisplayNameOverride: policyRow.DisplayNameOverride,
          CoordinationMode: policyRow.CoordinationMode,
        });
        return true;
      },
    };
    return policyRow;
  });

  const provider: IMetadataProvider = Object.create(ProviderBase.prototype);
  Object.defineProperties(provider, {
    CurrentUser: { value: user, writable: true, configurable: true },
    GetEntityObject: { value: getEntityObject, writable: true, configurable: true },
  });
  return provider;
}

describe('AgentInstanceEditorModalComponent (DOM)', () => {
  const alice = { ID: ALICE_ID, Name: 'Alice' } as UserInfo;

  const cosTemplate: StubAgent = {
    ID: COS_ID,
    Name: 'Chief of Staff',
    Description: 'Personal executive coordinator',
    BaseAgentID: null,
    OwnerUserID: null,
    TypeID: AGENT_TYPE_ID,
    InstantiationMode: 'Required',
    IsPrimaryInstance: false,
    IconClass: 'fa-solid fa-user-tie',
    LogoURL: null,
    AdditionalInstructions: null,
    TypeConfiguration: JSON.stringify({
      instantiation: {
        suggestedNames: ['Pepper', 'Cato'],
        suggestedIcons: ['fa-solid fa-pepper-hot', 'fa-solid fa-chess-knight'],
        suggestedPersonaNames: ['Sage', 'Onyx'],
        personalityPresets: [
          {
            label: 'Touch Sarcastic & Funny',
            tone: 'Direct, playful, a touch sarcastic and funny',
            speakingStyle: 'Candid banter with dry wit and punchy bullets',
          },
          {
            label: 'Socratic Challenger',
            tone: 'Sharp, inquisitive, skeptical',
            speakingStyle: 'Probe assumptions before recommending',
          },
        ],
      },
    }),
    Status: 'Active',
  };

  const researchTemplate: StubAgent = {
    ID: RESEARCH_ID,
    Name: 'Research Agent',
    Description: 'Comprehensive research orchestrator',
    BaseAgentID: null,
    OwnerUserID: null,
    TypeID: AGENT_TYPE_ID,
    InstantiationMode: 'Optional',
    IsPrimaryInstance: false,
    IconClass: 'fa-solid fa-microscope',
    LogoURL: null,
    AdditionalInstructions: null,
    TypeConfiguration: null,
    Status: 'Active',
  };

  const salesDeptTemplate: StubAgent = {
    ID: SALES_DEPT_ID,
    Name: 'Sales Deal Desk',
    Description: 'Shared departmental MEDDPICC deal desk specialist',
    BaseAgentID: COS_ID,
    OwnerUserID: null,
    TypeID: AGENT_TYPE_ID,
    InstantiationMode: 'Optional',
    IsPrimaryInstance: false,
    IconClass: 'fa-solid fa-briefcase',
    LogoURL: null,
    AdditionalInstructions: null,
    TypeConfiguration: null,
    Status: 'Active',
  };

  const sagePersona: StubPersona = {
    ID: SAGE_PERSONA_ID,
    Name: 'Sage',
    Description: 'Thoughtful calm voice',
    IsActive: true,
    PreviewImageURL: null,
  };

  const onyxPersona: StubPersona = {
    ID: ONYX_PERSONA_ID,
    Name: 'Onyx',
    Description: 'Measured authoritative voice',
    IsActive: true,
    PreviewImageURL: null,
  };

  const coralPersona: StubPersona = {
    ID: CORAL_PERSONA_ID,
    Name: 'Coral',
    Description: 'Friendly animated voice',
    IsActive: true,
    PreviewImageURL: null,
  };

  const versePersona: StubPersona = {
    ID: VERSE_PERSONA_ID,
    Name: 'Verse',
    Description: 'Dynamic natural voice',
    IsActive: true,
    PreviewImageURL: null,
  };

  async function settle<T>(fixture: ReturnType<typeof renderComponentFixture<T>>): Promise<void> {
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    mockState.instantiable = [cosTemplate, researchTemplate, salesDeptTemplate];
    mockState.derived = [];
    mockState.personas = [coralPersona, sagePersona, onyxPersona, versePersona];
    mockState.byId.clear();
    mockState.byId.set(COS_ID.toLowerCase(), cosTemplate);
    mockState.byId.set(RESEARCH_ID.toLowerCase(), researchTemplate);
    mockState.byId.set(SALES_DEPT_ID.toLowerCase(), salesDeptTemplate);
    mockState.resolvedPersonaByAgentId.clear();
    mockState.resolvedPolicyMode = null;
    mockState.savedAgents = [];
    mockState.savedPersonas = [];
    mockState.savedPolicies = [];
    mockState.runActionCalls = [];
    mockState.runActionQueue = [];
    mockState.notifications = [];
    vi.clearAllMocks();
  });

  it('renders progressive create mode with collapsed details, adaptive searchable template picker, vibe-to-voice pairing, and saves derived instance', async () => {
    const provider = buildStubProvider(alice);
    const fixture = renderComponentFixture(AgentInstanceEditorModalComponent, {
      imports: [CommonModule, FormsModule, MjAvatarStudioComponent, MjAvatarPickerTriggerComponent],
      declarations: [
        AgentInstanceEditorModalComponent,
        StubDialogComponent,
        StubDialogActionsComponent,
        StubLoadingComponent,
        StubAlertComponent,
      ],
      inputs: {
        Provider: provider,
        CurrentUser: alice,
        Visible: true,
        Mode: 'create',
        InitialBaseAgentId: COS_ID,
      },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Create Personal Chief of Staff');
    expect(el.textContent).toContain('Based on: Chief of Staff');
    expect(el.textContent).toContain('Change (3)');

    // Progressive disclosure accordion starts collapsed in create mode with live summary pill
    const disclosure = el.querySelector('details.aie-disclosure') as HTMLDetailsElement | null;
    expect(disclosure).not.toBeNull();
    expect(disclosure!.open).toBe(false);
    expect(el.querySelector('.aie-disclosure-summary')?.textContent).toContain('Sage');
    expect(el.querySelector('.aie-disclosure-summary')?.textContent).toContain('Coordinator');

    // Save is disabled until a name is provided
    const createBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Agent')
    );
    expect(createBtn).toBeDefined();
    expect(createBtn!.disabled).toBe(true);

    // Open adaptive template picker, search & filter by category, then pick Research Agent
    const tplToggle = el.querySelector('.aie-tpl-pill-btn') as HTMLButtonElement | null;
    expect(tplToggle).not.toBeNull();
    tplToggle!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('.aie-tpl-row').length).toBe(3);

    // Category filter narrows to Shared Dept
    const deptChip = Array.from(el.querySelectorAll('.aie-tpl-picker .aie-chip')).find(
      (b) => b.textContent?.trim() === 'Shared Dept'
    ) as HTMLButtonElement | undefined;
    expect(deptChip).toBeDefined();
    deptChip!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.aie-tpl-row').length).toBe(1);
    expect(el.querySelector('.aie-tpl-row')?.textContent).toContain('Sales Deal Desk');

    // Reset category to All and filter by search text
    const allChip = Array.from(el.querySelectorAll('.aie-tpl-picker .aie-chip')).find(
      (b) => b.textContent?.trim() === 'All'
    ) as HTMLButtonElement | undefined;
    allChip!.click();
    fixture.componentInstance.TemplateSearchText = 'research';
    fixture.detectChanges();
    expect(el.querySelectorAll('.aie-tpl-row').length).toBe(1);

    const researchRow = el.querySelector('.aie-tpl-row') as HTMLButtonElement;
    researchRow.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.SelectedBaseAgentId).toBe(RESEARCH_ID);
    expect(fixture.componentInstance.TemplatePickerOpen).toBe(false);
    expect(el.textContent).toContain('Create Personal Research Agent');

    // Re-open picker and switch back to Chief of Staff
    (el.querySelector('.aie-tpl-pill-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cosRow = Array.from(el.querySelectorAll('.aie-tpl-row')).find((b) =>
      b.textContent?.includes('Chief of Staff')
    ) as HTMLButtonElement | undefined;
    expect(cosRow).toBeDefined();
    cosRow!.click();
    fixture.detectChanges();

    // Clicking a suggestion chip populates Name, updates CTA label to "Create Pepper", and enables Save
    const pepperChip = Array.from(el.querySelectorAll('.aie-chip')).find(
      (b) => b.textContent?.trim() === 'Pepper'
    ) as HTMLButtonElement | undefined;
    expect(pepperChip).toBeDefined();
    pepperChip!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.InstanceName).toBe('Pepper');
    expect(createBtn!.disabled).toBe(false);
    expect(createBtn!.textContent).toContain('Create Pepper');

    // Clicking a Personality Vibe card sets Tone, SpeakingStyle, AND selects matching cross-vendor Voice (Coral)
    const wittyVibe = Array.from(el.querySelectorAll('.aie-vibe-card')).find((b) =>
      b.textContent?.includes('Touch Sarcastic & Funny')
    ) as HTMLButtonElement | undefined;
    expect(wittyVibe).toBeDefined();
    wittyVibe!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.Tone).toBe('Direct, playful, a touch sarcastic and funny');
    expect(fixture.componentInstance.SpeakingStyle).toBe('Candid banter with dry wit and punchy bullets');
    expect(fixture.componentInstance.SelectedPersonaId).toBe(CORAL_PERSONA_ID);
    expect(el.querySelector('.aie-disclosure-summary')?.textContent).toContain('Coral');

    // Saving persists AIAgent, AIAgentPersona (with Coral voice + StyleOverrideObject), and AIAgentUserPolicy
    const savedEvents: MJAIAgentEntityExtended[] = [];
    fixture.componentInstance.Saved.subscribe((a) => savedEvents.push(a));
    createBtn!.click();
    await settle(fixture);

    expect(mockState.savedAgents).toHaveLength(1);
    expect(mockState.savedAgents[0].Name).toBe('Pepper');
    expect(mockState.savedAgents[0].BaseAgentID).toBe(COS_ID);
    expect(mockState.savedPersonas).toHaveLength(1);
    expect(mockState.savedPersonas[0].PersonaID).toBe(CORAL_PERSONA_ID);
    expect(mockState.savedPersonas[0].StyleOverrideObject?.Tone).toBe(
      'Direct, playful, a touch sarcastic and funny'
    );
    expect(mockState.savedPolicies).toHaveLength(1);
    expect(mockState.savedPolicies[0].CoordinationMode).toBe('Coordinator');
    expect(mockEngine.Config).not.toHaveBeenCalledWith(true);
    expect(mockEngine.Config).not.toHaveBeenCalledWith(true, expect.anything());
    expect(mockEngine.Config).not.toHaveBeenCalledWith(true, expect.anything(), expect.anything());
    expect(savedEvents.map((a) => a.Name)).toEqual(['Pepper']);
  });

  it('generates, iteratively refines, undoes, and gracefully handles errors in the inline AI Avatar Studio', async () => {
    const provider = buildStubProvider(alice);
    const fixture = renderComponentFixture(AgentInstanceEditorModalComponent, {
      imports: [CommonModule, FormsModule, MjAvatarStudioComponent, MjAvatarPickerTriggerComponent],
      declarations: [
        AgentInstanceEditorModalComponent,
        StubDialogComponent,
        StubDialogActionsComponent,
        StubLoadingComponent,
        StubAlertComponent,
      ],
      inputs: {
        Provider: provider,
        CurrentUser: alice,
        Visible: true,
        Mode: 'create',
        InitialBaseAgentId: COS_ID,
      },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const comp = fixture.componentInstance;

    // Mock 128x128 canvas + Image decoding so the true WebP downscale path executes deterministically in jsdom
    const drawImageSpy = vi.fn();
    const clearRectSpy = vi.fn();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        clearRect: clearRectSpy,
        drawImage: drawImageSpy,
      }) as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D);
    const toDataUrlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation((type?: string) =>
        type === 'image/webp'
          ? `data:image/webp;base64,d2VicC1hdmF0YXItMTI4-${mockState.runActionCalls.length}`
          : 'data:image/png;base64,cG5nLXNvdXJjZQ=='
      );
    const OriginalImage = globalThis.Image;
    class MockImage {
      public naturalWidth = 1024;
      public naturalHeight = 1024;
      public width = 1024;
      public height = 1024;
      public crossOrigin: string | null = null;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      private _src = '';
      public get src(): string {
        return this._src;
      }
      public set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    try {
      // Populate agent details BEFORE opening Avatar Studio so contextual prompt enrichment is exercised
      const nameInput = el.querySelector('#aie-instance-name') as HTMLInputElement;
      nameInput.value = 'Pepper';
      nameInput.dispatchEvent(new Event('input'));
      comp.Description = 'Tracks executive priorities and clinical milestones';
      comp.Tone = 'Direct, playful, a touch sarcastic and funny';
      comp.AdditionalInstructions = 'Focus on oncology Phase III briefings.';
      fixture.detectChanges();

      // 1. Clicking the 68x68 avatar button overlays the entire dialog with Avatar Studio
      expect(el.querySelector('mj-avatar-studio')).toBeNull();
      (el.querySelector('.mjas-trigger') as HTMLButtonElement).click();
      await settle(fixture);
      expect(el.querySelector('mj-avatar-studio')).not.toBeNull();
      // Main form inputs are hidden while Avatar Studio overlays the dialog
      expect(el.querySelector('#aie-instance-name')).toBeNull();

      // Prompt textarea is multiline and pre-populated with rich agent context + style
      const promptTextarea = el.querySelector('#mjas-avatar-prompt') as HTMLTextAreaElement;
      expect(promptTextarea).not.toBeNull();
      expect(promptTextarea.tagName).toBe('TEXTAREA');
      expect(promptTextarea.value).toContain('"Pepper" (Chief of Staff)');
      expect(promptTextarea.value).toContain('Tracks executive priorities and clinical milestones');
      expect(promptTextarea.value).toContain('Focus on oncology Phase III briefings');
      expect(promptTextarea.value).toContain('3D Clay Mascot');

      // Clicking another style preset before manual edit updates the contextual prompt
      const cyberChip = Array.from(el.querySelectorAll('.mjas-generate-bar .mjas-chip')).find((b) =>
        b.textContent?.includes('Cyberpunk Bot')
      ) as HTMLButtonElement | undefined;
      expect(cyberChip).toBeDefined();
      cyberChip!.click();
      fixture.detectChanges();
      expect(comp.AvatarStudioRef?.AvatarPrompt).toContain('Cyberpunk Bot');
      expect(comp.AvatarStudioRef?.AvatarPrompt).toContain('"Pepper"');

      // 2. Generate Avatar via Generate Image action (index-keyed object ResultData shape from ActionResolver.RunAction)
      mockState.runActionQueue.push({
        Success: true,
        Message: 'Generated',
        Result: {
          0: {
            Name: 'Images',
            Type: 'Output',
            Value: [
              {
                modality: 'Image',
                mimeType: 'image/png',
                data: 'Zmlyc3QtYXZhdGFyLXBuZw==',
              },
            ],
          },
        },
        LogEntry: null,
        Params: [],
        RunParams: null,
      });

      promptTextarea.value = 'Sleek chili mascot badge, Cyberpunk Bot style';
      promptTextarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const genBtn = el.querySelector('.mjas-generate-btn') as HTMLButtonElement | null;
      expect(genBtn).not.toBeNull();
      genBtn!.click();
      await settle(fixture);

      expect(mockState.runActionCalls).toHaveLength(1);
      expect(mockState.runActionCalls[0].actionId).toBe(GENERATE_IMAGE_ACTION_ID);
      expect(mockState.runActionCalls[0].params.find((p) => p.Name === 'Prompt')?.Value).toBe(
        'Sleek chili mascot badge, Cyberpunk Bot style'
      );
      expect(mockState.runActionCalls[0].params.find((p) => p.Name === 'NumberOfImages')?.Value).toBe('1');
      for (const param of mockState.runActionCalls[0].params) {
        expect(typeof param.Value).toBe('string');
      }
      expect(mockState.runActionCalls[0].params.find((p) => p.Name === 'SourceImage')).toBeUndefined();
      // Downscaled to 128x128 WebP data URI
      expect(drawImageSpy).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 1024, 0, 0, 128, 128);
      expect(comp.LogoURL).toBe('data:image/webp;base64,d2VicC1hdmF0YXItMTI4-1');
      expect(el.querySelector('.mjas-refine-box')).not.toBeNull();

      // 3. Iterative AI Refinement passes BOTH Prompt AND raw base64 SourceImage ({ Params: [...] } shape)
      mockState.runActionQueue.push({
        Success: true,
        Message: 'Edited',
        Result: {
          Params: [
            {
              Name: 'Images',
              Type: 'Output',
              Value: [
                {
                  modality: 'Image',
                  mimeType: 'image/png',
                  data: 'cmVmaW5lZC1hdmF0YXItcG5n',
                },
              ],
            },
          ],
        },
        LogEntry: null,
        Params: [],
        RunParams: null,
      });

      const refineInput = el.querySelector('#mjas-avatar-refine-input') as HTMLTextAreaElement;
      expect(refineInput).not.toBeNull();
      expect(refineInput.tagName).toBe('TEXTAREA');
      refineInput.value = 'Add glasses and teal background';
      refineInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const refineBtn = Array.from(el.querySelectorAll('.mjas-refine-box button')).find((b) =>
        b.textContent?.includes('Refine')
      ) as HTMLButtonElement | undefined;
      expect(refineBtn).toBeDefined();
      expect(refineBtn!.disabled).toBe(false);
      refineBtn!.click();
      await settle(fixture);

      expect(mockState.runActionCalls).toHaveLength(2);
      const editParams = mockState.runActionCalls[1].params;
      expect(editParams.find((p) => p.Name === 'Prompt')?.Value).toBe('Add glasses and teal background');
      // Must pass raw base64 without data:image/...;base64, prefix so BaseImageGenerator.normalizeImageInput decodes cleanly
      expect(editParams.find((p) => p.Name === 'SourceImage')?.Value).toBe('Zmlyc3QtYXZhdGFyLXBuZw==');
      expect(comp.LogoURL).toBe('data:image/webp;base64,d2VicC1hdmF0YXItMTI4-2');
      expect(comp.AvatarHistoryCount).toBe(2);

      // 4. Undo steps back to the first generated avatar
      const undoBtn = Array.from(el.querySelectorAll('.aie-studio-footer button')).find((b) =>
        b.textContent?.includes('Undo')
      ) as HTMLButtonElement | undefined;
      expect(undoBtn).toBeDefined();
      undoBtn!.click();
      fixture.detectChanges();
      expect(comp.LogoURL).toBe('data:image/webp;base64,d2VicC1hdmF0YXItMTI4-1');

      // 5. Failed generation surfaces a warning toast via MJNotificationService and inline studio message
      mockState.runActionQueue.push({
        Success: false,
        Message: 'No active image generator API key configured',
        Result: null,
        LogEntry: null,
        Params: [],
        RunParams: null,
      });
      await comp.AvatarStudioRef!.GenerateAvatar();
      fixture.detectChanges();

      expect(comp.AvatarStudioRef?.ErrorMessage).toContain('No active image generator API key configured');
      expect(mockState.notifications).toHaveLength(1);
      expect(mockState.notifications[0].style).toBe('warning');
      expect(mockState.notifications[0].message).toContain('No active image generator API key configured');

      // 6. Clicking "Done — Use This Avatar" closes the overlay and restores the main form with new avatar intact
      const doneBtn = Array.from(el.querySelectorAll('.aie-actions-primary button')).find((b) =>
        b.textContent?.includes('Done')
      ) as HTMLButtonElement | undefined;
      expect(doneBtn).toBeDefined();
      doneBtn!.click();
      fixture.detectChanges();
      expect(el.querySelector('mj-avatar-studio')).toBeNull();
      expect(el.querySelector('#aie-instance-name')).not.toBeNull();
      expect(comp.LogoURL).toBe('data:image/webp;base64,d2VicC1hdmF0YXItMTI4-1');
    } finally {
      getContextSpy.mockRestore();
      toDataUrlSpy.mockRestore();
      vi.stubGlobal('Image', OriginalImage);
    }
  });

  it('emits ChatToOnboard with the selected template and closes the modal', async () => {
    const provider = buildStubProvider(alice);
    const fixture = renderComponentFixture(AgentInstanceEditorModalComponent, {
      imports: [CommonModule, FormsModule, MjAvatarStudioComponent, MjAvatarPickerTriggerComponent],
      declarations: [
        AgentInstanceEditorModalComponent,
        StubDialogComponent,
        StubDialogActionsComponent,
        StubLoadingComponent,
        StubAlertComponent,
      ],
      inputs: {
        Provider: provider,
        CurrentUser: alice,
        Visible: true,
        Mode: 'create',
        InitialBaseAgentId: COS_ID,
      },
    });
    await settle(fixture);

    const onboarded: MJAIAgentEntityExtended[] = [];
    fixture.componentInstance.ChatToOnboard.subscribe((tpl) => onboarded.push(tpl));

    const el = fixture.nativeElement as HTMLElement;
    const chatBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Chat to Onboard')
    ) as HTMLButtonElement | undefined;
    expect(chatBtn).toBeDefined();
    chatBtn!.click();
    fixture.detectChanges();

    expect(onboarded.map((t) => t.ID)).toEqual([COS_ID]);
    expect(fixture.componentInstance.Visible).toBe(false);
  });

  it('renders edit mode with pre-populated Pepper identity, auto-opened details, Custom vibe badge on manual edit, and Archive confirmation', async () => {
    const pepperAgent: StubAgent = {
      ID: PEPPER_ID,
      Name: 'Pepper',
      Description: 'Executive right-hand',
      BaseAgentID: COS_ID,
      OwnerUserID: ALICE_ID,
      TypeID: AGENT_TYPE_ID,
      InstantiationMode: 'None',
      IsPrimaryInstance: true,
      IconClass: 'fa-solid fa-pepper-hot',
      LogoURL: null,
      AdditionalInstructions: 'Start check-ins with one dry joke.',
      TypeConfiguration: null,
      Status: 'Active',
    };
    mockState.byId.set(PEPPER_ID.toLowerCase(), pepperAgent);
    mockState.resolvedPersonaByAgentId.set(PEPPER_ID.toLowerCase(), {
      Persona: sagePersona,
      Tone: 'Direct, playful, a touch sarcastic and funny',
      SpeakingStyle: 'Candid banter with dry wit',
    });
    mockState.resolvedPolicyMode = 'Coordinator';

    const pepperEntity: MJAIAgentEntityExtended = Object.create(
      MJAIAgentEntityExtended.prototype,
      Object.getOwnPropertyDescriptors(pepperAgent)
    );
    const provider = buildStubProvider(alice);
    const fixture = renderComponentFixture(AgentInstanceEditorModalComponent, {
      imports: [CommonModule, FormsModule, MjAvatarStudioComponent, MjAvatarPickerTriggerComponent],
      declarations: [
        AgentInstanceEditorModalComponent,
        StubDialogComponent,
        StubDialogActionsComponent,
        StubLoadingComponent,
        StubAlertComponent,
      ],
      inputs: {
        Provider: provider,
        CurrentUser: alice,
        Visible: true,
        Mode: 'edit',
        EditingAgent: pepperEntity,
      },
    });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Tailor Pepper');
    expect(el.querySelector('.aie-tpl-pill-btn')).toBeNull();
    expect(el.textContent).not.toContain('Chat to Onboard');
    expect(fixture.componentInstance.InstanceName).toBe('Pepper');
    expect(fixture.componentInstance.Tone).toBe('Direct, playful, a touch sarcastic and funny');
    expect(fixture.componentInstance.AdditionalInstructions).toBe('Start check-ins with one dry joke.');
    expect(fixture.componentInstance.CoordinationMode).toBe('Coordinator');
    expect(fixture.componentInstance.AdvancedExpanded).toBe(true);

    // Manually editing Tone away from presets flags Custom vibe
    fixture.componentInstance.Tone = 'Dry academic minimalist';
    fixture.detectChanges();
    expect(fixture.componentInstance.IsCustomVibe).toBe(true);
    expect(el.textContent).toContain('Custom');

    // Archive button reveals inline confirmation
    const archiveBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Archive')
    ) as HTMLButtonElement | undefined;
    expect(archiveBtn).toBeDefined();
    archiveBtn!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Confirm Archive');
  });
});
