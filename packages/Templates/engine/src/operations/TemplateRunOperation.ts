/**
 * @fileoverview Server implementation of the `Template.Run` Remote Operation — renders a template by ID
 * with optional render data. Extends the CodeGen-emitted {@link TemplateRunOperation} base in
 * `@memberjunction/core-entities` (`generated/remote_operations.ts` — operation key + typed I/O, from the
 * `MJ: Remote Operations` row) and supplies the server body via `TemplateEngineServer`. Registered under
 * `Template.Run`; replaces the bespoke `RunTemplate` GraphQL
 * resolver (which remains as a deprecated backcompat shim).
 * @module @memberjunction/templates
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { TemplateRunOperation, type TemplateRunInput, type TemplateRunOutput } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '../TemplateEngine';

@RegisterClass(BaseRemotableOperation, 'Template.Run')
export class TemplateRunServerOperation extends TemplateRunOperation {
    protected async InternalExecute(input: TemplateRunInput, provider: IMetadataProvider, user: UserInfo): Promise<TemplateRunOutput> {
        if (!input?.templateID) {
            throw new Error('templateID is required');
        }
        const startTime = Date.now();

        const templateEntity = await provider.GetEntityObject<MJTemplateEntityExtended>('MJ: Templates', user);
        await templateEntity.Load(input.templateID);
        if (!templateEntity.IsSaved) {
            throw new Error(`Template with ID ${input.templateID} not found`);
        }

        // Highest-priority content for the template.
        const contentResult = await RunView.FromMetadataProvider(provider).RunView<MJTemplateContentEntity>({
            EntityName: 'MJ: Template Contents',
            ExtraFilter: `TemplateID = '${input.templateID}'`,
            OrderBy: 'Priority ASC',
            MaxRows: 1,
            ResultType: 'entity_object',
        }, user);
        if (!contentResult.Results?.length) {
            throw new Error(`No template content found for template ${templateEntity.Name}`);
        }

        await TemplateEngineServer.Instance.Config(true /* refresh to get latest templates */, user, provider);
        const result = await TemplateEngineServer.Instance.RenderTemplate(
            templateEntity,
            contentResult.Results[0],
            input.data ?? {},
            true /* skip validation for execution */,
        );
        if (!result.Success) {
            throw new Error(result.Message ?? 'Template render failed');
        }

        return { output: result.Output ?? '', executionTimeMs: Date.now() - startTime };
    }
}
