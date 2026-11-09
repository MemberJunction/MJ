import { BaseEntity, BaseEntityResult, EntityDeleteOptions, LogError, RunInEntityTransaction } from "@memberjunction/core";
import { MJTemplateEntityExtended, MJTemplateParamEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

/**
 * Server-only subclass for `MJ: Templates`.
 *
 * Saving a Template Content derives `MJ: Template Params` rows from the template text
 * (see `MJTemplateContentEntityServer`). Those rows carry a NOT NULL foreign key to the
 * template, and nothing outside the server knows their IDs, so a declarative delete
 * (`mj sync push` with `deleteRecord`) could never remove the template.
 *
 * `Delete()` therefore removes every param of the template first, one by one through
 * `BaseEntity` so Record Changes and entity events fire, then deletes the template, all in one
 * transaction. A param cannot exist without its template, and there is no column that tells
 * derived params from hand-written ones, so all of them go.
 *
 * Nothing else is touched. AI Prompts, Entity Documents and the other tables that reference a
 * template still block the delete through their foreign keys. `CascadeDeletes` is deliberately
 * not used: the generated cascade would delete those rows too.
 */
@RegisterClass(BaseEntity, 'MJ: Templates')
export class MJTemplateEntityServer extends MJTemplateEntityExtended {
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        try {
            return await RunInEntityTransaction(this.ProviderToUse, async () => {
                await this.deleteTemplateParams();
                if (!(await super.Delete(options))) {
                    // Throw so the param deletes above roll back with the failed template delete.
                    throw new TemplateDeleteFailed(this.LatestResult?.CompleteMessage ?? 'template delete failed');
                }
                return true;
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`Failed to delete template ${this.ID}: ${message}`);
            if (!(e instanceof TemplateDeleteFailed)) {
                // The base delete already recorded its own result; record ours only for failures it never saw.
                this.recordDeleteFailure(message);
            }
            return false;
        }
    }

    /** Deletes every `MJ: Template Params` row for this template, stopping at the first failure. */
    private async deleteTemplateParams(): Promise<void> {
        const result = await this.RunViewProviderToUse.RunView<MJTemplateParamEntity>({
            EntityName: 'MJ: Template Params',
            ExtraFilter: `TemplateID='${this.ID}'`,
            ResultType: 'entity_object',
        }, this.ContextCurrentUser);
        if (!result.Success) {
            throw new Error(`could not load the template's params: ${result.ErrorMessage}`);
        }
        // Sequential: the deletes share one transaction on this provider.
        for (const param of result.Results ?? []) {
            if (!(await param.Delete())) {
                throw new Error(`could not delete template param '${param.Name}': ${param.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    private recordDeleteFailure(message: string): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = 'delete';
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }
}

/** Marks a failure the base delete already recorded on the result history. */
class TemplateDeleteFailed extends Error {}
