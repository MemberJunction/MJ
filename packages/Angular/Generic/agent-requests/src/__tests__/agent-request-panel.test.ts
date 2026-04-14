import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for AgentRequestPanelComponent pure logic.
 * All Angular decorators and DI mocked — we test computed getters and state transitions.
 */

vi.mock('@angular/core', () => ({
    Component: () => (target: Function) => target,
    Input: () => () => {},
    Output: () => () => {},
    ChangeDetectorRef: class { markForCheck() {} detectChanges() {} },
    ChangeDetectionStrategy: { OnPush: 1 },
    OnInit: class {},
    OnDestroy: class {},
    HostListener: () => () => {},
    ViewChild: () => () => {},
    ElementRef: class {},
    EventEmitter: class { emit = vi.fn(); subscribe = vi.fn(); },
}));

vi.mock('@memberjunction/core', () => ({
    RunView: function RunView() { return { RunView: vi.fn() }; },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentRequestEntity: class {},
    MJAIAgentRequestTypeEntity: class {},
    UserInfoEngine: { Instance: { GetSetting: vi.fn().mockReturnValue(null), SetSettingDebounced: vi.fn() } },
}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));

vi.mock('@memberjunction/ng-notifications', () => ({
    MJNotificationService: class { CreateSimpleNotification = vi.fn(); },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AgentResponseForm: class {},
}));

vi.mock('@memberjunction/ng-forms', () => ({
    DynamicFormComponent: class {},
}));

import { AgentRequestPanelComponent } from '../lib/panels/agent-request-panel/agent-request-panel.component';

function createMockRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'req-001', Status: 'Requested', Priority: 50,
        RequestTypeID: 'type-001', RequestForUserID: 'user-001',
        ExpiresAt: null, ResponseSchema: null, Response: null,
        ResponseData: null, Comments: null,
        Save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

function createMockRequestType(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { ID: 'type-001', Name: 'Feedback', ...overrides };
}

describe('AgentRequestPanelComponent', () => {
    let component: AgentRequestPanelComponent;
    const mockCdr = { markForCheck: vi.fn(), detectChanges: vi.fn() };
    const mockNotification = { CreateSimpleNotification: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        component = new AgentRequestPanelComponent(mockCdr as never, mockNotification as never);
    });

    describe('PriorityLabel', () => {
        it('should return empty string when no request', () => {
            component.Request = null;
            expect(component.PriorityLabel).toBe('');
        });

        it('should return "Low" for priority <= 25', () => {
            component.Request = createMockRequest({ Priority: 10 }) as never;
            expect(component.PriorityLabel).toBe('Low');
        });

        it('should return "Low" for priority exactly 25', () => {
            component.Request = createMockRequest({ Priority: 25 }) as never;
            expect(component.PriorityLabel).toBe('Low');
        });

        it('should return "Normal" for priority 26-50', () => {
            component.Request = createMockRequest({ Priority: 50 }) as never;
            expect(component.PriorityLabel).toBe('Normal');
        });

        it('should return "High" for priority 51-75', () => {
            component.Request = createMockRequest({ Priority: 75 }) as never;
            expect(component.PriorityLabel).toBe('High');
        });

        it('should return "Critical" for priority > 75', () => {
            component.Request = createMockRequest({ Priority: 100 }) as never;
            expect(component.PriorityLabel).toBe('Critical');
        });
    });

    describe('PriorityClass', () => {
        it('should return empty string when no request', () => {
            component.Request = null;
            expect(component.PriorityClass).toBe('');
        });

        it('should return "priority-low" for priority <= 25', () => {
            component.Request = createMockRequest({ Priority: 10 }) as never;
            expect(component.PriorityClass).toBe('priority-low');
        });

        it('should return "priority-normal" for priority 26-50', () => {
            component.Request = createMockRequest({ Priority: 40 }) as never;
            expect(component.PriorityClass).toBe('priority-normal');
        });

        it('should return "priority-high" for priority 51-75', () => {
            component.Request = createMockRequest({ Priority: 60 }) as never;
            expect(component.PriorityClass).toBe('priority-high');
        });

        it('should return "priority-critical" for priority > 75', () => {
            component.Request = createMockRequest({ Priority: 90 }) as never;
            expect(component.PriorityClass).toBe('priority-critical');
        });
    });

    describe('IsActionable', () => {
        it('should return true when status is Requested', () => {
            component.Request = createMockRequest({ Status: 'Requested' }) as never;
            expect(component.IsActionable).toBe(true);
        });

        it('should return false when status is Approved', () => {
            component.Request = createMockRequest({ Status: 'Approved' }) as never;
            expect(component.IsActionable).toBe(false);
        });

        it('should return false when request is null', () => {
            component.Request = null;
            expect(component.IsActionable).toBe(false);
        });
    });

    describe('IsApprovalType', () => {
        it('should return true when request type is Approval', () => {
            component.Request = createMockRequest({ RequestTypeID: 'type-002' }) as never;
            component.RequestTypes = [createMockRequestType({ ID: 'type-002', Name: 'Approval' })] as never;
            expect(component.IsApprovalType).toBe(true);
        });

        it('should return false when request type is not Approval', () => {
            component.Request = createMockRequest({ RequestTypeID: 'type-001' }) as never;
            component.RequestTypes = [createMockRequestType({ ID: 'type-001', Name: 'Feedback' })] as never;
            expect(component.IsApprovalType).toBe(false);
        });

        it('should return false when no matching request type', () => {
            component.Request = createMockRequest({ RequestTypeID: 'nonexistent' }) as never;
            component.RequestTypes = [createMockRequestType()] as never;
            expect(component.IsApprovalType).toBe(false);
        });
    });

    describe('IsExpired', () => {
        it('should return false when ExpiresAt is null', () => {
            component.Request = createMockRequest({ ExpiresAt: null }) as never;
            expect(component.IsExpired).toBe(false);
        });

        it('should return true when ExpiresAt is in the past', () => {
            component.Request = createMockRequest({ ExpiresAt: new Date(Date.now() - 86400000).toISOString() }) as never;
            expect(component.IsExpired).toBe(true);
        });

        it('should return false when ExpiresAt is in the future', () => {
            component.Request = createMockRequest({ ExpiresAt: new Date(Date.now() + 86400000).toISOString() }) as never;
            expect(component.IsExpired).toBe(false);
        });
    });

    describe('HasResponseForm', () => {
        it('should return false when null', () => {
            component.ResponseFormDefinition = null;
            expect(component.HasResponseForm).toBe(false);
        });

        it('should return false when questions is empty', () => {
            component.ResponseFormDefinition = { questions: [] } as never;
            expect(component.HasResponseForm).toBe(false);
        });

        it('should return true when questions has items', () => {
            component.ResponseFormDefinition = { questions: [{ id: 'q1' }] } as never;
            expect(component.HasResponseForm).toBe(true);
        });
    });

    describe('RequestType lookup', () => {
        it('should return matching request type (case-insensitive UUID)', () => {
            const reqType = createMockRequestType({ ID: 'TYPE-001', Name: 'Approval' });
            component.Request = createMockRequest({ RequestTypeID: 'type-001' }) as never;
            component.RequestTypes = [reqType] as never;
            expect(component.RequestType).toBe(reqType);
        });

        it('should return null when no RequestTypeID', () => {
            component.Request = createMockRequest({ RequestTypeID: null }) as never;
            expect(component.RequestType).toBeNull();
        });

        it('should return null when no request', () => {
            component.Request = null;
            expect(component.RequestType).toBeNull();
        });
    });

    describe('OnCancel', () => {
        it('should close panel and emit cancelled', () => {
            component.IsOpen = true;
            component.OnCancel();
            expect(component.IsOpen).toBe(false);
            expect(component.Close.emit).toHaveBeenCalledWith({ Success: false, Action: 'cancelled' });
        });
    });

    describe('OnReassignClick', () => {
        it('should open reassign dialog and reset state', () => {
            component.ReassignSearchTerm = 'old';
            component.ReassignNote = 'old';
            component.ReassignUsers = [{ ID: '1', Name: 'X', Email: 'x@x.com' }];
            component.SelectedReassignUser = { ID: '1', Name: 'X', Email: 'x@x.com' };
            component.OnReassignClick();
            expect(component.ShowReassignDialog).toBe(true);
            expect(component.ReassignSearchTerm).toBe('');
            expect(component.ReassignNote).toBe('');
            expect(component.ReassignUsers).toEqual([]);
            expect(component.SelectedReassignUser).toBeNull();
        });
    });

    describe('OnReassignCancel', () => {
        it('should close reassign dialog', () => {
            component.ShowReassignDialog = true;
            component.OnReassignCancel();
            expect(component.ShowReassignDialog).toBe(false);
        });
    });

    describe('OnSelectReassignUser', () => {
        it('should set selected user', () => {
            const user = { ID: 'u1', Name: 'Alice', Email: 'a@b.com' };
            component.OnSelectReassignUser(user);
            expect(component.SelectedReassignUser).toBe(user);
        });
    });

    describe('OnReassignSearchChange', () => {
        it('should clear users for short search terms', () => {
            component.ReassignUsers = [{ ID: '1', Name: 'X', Email: 'x@x.com' }];
            component.OnReassignSearchChange('a');
            expect(component.ReassignUsers).toEqual([]);
        });

        it('should set search term', () => {
            component.OnReassignSearchChange('alice');
            expect(component.ReassignSearchTerm).toBe('alice');
        });
    });

    describe('Panel width', () => {
        it('should default to 520', () => {
            expect(component.PanelWidth).toBe(520);
        });
    });

    describe('OnEscapeKey', () => {
        it('should cancel when open', () => {
            component.IsOpen = true;
            const spy = vi.spyOn(component, 'OnCancel');
            component.OnEscapeKey();
            expect(spy).toHaveBeenCalled();
        });

        it('should not cancel when closed', () => {
            component.IsOpen = false;
            const spy = vi.spyOn(component, 'OnCancel');
            component.OnEscapeKey();
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('OnBackdropClick', () => {
        it('should delegate to OnCancel', () => {
            const spy = vi.spyOn(component, 'OnCancel');
            component.OnBackdropClick();
            expect(spy).toHaveBeenCalled();
        });
    });
});
