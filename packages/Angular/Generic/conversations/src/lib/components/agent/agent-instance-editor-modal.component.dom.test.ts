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
const AGENT_TYPE_ID = '33333333-0000-4000-8000-000000000001';
const SAGE_PERSONA_ID = '44444444-0000-4000-8000-000000000001';
const ONYX_PERSONA_ID = '44444444-0000-4000-8000-000000000002';
const ALICE_ID = '22222222-0000-4000-8000-000000000001';

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

const mockMentionRefresh = vi.fn(async () => undefined);

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

vi.mock('../../services/mention-autocomplete.service', () => ({
  MentionAutocompleteService: {
    get Instance() {
      return { Refresh: mockMentionRefresh };
    },
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: {
      FromMetadataProvider: () => ({
        RunView: vi.fn(async () => ({ Success: true, Results: [] })),
      }),
    },
  };
});

@Component({
  standalone: false,
  selector: 'mj-dialog',
  template: `
    <div class="stub-dialog">
      <h2 class="stub-dialog-title">{{ Title }}</h2>
      <ng-content></ng-content>
    </div>
  `,
})
class StubDialogComponent {
  @Input() Title = '';
  @Input() Visible = false;
  @Input() Width = 680;
  @Input() MinWidth = 360;
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

  const sagePersona: StubPersona = {
    ID: SAGE_PERSONA_ID,
    Name: 'Sage',
    Description: 'Crisp warm voice',
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

  beforeEach(() => {
    mockState.instantiable = [cosTemplate, researchTemplate];
    mockState.derived = [];
    mockState.personas = [sagePersona, onyxPersona];
    mockState.byId.clear();
    mockState.byId.set(COS_ID.toLowerCase(), cosTemplate);
    mockState.byId.set(RESEARCH_ID.toLowerCase(), researchTemplate);
    mockState.resolvedPersonaByAgentId.clear();
    mockState.resolvedPolicyMode = null;
    mockState.savedAgents = [];
    mockState.savedPersonas = [];
    mockState.savedPolicies = [];
    vi.clearAllMocks();
  });

  it('renders create mode with templates, suggestion chips, personality presets, Chat to Onboard, and saves derived instance', async () => {
    const provider = buildStubProvider(alice);
    const fixture = renderComponentFixture(AgentInstanceEditorModalComponent, {
      imports: [CommonModule, FormsModule],
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
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Create Personal Chief of Staff');
    expect(el.textContent).toContain('Chief of Staff');
    expect(el.textContent).toContain('Research Agent');

    // Save is disabled until a name is provided
    const createBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Agent')
    );
    expect(createBtn).toBeDefined();
    expect(createBtn!.disabled).toBe(true);

    // Clicking a template switches the selected base template and dialog title
    const researchCard = Array.from(el.querySelectorAll('.aie-template-card')).find((b) =>
      b.textContent?.includes('Research Agent')
    ) as HTMLButtonElement | undefined;
    expect(researchCard).toBeDefined();
    researchCard!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.SelectedBaseAgentId).toBe(RESEARCH_ID);
    expect(el.textContent).toContain('Create Personal Research Agent');

    // Switch back to Chief of Staff
    const cosCard = Array.from(el.querySelectorAll('.aie-template-card')).find((b) =>
      b.textContent?.includes('Chief of Staff')
    ) as HTMLButtonElement | undefined;
    cosCard!.click();
    fixture.detectChanges();

    // Clicking a suggestion chip populates Name and enables Save
    const pepperChip = Array.from(el.querySelectorAll('.aie-chip')).find(
      (b) => b.textContent?.trim() === 'Pepper'
    ) as HTMLButtonElement | undefined;
    expect(pepperChip).toBeDefined();
    pepperChip!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.InstanceName).toBe('Pepper');
    expect(createBtn!.disabled).toBe(false);

    // Clicking a personality preset populates Tone and SpeakingStyle
    const presetChip = Array.from(el.querySelectorAll('.aie-chip')).find((b) =>
      b.textContent?.includes('Touch Sarcastic & Funny')
    ) as HTMLButtonElement | undefined;
    expect(presetChip).toBeDefined();
    presetChip!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.Tone).toBe('Direct, playful, a touch sarcastic and funny');
    expect(fixture.componentInstance.SpeakingStyle).toBe('Candid banter with dry wit and punchy bullets');

    // Saving persists AIAgent, AIAgentPersona (StyleOverrideObject), and AIAgentUserPolicy and emits Saved
    const savedEvents: MJAIAgentEntityExtended[] = [];
    fixture.componentInstance.Saved.subscribe((a) => savedEvents.push(a));
    createBtn!.click();
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockState.savedAgents).toHaveLength(1);
    expect(mockState.savedAgents[0].Name).toBe('Pepper');
    expect(mockState.savedAgents[0].BaseAgentID).toBe(COS_ID);
    expect(mockState.savedPersonas).toHaveLength(1);
    expect(mockState.savedPersonas[0].StyleOverrideObject?.Tone).toBe(
      'Direct, playful, a touch sarcastic and funny'
    );
    expect(mockState.savedPolicies).toHaveLength(1);
    expect(mockState.savedPolicies[0].CoordinationMode).toBe('Coordinator');
    expect(mockMentionRefresh).toHaveBeenCalledTimes(1);
    expect(savedEvents.map((a) => a.Name)).toEqual(['Pepper']);
  });

  it('emits ChatToOnboard with the selected template and closes the modal', async () => {
    const provider = buildStubProvider(alice);
    const fixture = renderComponentFixture(AgentInstanceEditorModalComponent, {
      imports: [CommonModule, FormsModule],
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
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

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

  it('renders edit mode with pre-populated Pepper identity, Tone, Standing Instructions, and Archive confirmation', async () => {
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
      imports: [CommonModule, FormsModule],
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
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Tailor Pepper');
    expect(el.querySelectorAll('.aie-template-card').length).toBe(0);
    expect(el.textContent).not.toContain('Chat to Onboard');
    expect(fixture.componentInstance.InstanceName).toBe('Pepper');
    expect(fixture.componentInstance.Tone).toBe('Direct, playful, a touch sarcastic and funny');
    expect(fixture.componentInstance.AdditionalInstructions).toBe('Start check-ins with one dry joke.');
    expect(fixture.componentInstance.CoordinationMode).toBe('Coordinator');

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
