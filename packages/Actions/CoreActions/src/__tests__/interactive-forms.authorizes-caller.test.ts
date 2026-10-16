/**
 * The interactive-form actions declare `AuthorizesCaller`: each reads only with the caller's
 * permissions, reads entity metadata only, or writes only with the caller's own entity permissions.
 * The form and panel rows they change are the caller's own User-scope rows (create clamps Scope to
 * User; modify, activate and revert refuse any other row through `CheckPersonalWrite`). They also
 * save the `MJ: Components` rows those rows point at. The public `RunAction` mutation therefore lets
 * any authenticated user run them without an `MJ: Action Authorizations` link, and the actions' own
 * checks decide.
 *
 * The engine accepts the marker only when the class declares it itself, so each class must.
 */
import { describe, it, expect } from 'vitest';
import { BaseAction } from '@memberjunction/actions';
import { CreateInteractiveFormAction } from '../custom/interactive-forms/create-interactive-form.action';
import { ModifyInteractiveFormAction } from '../custom/interactive-forms/modify-interactive-form.action';
import { ActivateInteractiveFormVersionAction } from '../custom/interactive-forms/activate-interactive-form-version.action';
import { RevertInteractiveFormAction } from '../custom/interactive-forms/revert-interactive-form.action';
import { GetActiveFormForEntityAction } from '../custom/interactive-forms/get-active-form-for-entity.action';
import { GetDefaultFormScaffoldForEntityAction } from '../custom/interactive-forms/get-default-form-scaffold.action';
import { GetEntitySchemaForFormAction } from '../custom/interactive-forms/get-entity-schema-for-form.action';
import { CalculateExpressionAction } from '../custom/demo/calculate-expression.action';

describe('Interactive-form actions authorize their own caller', () => {
    it.each([
        ['Create Interactive Form', CreateInteractiveFormAction],
        ['Modify Interactive Form', ModifyInteractiveFormAction],
        ['Activate Interactive Form Version', ActivateInteractiveFormVersionAction],
        ['Revert Interactive Form', RevertInteractiveFormAction],
        ['Get Active Form For Entity', GetActiveFormForEntityAction],
        ['Get Default Form Scaffold For Entity', GetDefaultFormScaffoldForEntityAction],
        ['Get Entity Schema For Form', GetEntitySchemaForFormAction],
    ])('%s declares AuthorizesCaller on its own class', (_name, actionClass) => {
        expect(Object.getOwnPropertyDescriptor(actionClass, 'AuthorizesCaller')?.value).toBe(true);
    });

    it('is not declared by an action that runs caller input with no check of its own', () => {
        expect(CalculateExpressionAction.AuthorizesCaller).toBe(false);
        expect(BaseAction.AuthorizesCaller).toBe(false);
    });
});
