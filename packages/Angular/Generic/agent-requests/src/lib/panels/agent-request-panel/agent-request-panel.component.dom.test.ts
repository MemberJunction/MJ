import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity } from '@memberjunction/core-entities';
import { query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { AgentRequestPanelComponent, AgentRequestPanelResult } from './agent-request-panel.component';

/**
 * DOM-level tests for AgentRequestPanelComponent. These cover the half of the
 * component's contract that lives in the template — the `@if` gating on
 * IsOpen/Request/IsActionable/IsExpired/IsApprovalType, the priority + status
 * badges, the action-button variants (approve/reject vs submit), the close-button
 * wiring to the Close @Output, and the reassign dialog overlay.
 *
 * The pure getters (PriorityLabel/PriorityClass/IsActionable/etc.) are exercised by
 * the class-level node spec in src/__tests__/agent-request-panel.test.ts.
 *
 * `mj-dynamic-form` / `mj-dynamic-form-response` / `mj-loading` are unknown elements
 * here (CUSTOM_ELEMENTS_SCHEMA) — they only render on branches we don't assert across,
 * and stubbing the real DynamicFormsModule adds nothing to these presentational checks.
 */

interface RequestStub {
  ID: string;
  Status: string;
  Priority: number;
  RequestTypeID: string | null;
  Request: string;
  Agent: string | null;
  ExpiresAt: Date | string | null;
  RespondedAt: Date | null;
  __mj_CreatedAt: Date | null;
  Response: string | null;
  ResponseData: string | null;
  ResponseSchema: string | null;
}

function makeRequest(overrides: Partial<RequestStub> = {}): MJAIAgentRequestEntity {
  const base: RequestStub = {
    ID: 'req-001',
    Status: 'Requested',
    Priority: 50,
    RequestTypeID: 'type-001',
    Request: 'Please review the draft.',
    Agent: null,
    ExpiresAt: null,
    RespondedAt: null,
    __mj_CreatedAt: null,
    Response: null,
    ResponseData: null,
    ResponseSchema: null,
    ...overrides,
  };
  return base as unknown as MJAIAgentRequestEntity;
}

function makeType(name: string, id = 'type-001'): MJAIAgentRequestTypeEntity {
  return { ID: id, Name: name } as unknown as MJAIAgentRequestTypeEntity;
}

function render(inputs: {
  Request?: MJAIAgentRequestEntity | null;
  RequestTypes?: MJAIAgentRequestTypeEntity[];
  IsOpen?: boolean;
}): ComponentFixture<AgentRequestPanelComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CommonModule, FormsModule],
    declarations: [AgentRequestPanelComponent],
    providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } }],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
  });
  const fixture = TestBed.createComponent(AgentRequestPanelComponent);
  if (inputs.Request !== undefined) fixture.componentRef.setInput('Request', inputs.Request);
  if (inputs.RequestTypes !== undefined) fixture.componentRef.setInput('RequestTypes', inputs.RequestTypes);
  fixture.componentRef.setInput('IsOpen', inputs.IsOpen ?? true);
  fixture.detectChanges();
  return fixture;
}

describe('AgentRequestPanelComponent (DOM)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  describe('top-level @if gating', () => {
    it('renders nothing when not open', () => {
      const fixture = render({ Request: makeRequest(), IsOpen: false });
      expect(query(fixture, '.request-panel')).toBeNull();
      expect(query(fixture, '.panel-backdrop')).toBeNull();
    });

    it('renders nothing when there is no Request', () => {
      const fixture = render({ Request: null, IsOpen: true });
      expect(query(fixture, '.request-panel')).toBeNull();
    });

    it('renders the panel when open with a Request', () => {
      const fixture = render({ Request: makeRequest(), IsOpen: true });
      expect(query(fixture, '.request-panel')).not.toBeNull();
      expect(query(fixture, '.panel-backdrop')).not.toBeNull();
    });
  });

  describe('header', () => {
    it('shows the request type name as the title', () => {
      const fixture = render({ Request: makeRequest(), RequestTypes: [makeType('Feedback')] });
      expect(text(fixture, '.panel-title')).toBe('Feedback');
    });

    it('falls back to "Agent Request" when no matching type', () => {
      const fixture = render({ Request: makeRequest({ RequestTypeID: 'none' }), RequestTypes: [] });
      expect(text(fixture, '.panel-title')).toBe('Agent Request');
    });

    it('renders the status badge with a status-specific class', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      const badge = query(fixture, '.status-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent?.trim()).toBe('Requested');
      expect(badge!.classList.contains('status-requested')).toBe(true);
    });

    it('renders the priority badge label + class', () => {
      const fixture = render({ Request: makeRequest({ Priority: 90 }) });
      expect(text(fixture, '.priority-badge')).toBe('Critical');
      expect(hasClass(fixture, '.priority-badge', 'priority-critical')).toBe(true);
    });

    it('shows the agent name only when present', () => {
      const without = render({ Request: makeRequest({ Agent: null }) });
      expect(query(without, '.agent-name')).toBeNull();

      const withAgent = render({ Request: makeRequest({ Agent: 'Sage' }) });
      expect(query(withAgent, '.agent-name')?.textContent).toContain('Sage');
    });
  });

  describe('body', () => {
    it('renders the request text', () => {
      const fixture = render({ Request: makeRequest({ Request: 'Approve the budget?' }) });
      expect(text(fixture, '.request-text')).toBe('Approve the budget?');
    });

    it('shows an editable response textarea for actionable requests', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      expect(query(fixture, 'textarea.response-textarea')).not.toBeNull();
    });

    it('hides the response textarea for already-handled requests', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Approved' }) });
      expect(query(fixture, 'textarea.response-textarea')).toBeNull();
    });

    it('shows the existing response text when not actionable', () => {
      const fixture = render({
        Request: makeRequest({ Status: 'Approved', Response: 'Looks good.' }),
      });
      expect(text(fixture, '.response-text')).toBe('Looks good.');
    });
  });

  describe('footer action buttons', () => {
    it('shows Approve + Reject for an Approval-type request', () => {
      const fixture = render({
        Request: makeRequest({ RequestTypeID: 'type-002' }),
        RequestTypes: [makeType('Approval', 'type-002')],
      });
      expect(query(fixture, '.btn-approve')).not.toBeNull();
      expect(query(fixture, '.btn-reject')).not.toBeNull();
      expect(query(fixture, '.btn-respond')).toBeNull();
    });

    it('shows a single Submit Response button for a non-approval request', () => {
      const fixture = render({
        Request: makeRequest({ RequestTypeID: 'type-001' }),
        RequestTypes: [makeType('Feedback', 'type-001')],
      });
      expect(query(fixture, '.btn-respond')).not.toBeNull();
      expect(query(fixture, '.btn-approve')).toBeNull();
      expect(query(fixture, '.btn-reject')).toBeNull();
    });

    it('always offers Reassign and Cancel while actionable', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      expect(query(fixture, '.btn-reassign')).not.toBeNull();
      expect(query(fixture, '.btn-cancel')).not.toBeNull();
    });

    it('renders the expired notice (no action buttons) when expired', () => {
      const past = new Date(Date.now() - 86_400_000).toISOString();
      const fixture = render({ Request: makeRequest({ Status: 'Requested', ExpiresAt: past }) });
      expect(query(fixture, '.expired-notice')).not.toBeNull();
      expect(query(fixture, '.btn-respond')).toBeNull();
      expect(query(fixture, '.btn-approve')).toBeNull();
    });

    it('renders only a Close button when not actionable and not expired', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Approved' }) });
      const footerButtons = queryAll(fixture, '.panel-footer .btn');
      expect(footerButtons.length).toBe(1);
      expect(query(fixture, '.btn-cancel')).not.toBeNull();
    });
  });

  describe('Close @Output wiring', () => {
    it('emits a cancelled result when the close button is clicked', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      const events = capture<AgentRequestPanelResult>(fixture.componentInstance.Close);
      click(fixture, '.close-btn');
      expect(events).toEqual([{ Success: false, Action: 'cancelled' }]);
    });

    it('emits cancelled when the backdrop is clicked', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      const events = capture<AgentRequestPanelResult>(fixture.componentInstance.Close);
      click(fixture, '.panel-backdrop');
      expect(events).toEqual([{ Success: false, Action: 'cancelled' }]);
    });
  });

  describe('reassign dialog', () => {
    it('is hidden until Reassign is clicked, then shown', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      expect(query(fixture, '.reassign-dialog')).toBeNull();

      click(fixture, '.btn-reassign');
      fixture.detectChanges();
      expect(query(fixture, '.reassign-dialog')).not.toBeNull();
    });

    it('disables the reassign submit button until a user is selected', () => {
      const fixture = render({ Request: makeRequest({ Status: 'Requested' }) });
      click(fixture, '.btn-reassign');
      fixture.detectChanges();
      const submit = query(fixture, '.reassign-footer .btn-respond') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });
  });
});
