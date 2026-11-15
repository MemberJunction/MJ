/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { ArtifactsModule } from '../lib/artifacts.module';
import {
  ArtifactAgentPresenceBarComponent,
  FormatAgentBaseName,
  FormatAgentCoordinateLabel,
} from '../lib/components/presence/artifact-agent-presence-bar.component';
import { ArtifactAgentRegionIndicatorComponent } from '../lib/components/presence/artifact-agent-region-indicator.component';
import {
  DocumentCollaborationService,
  type CollaboratorPresence,
} from '../lib/services/document-collaboration.service';

describe('Cross-Device Agent Presence Components & Awareness Mapping', () => {
  it('ArtifactAgentPresenceBarComponent renders active agents with acting-for attribution, coordinate, no mouse pointer arrow, and emits jump', () => {
    TestBed.configureTestingModule({
      imports: [ArtifactsModule, ArtifactAgentPresenceBarComponent],
    });

    const fixture = TestBed.createComponent(ArtifactAgentPresenceBarComponent);
    const component = fixture.componentInstance;

    const collabs: CollaboratorPresence[] = [
      {
        ClientID: 101,
        UserID: 'user-1',
        Name: 'Human Alice',
        Color: 'var(--mj-status-success)',
        CanEdit: true,
        IsAgent: false,
      },
      {
        ClientID: 0x70000001,
        UserID: 'agent:run-1',
        Name: 'Sage (for Amith)',
        AgentName: 'Sage',
        ActingForUserID: 'user-amith',
        ActingForUserName: 'Amith',
        Color: 'var(--mj-brand-primary)',
        CanEdit: true,
        IsAgent: true,
        AgentPhase: 'working',
        ActionSummary: 'Writing live query table',
        AgentLocation: {
          Domain: 'spreadsheet',
          SheetID: 'sheet-1',
          SheetName: 'Pipeline',
          Range: 'A1:E20',
        },
      },
      {
        ClientID: 0x70000002,
        UserID: 'agent:run-2',
        Name: 'Exited Agent',
        Color: 'var(--mj-brand-primary)',
        CanEdit: true,
        IsAgent: true,
        AgentPhase: 'exit',
      },
    ];

    component.Collaborators = collabs;
    component.ActiveDomain = 'spreadsheet';
    fixture.detectChanges();

    const pills = fixture.nativeElement.querySelectorAll('button.mj-agent-pill');
    expect(pills.length).toBe(1);

    const pillEl = pills[0] as HTMLButtonElement;
    expect(pillEl.textContent).toContain('Sage');
    expect(pillEl.textContent).toContain('for Amith');
    expect(pillEl.textContent).toContain('Writing live query table');
    expect(pillEl.textContent).toContain('Pipeline!A1:E20');
    expect(pillEl.classList.contains('is-working')).toBe(true);

    // Must never use mouse pointer cursor icons that confuse agents with user cursor arrows
    expect(pillEl.querySelector('.fa-arrow-pointer, .fa-mouse-pointer')).toBeNull();
    expect(pillEl.querySelector('.fa-robot')).not.toBeNull();

    const jumped: CollaboratorPresence[] = [];
    component.JumpToAgentLocation.subscribe((c) => jumped.push(c));
    pillEl.click();
    expect(jumped).toHaveLength(1);
    expect(jumped[0].ClientID).toBe(0x70000001);
  });

  it('ArtifactAgentRegionIndicatorComponent renders slide/doc region indicator with acting-for user and suppresses exit phase', () => {
    TestBed.configureTestingModule({
      imports: [ArtifactsModule, ArtifactAgentRegionIndicatorComponent],
    });

    const fixture = TestBed.createComponent(ArtifactAgentRegionIndicatorComponent);
    const component = fixture.componentInstance;

    const slideAgent: CollaboratorPresence = {
      ClientID: 0x70000005,
      UserID: 'agent:deck-1',
      Name: 'Slide Builder',
      AgentName: 'Slide Builder',
      ActingForUserName: 'Amith',
      Color: 'var(--mj-brand-primary)',
      CanEdit: true,
      IsAgent: true,
      AgentPhase: 'settled',
      ActionSummary: 'Updated KPI region',
      AgentLocation: {
        Domain: 'slides',
        SlideID: 'slide-2',
        SlideNumber: 2,
        ElementID: 'reg-kpi',
      },
    };

    component.Agent = slideAgent;
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.tagName).toBe('BUTTON');
    expect(badge.getAttribute('type')).toBe('button');
    expect(badge.textContent).toContain('Slide Builder');
    expect(badge.textContent).toContain('for Amith');
    expect(badge.textContent).toContain('Slide 2 · reg-kpi');
    expect(badge.classList.contains('is-settled')).toBe(true);

    // Unsafe CSS url(...) injection in Agent.Color must fall back to var(--mj-brand-primary)
    component.Agent = { ...slideAgent, Color: 'url(https://evil.example/leak.png)' };
    fixture.detectChanges();
    const sanitizedBadge = fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]') as HTMLElement;
    expect(sanitizedBadge.style.getPropertyValue('--mj-agent-accent')).toBe('var(--mj-brand-primary)');

    component.Agent = slideAgent;
    fixture.detectChanges();

    const jumpSpy = vi.fn();
    component.JumpToAgent.subscribe(jumpSpy);
    (fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]') as HTMLElement).click();
    expect(jumpSpy).toHaveBeenCalledWith(slideAgent);

    // Exit phase hides the region indicator
    component.Agent = { ...slideAgent, AgentPhase: 'exit' };
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]'),
    ).toBeNull();
  });

  it('DocumentCollaborationSession.GetCollaborators strictly requires u.isAgent === true, sanitizes user.color, and maps structured AgentLocation', () => {
    const svc = new DocumentCollaborationService();
    const session = svc.CreateSession(
      'art-presence-1',
      '{}',
      {
        id: 'human-local',
        name: 'Local User',
      },
      true,
    );

    // Apply a remote server-style Yjs awareness update with both a human named "Agent Smith"
    // and a genuine server agent awareness entry
    const remoteDoc = new Y.Doc();
    const remoteAwareness = new Awareness(remoteDoc);
    remoteAwareness.setLocalState({
      isAgent: true,
      agentPhase: 'working',
      agentLocation: {
        Domain: 'spreadsheet',
        SheetID: 'sheet-rev',
        SheetName: 'Revenue',
        Range: 'B2:D15',
      },
      user: {
        userId: 'agent:run-xyz',
        name: 'Query Analyst (for Amith)',
        agentName: 'Query Analyst',
        actingForUserId: 'u-1',
        actingForUserName: 'Amith',
        color: 'var(--mj-brand-primary)',
        canEdit: true,
        isAgent: true,
        agentPhase: 'working',
        actionSummary: 'Populating query rows',
        agentLocation: {
          Domain: 'spreadsheet',
          SheetID: 'sheet-rev',
          SheetName: 'Revenue',
          Range: 'B2:D15',
        },
      },
    });

    const fakeHumanDoc = new Y.Doc();
    const fakeHumanAwareness = new Awareness(fakeHumanDoc);
    fakeHumanAwareness.setLocalState({
      user: {
        userId: 'human-smith',
        name: 'Agent Smith',
        role: 'agent',
        color: 'url(https://attacker.example/beacon)',
        canEdit: true,
      },
    });

    const update1 = encodeAwarenessUpdate(remoteAwareness, [remoteDoc.clientID]);
    const update2 = encodeAwarenessUpdate(fakeHumanAwareness, [fakeHumanDoc.clientID]);
    const yUpdate = awaitImportApply(session, update1, update2);
    expect(yUpdate).toBe(true);

    const collaborators = session.GetCollaborators();
    const realAgent = collaborators.find((c) => c.ClientID === remoteDoc.clientID);
    const humanNamedAgent = collaborators.find((c) => c.ClientID === fakeHumanDoc.clientID);

    expect(realAgent).toBeDefined();
    expect(realAgent?.IsAgent).toBe(true);
    expect(realAgent?.ActingForUserName).toBe('Amith');
    expect(realAgent?.AgentName).toBe('Query Analyst');
    expect(realAgent?.AgentPhase).toBe('working');
    expect(realAgent?.ActiveBlockID).toBe('sheet-rev:B2:D15');
    expect(realAgent?.Color).toBe('var(--mj-brand-primary)');
    expect(FormatAgentBaseName(realAgent!)).toBe('Query Analyst');
    expect(FormatAgentCoordinateLabel(realAgent!)).toBe('Revenue!B2:D15');

    // Strict check: name regex / role hint must NOT elevate a human client to an agent,
    // and untrusted url(...) color must be sanitized to var(--mj-brand-primary)
    expect(humanNamedAgent).toBeDefined();
    expect(humanNamedAgent?.IsAgent).toBe(false);
    expect(humanNamedAgent?.ActingForUserName).toBeUndefined();
    expect(humanNamedAgent?.Color).toBe('var(--mj-brand-primary)');

    remoteAwareness.destroy();
    remoteDoc.destroy();
    fakeHumanAwareness.destroy();
    fakeHumanDoc.destroy();
    session.Destroy();
  });
});

function awaitImportApply(
  session: ReturnType<DocumentCollaborationService['CreateSession']>,
  u1: Uint8Array,
  u2: Uint8Array,
): boolean {
  applyAwarenessUpdate(session.Awareness, u1, 'test');
  applyAwarenessUpdate(session.Awareness, u2, 'test');
  return true;
}
