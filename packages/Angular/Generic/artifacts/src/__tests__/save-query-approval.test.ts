// The node preset has no Angular linker; the JIT compiler lets partially compiled Angular libraries load.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';

const { approval } = vi.hoisted(() => ({ approval: { allowed: false, calls: [] as unknown[][] } }));
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        UserCanApproveQueries: (...args: unknown[]) => {
            approval.calls.push(args);
            return approval.allowed;
        },
    };
});

import { SaveQueryPanelComponent } from '../lib/components/plugins/save-query-dialog.component';

/**
 * Saving a query from a conversation (#6746): anyone who may create queries saves a draft
 * (Pending); a user who may approve queries can save it as Approved, which is the default for them.
 */

class InertChangeDetector extends ChangeDetectorRef {
    markForCheck(): void { /* no view */ }
    detach(): void { /* no view */ }
    detectChanges(): void { /* no view */ }
    checkNoChanges(): void { /* no view */ }
    reattach(): void { /* no view */ }
}

const CURRENT_USER = { ID: 'u-1', Name: 'Pat' };
const PROVIDER = { CurrentUser: CURRENT_USER, Authorizations: [] } as unknown as IMetadataProvider;

function panel(): SaveQueryPanelComponent {
    const dialog = new SaveQueryPanelComponent(new InertChangeDetector());
    dialog.Provider = PROVIDER;
    return dialog;
}

describe('SaveQueryPanelComponent approval', () => {
    beforeEach(() => {
        approval.allowed = false;
        approval.calls = [];
    });

    it('asks about the dialog provider\'s current user', () => {
        expect(panel().CanApprove).toBe(false);
        expect(approval.calls[0]).toEqual([CURRENT_USER, PROVIDER]);
    });

    it('saves a draft for a user who cannot approve, even with the approve box left on', () => {
        const dialog = panel();
        expect(dialog.ApproveOnSave).toBe(true);
        expect(dialog['statusToSave']).toBe('Pending');
    });

    it('saves as Approved by default for a user who can approve', () => {
        approval.allowed = true;
        expect(panel()['statusToSave']).toBe('Approved');
    });

    it('saves a draft when a user who can approve unticks the box', () => {
        approval.allowed = true;
        const dialog = panel();
        dialog.ApproveOnSave = false;
        expect(dialog['statusToSave']).toBe('Pending');
    });
});
