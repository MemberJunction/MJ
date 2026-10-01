import {
    BaseEntity,
    EntityDeleteOptions,
    EntitySaveOptions,
    SimpleEmbeddingResult,
    type IMetadataProvider,
} from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJComponentEntityExtended } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";
import { FormScopeRefusalResult } from "./FormScopeGuard";
import { ComponentGuardRefusal, type GuardedComponentRow } from "./FormComponentGuard";

/**
 * Server-side `MJ: Components` entity.
 *
 * Generates the `FunctionalRequirements` and `TechnicalDesign` embeddings on save.
 *
 * Also guards the component behind a full custom form or panel (`ComponentGuardRefusal`). A form
 * or panel draws the component its row points at, and a form's spec can load a component by name,
 * so a change to a component's specification, status, name, namespace or type, or its deletion,
 * changes what other people's forms draw:
 * - without the `Manage Form Defaults` grant, it is allowed only for a component of the caller's
 *   own (`IsCallersOwnComponent`): used by at least one row and only by the caller's own personal
 *   rows, or used by no row and created by the caller;
 * - with the grant, it is allowed unless another user's personal row uses the component.
 * Without the grant, a created or renamed component also may not share its name with another
 * component that is not the caller's own. A save or delete with no caller (a trusted server
 * context) is not checked.
 *
 * The rows, the stored columns and the creator are read in one batch as the caller. The creator is
 * the component's `Create` record in `MJ: Record Changes` with `Source` 'Internal', which the
 * platform writes with every insert and which a caller cannot create through the API. The changed columns are
 * found by comparing with the stored row, not with the values as loaded. When a read fails, the
 * write is refused. The check needs a query and `Validate()` is synchronous, so it runs in `Save()`
 * (an ordinary save and a `ReplayOnly` save alike) and in `Delete()`, before the write.
 */
@RegisterClass(BaseEntity, 'MJ: Components')
export class MJComponentEntityServer extends MJComponentEntityExtended  {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const operation = this.IsSaved ? 'update' : 'create';
        const refusal = await ComponentGuardRefusal(this.guardedRow, operation);
        if (refusal) {
            this.RegisterResultHistoryEntry(FormScopeRefusalResult(operation, refusal));
            return false;
        }
        await this.GenerateEmbeddingsByFieldName([
            { 
                fieldName: "FunctionalRequirements", 
                vectorFieldName: "FunctionalRequirementsVector", 
                modelFieldName: "FunctionalRequirementsVectorEmbeddingModelID" 
            },
            { 
                fieldName: "TechnicalDesign", 
                vectorFieldName: "TechnicalDesignVector", 
                modelFieldName: "TechnicalDesignVectorEmbeddingModelID" 
            }
        ]);
        const saveResult: boolean = await super.Save(options);
        return saveResult;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const refusal = await ComponentGuardRefusal(this.guardedRow, 'delete');
        if (refusal) {
            this.RegisterResultHistoryEntry(FormScopeRefusalResult('delete', refusal));
            return false;
        }
        return super.Delete(options);
    }
 
    /**
     * Simple proxy to local helper method for embeddings. Needed for BaseEntity sub-classes that want to use embeddings built into BaseEntity
     * @param textToEmbed 
     * @returns 
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    /** This component as the guard reads it. Built here because `ActiveUser` is protected on `BaseEntity`. */
    private get guardedRow(): GuardedComponentRow {
        return {
            ActiveUser: this.ActiveUser,
            ID: this.ID,
            Values: {
                Specification: this.Specification,
                Status: this.Status,
                Name: this.Name,
                Type: this.Type,
                Namespace: this.Namespace,
            },
            RunViewProvider: this.RunViewProviderToUse,
            MetadataProvider: this.ProviderToUse as unknown as IMetadataProvider,
        };
    }
}
