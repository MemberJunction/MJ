import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';

const COS_ID = '11111111-0000-4000-8000-000000000001';
const PEPPER_ID = '11111111-0000-4000-8000-000000000002';
const CATO_ID = '11111111-0000-4000-8000-000000000003';
const RESEARCH_ID = '11111111-0000-4000-8000-000000000004';
const ALICE_ID = '22222222-0000-4000-8000-000000000001';

interface StubAgent {
  ID: string;
  Name: string;
  Description: string | null;
  BaseAgentID: string | null;
  OwnerUserID: string | null;
  InstantiationMode: 'None' | 'Optional' | 'Required';
  IsPrimaryInstance: boolean;
  IconClass: string | null;
  LogoURL: string | null;
  Status: 'Active' | 'Disabled';
}

const mockAiEngineState = {
  derived: [] as StubAgent[],
  instantiable: [] as StubAgent[],
  byId: new Map<string, StubAgent>(),
};

const mockEngine = {
  Config: vi.fn(async () => true),
  GetUserDerivedAgents: vi.fn(() => mockAiEngineState.derived),
  GetInstantiableAgents: vi.fn(() => mockAiEngineState.instantiable),
  GetAgentByID: vi.fn((id: string) => mockAiEngineState.byId.get(id.toLowerCase())),
  GetRootAgent: vi.fn((id: string) => {
    let cur = mockAiEngineState.byId.get(id.toLowerCase());
    while (cur?.BaseAgentID) {
      const parent = mockAiEngineState.byId.get(cur.BaseAgentID.toLowerCase());
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }),
  ResolveAgentPersona: vi.fn(() => null),
};

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: {
    GetProviderInstance: () => mockEngine,
    get Instance() {
      return mockEngine;
    },
  },
}));

@Component({ standalone: false, selector: 'mj-agent-instance-editor-modal', template: '' })
class StubAgentInstanceEditorModalComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() Visible = false;
  @Output() VisibleChange = new EventEmitter<boolean>();
  @Input() CurrentUser: UserInfo | null = null;
  @Input() Mode: 'create' | 'edit' = 'create';
  @Input() EditingAgent: MJAIAgentEntityExtended | null = null;
  @Input() InitialBaseAgentId: string | null = null;
  @Output() Saved = new EventEmitter<MJAIAgentEntityExtended>();
  @Output() Archived = new EventEmitter<string>();
  @Output() ChatToOnboard = new EventEmitter<MJAIAgentEntityExtended>();
}

import { MyAgentsSectionComponent } from './my-agents-section.component';

describe('MyAgentsSectionComponent (DOM)', () => {
  const alice = { ID: ALICE_ID, Name: 'Alice' } as UserInfo;

  beforeEach(() => {
    mockAiEngineState.derived = [];
    mockAiEngineState.instantiable = [];
    mockAiEngineState.byId.clear();
    vi.clearAllMocks();
  });

  it('shows "Set up My Chief of Staff" CTA when user has 0 instances for a Required template', async () => {
    const cosTemplate: StubAgent = {
      ID: COS_ID,
      Name: 'Chief of Staff',
      Description: 'Executive partner',
      BaseAgentID: null,
      OwnerUserID: null,
      InstantiationMode: 'Required',
      IsPrimaryInstance: false,
      IconClass: 'fa-solid fa-user-tie',
      LogoURL: null,
      Status: 'Active',
    };
    mockAiEngineState.instantiable = [cosTemplate];
    mockAiEngineState.byId.set(COS_ID.toLowerCase(), cosTemplate);

    const fixture = renderComponentFixture(MyAgentsSectionComponent, {
      imports: [CommonModule],
      declarations: [MyAgentsSectionComponent, StubAgentInstanceEditorModalComponent],
      inputs: { CurrentUser: alice, ShowMyAgents: true },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('My Agents');
    expect(text).toContain('Set up My Chief of Staff');
  });

  it('renders derived instances sorted Primary/Required first (Pepper, Cato, FDA Clinical Scout), hides setup CTA, and emits chat/new-chat events', async () => {
    const cosTemplate: StubAgent = {
      ID: COS_ID,
      Name: 'Chief of Staff',
      Description: 'Executive partner',
      BaseAgentID: null,
      OwnerUserID: null,
      InstantiationMode: 'Required',
      IsPrimaryInstance: false,
      IconClass: 'fa-solid fa-user-tie',
      LogoURL: null,
      Status: 'Active',
    };
    const researchTemplate: StubAgent = {
      ID: RESEARCH_ID,
      Name: 'Research Agent',
      Description: 'Deep web research',
      BaseAgentID: null,
      OwnerUserID: null,
      InstantiationMode: 'Optional',
      IsPrimaryInstance: false,
      IconClass: 'fa-solid fa-microscope',
      LogoURL: null,
      Status: 'Active',
    };
    const pepper: StubAgent = {
      ID: PEPPER_ID,
      Name: 'Pepper',
      Description: 'Witty CoS',
      BaseAgentID: COS_ID,
      OwnerUserID: ALICE_ID,
      InstantiationMode: 'None',
      IsPrimaryInstance: true,
      IconClass: 'fa-solid fa-pepper-hot',
      LogoURL: null,
      Status: 'Active',
    };
    const cato: StubAgent = {
      ID: CATO_ID,
      Name: 'Cato',
      Description: 'Socratic advisor',
      BaseAgentID: COS_ID,
      OwnerUserID: ALICE_ID,
      InstantiationMode: 'None',
      IsPrimaryInstance: false,
      IconClass: 'fa-solid fa-chess-knight',
      LogoURL: null,
      Status: 'Active',
    };
    const scout: StubAgent = {
      ID: '11111111-0000-4000-8000-000000000005',
      Name: 'FDA Clinical Scout',
      Description: 'Biotech phase II/III tracker',
      BaseAgentID: RESEARCH_ID,
      OwnerUserID: ALICE_ID,
      InstantiationMode: 'None',
      IsPrimaryInstance: true,
      IconClass: 'fa-solid fa-microscope',
      LogoURL: null,
      Status: 'Active',
    };
    mockAiEngineState.instantiable = [cosTemplate, researchTemplate];
    mockAiEngineState.derived = [scout, cato, pepper];
    [cosTemplate, researchTemplate, pepper, cato, scout].forEach((a) =>
      mockAiEngineState.byId.set(a.ID.toLowerCase(), a)
    );

    const fixture = renderComponentFixture(MyAgentsSectionComponent, {
      imports: [CommonModule],
      declarations: [MyAgentsSectionComponent, StubAgentInstanceEditorModalComponent],
      inputs: { CurrentUser: alice, ShowMyAgents: true },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Pepper');
    expect(text).toContain('Cato');
    expect(text).toContain('FDA Clinical Scout');
    expect(text).not.toContain('Set up My Chief of Staff');

    // Primary Required-root instance (Pepper) renders #1 with star, sibling Cato #2, Optional Scout #3
    const items = fixture.nativeElement.querySelectorAll('.mas-item') as NodeListOf<HTMLElement>;
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Pepper');
    expect(items[0].querySelector('.mas-primary-star')).not.toBeNull();
    expect(items[1].textContent).toContain('Cato');
    expect(items[2].textContent).toContain('FDA Clinical Scout');

    const started: MJAIAgentEntityExtended[] = [];
    const startedNew: MJAIAgentEntityExtended[] = [];
    fixture.componentInstance.StartChatWithAgent.subscribe((a) => started.push(a));
    fixture.componentInstance.StartNewChatWithAgent.subscribe((a) => startedNew.push(a));

    items[0].click();
    expect(started.map((a) => a.Name)).toEqual(['Pepper']);

    const newChatBtn = items[1].querySelector('.mas-new-chat-btn') as HTMLButtonElement | null;
    expect(newChatBtn).not.toBeNull();
    newChatBtn!.click();
    expect(startedNew.map((a) => a.Name)).toEqual(['Cato']);
    expect(started.map((a) => a.Name)).toEqual(['Pepper']);
  });

  it('E5: hides "Set up My Chief of Staff" and create CTA for external Space Participant users lacking CanCreate on MJ: AI Agents', async () => {
    const cosTemplate: StubAgent = {
      ID: COS_ID,
      Name: 'Chief of Staff',
      Description: 'Executive partner',
      BaseAgentID: null,
      OwnerUserID: null,
      InstantiationMode: 'Required',
      IsPrimaryInstance: false,
      IconClass: 'fa-solid fa-user-tie',
      LogoURL: null,
      Status: 'Active',
    };
    mockAiEngineState.instantiable = [cosTemplate];
    mockAiEngineState.byId.set(COS_ID.toLowerCase(), cosTemplate);

    const externalParticipant = {
      ID: '33333333-0000-4000-8000-000000000001',
      Name: 'External Space Participant',
      UserRoles: [{ Role: 'Space Participant', RoleID: 'role-space-participant' }],
    } as Partial<UserInfo> as UserInfo;

    const restrictedProvider = {
      CurrentUser: externalParticipant,
      EntityByName: (name: string) =>
        name === 'MJ: AI Agents'
          ? {
              GetUserPermisions: () => ({
                CanRead: true,
                CanCreate: false,
                CanUpdate: false,
                CanDelete: false,
              }),
            }
          : null,
    } as Partial<IMetadataProvider> as IMetadataProvider;

    const fixture = renderComponentFixture(MyAgentsSectionComponent, {
      imports: [CommonModule],
      declarations: [MyAgentsSectionComponent, StubAgentInstanceEditorModalComponent],
      inputs: { CurrentUser: externalParticipant, Provider: restrictedProvider, ShowMyAgents: true },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.HasInstantiableTemplates).toBe(false);
    expect(fixture.componentInstance.UnonboardedRequiredTemplates).toHaveLength(0);
    expect(fixture.componentInstance.IsVisible).toBe(false);
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Set up My Chief of Staff');
  });
});
