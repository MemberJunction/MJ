import { describe, it, expect } from 'vitest';

import { ComponentSpec, ComponentRole } from '../index';
import {
    FormEventNames,
    FormMethodNames,
    isFormRole,
    type FormHostProps,
} from '../forms';

describe('forms subpath — contract sanity', () => {

    describe('ComponentRole', () => {
        it('accepts the documented role values via ComponentSpec.componentRole', () => {
            const spec = new ComponentSpec();
            const roles: ComponentRole[] = ['form', 'dashboard', 'widget', 'report', 'detail-pane'];
            for (const role of roles) {
                spec.componentRole = role;
                expect(spec.componentRole).toBe(role);
            }
        });
    });

    describe('isFormRole', () => {
        it('returns true only when componentRole === "form"', () => {
            expect(isFormRole({ componentRole: 'form' })).toBe(true);
            expect(isFormRole({ componentRole: 'dashboard' })).toBe(false);
            expect(isFormRole({ componentRole: undefined })).toBe(false);
            expect(isFormRole({})).toBe(false);
        });
    });

    describe('FormEventNames', () => {
        // These strings are the public contract — agents, Studio templates,
        // and hand-written components all reference them by exact name.
        // Changing one is a breaking change to that contract.
        it('uses stable string values', () => {
            expect(FormEventNames.BeforeSave).toBe('BeforeSave');
            expect(FormEventNames.AfterSave).toBe('AfterSave');
            expect(FormEventNames.BeforeDelete).toBe('BeforeDelete');
            expect(FormEventNames.AfterDelete).toBe('AfterDelete');
            expect(FormEventNames.EditModeChangeRequested).toBe('EditModeChangeRequested');
            expect(FormEventNames.FieldChanged).toBe('FieldChanged');
            expect(FormEventNames.DirtyStateChanged).toBe('DirtyStateChanged');
            expect(FormEventNames.ValidationChanged).toBe('ValidationChanged');
        });

        it('keeps each Before event paired with its After', () => {
            // Each cancelable Before must have its After companion present —
            // hosts rely on this pairing for save/delete flow timing.
            const befores = Object.values(FormEventNames).filter(n => n.startsWith('Before'));
            for (const before of befores) {
                const after = before.replace('Before', 'After');
                expect(Object.values(FormEventNames)).toContain(after);
            }
        });
    });

    describe('FormMethodNames', () => {
        it('uses stable string values', () => {
            expect(FormMethodNames.RequestSave).toBe('RequestSave');
            expect(FormMethodNames.RequestCancel).toBe('RequestCancel');
            expect(FormMethodNames.SetEditMode).toBe('SetEditMode');
            expect(FormMethodNames.GetFieldValue).toBe('GetFieldValue');
            expect(FormMethodNames.SetFieldValue).toBe('SetFieldValue');
        });
    });

    describe('FormHostProps shape', () => {
        // Compile-time structural check — if any required field is dropped
        // from FormHostProps this build will fail. Provides a stable target
        // for components built against this contract.
        it('accepts the documented field surface', () => {
            const props: FormHostProps = {
                entityName: 'Customer',
                primaryKey: { ID: 'abc-123' },
                record: { ID: 'abc-123', Name: 'Acme' },
                entityMetadata: { fields: [], displayName: 'Customer', nameField: 'Name' },
                mode: 'view',
                canEdit: true,
                canDelete: false,
                canCreate: true,
            };
            expect(props.entityName).toBe('Customer');
        });

        it('allows null primaryKey for new-record flows', () => {
            const props: FormHostProps = {
                entityName: 'Customer',
                primaryKey: null,
                record: {},
                entityMetadata: { fields: [], displayName: 'Customer' },
                mode: 'create',
                canEdit: true,
                canDelete: false,
                canCreate: true,
            };
            expect(props.primaryKey).toBeNull();
            expect(props.mode).toBe('create');
        });
    });
});
