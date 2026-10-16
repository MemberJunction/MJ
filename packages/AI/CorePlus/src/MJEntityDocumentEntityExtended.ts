import { BaseEntity, CompositeKey } from "@memberjunction/core";
import { MJEntityDocumentEntity } from "@memberjunction/core-entities";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { TemplateEngineBase } from "@memberjunction/templates-base-types";

/**
 * Extended client-side subclass for `MJ: Entity Documents` that exposes a
 * `TemplateText` virtual property mirroring the underlying linked Template's
 * primary `TemplateContent.TemplateText`. Mirrors the pattern established for
 * `MJ: AI Prompts` (`MJAIPromptEntityExtended`):
 *
 *   - `TemplateText` is NOT a database column on `EntityDocument` — it's read
 *     from the linked Template + TemplateContent via `TemplateEngineBase` on
 *     load, and pushed back to the same Template/TemplateContent records on
 *     save (the save-side wiring lives in `MJEntityDocumentEntityServer` in
 *     `@memberjunction/core-entities-server`).
 *   - Lets `mj-sync` use `TemplateText` in entity-document metadata files
 *     (with `@file:`) just like it does for AI Prompts, instead of having to
 *     manually wire Template + TemplateContent rows.
 *   - `Set('TemplateText', ...)` is routed into this virtual property so
 *     metadata-sync's stringly-typed Set() path works.
 *   - `Dirty` includes `TemplateText` changes so unsaved edits to the template
 *     body keep the EntityDocument dirty, the same way prompts behave.
 */
@RegisterClass(BaseEntity, "MJ: Entity Documents")
export class MJEntityDocumentEntityExtended extends MJEntityDocumentEntity {
    /** Pre-mutation snapshot of TemplateText, used by `TemplateTextDirty` and reset post-Save. */
    protected _originalTemplateText: string = "";
    private _templateText: string = "";

    /**
     * Virtual property holding the active template body for this EntityDocument.
     * Loaded from the linked Template's primary `TemplateContent.TemplateText`
     * on `InnerLoad` / `LoadFromData`; pushed back into that same record on
     * `Save` (server-side subclass).
     */
    public get TemplateText(): string {
        return this._templateText;
    }
    public set TemplateText(value: string) {
        this._templateText = value;
    }
    public get TemplateTextDirty(): boolean {
        return this._templateText !== this._originalTemplateText;
    }

    /** Routes `Set('TemplateText', ...)` into the virtual property so the
     *  stringly-typed Set() path used by metadata-sync / generic code still
     *  works. Everything else falls through to the base implementation. */
    override Set(FieldName: string, Value: any): void {
        if (FieldName?.trim().toLowerCase() === "templatetext") {
            this.TemplateText = Value;
        } else {
            super.Set(FieldName, Value);
        }
    }

    /** `Dirty` must reflect virtual-property edits too — otherwise a save that
     *  ONLY mutates `TemplateText` would skip the server-side template-write
     *  path because the base entity sees no dirty fields. */
    override get Dirty(): boolean {
        if (super.Dirty) return true;
        return this.TemplateTextDirty;
    }

    override async LoadFromData(data: any, replaceOldValues?: boolean): Promise<boolean> {
        const result = await super.LoadFromData(data, replaceOldValues);
        await this.LoadRelatedEntities();
        return result;
    }

    override async InnerLoad(compositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        await this.LoadRelatedEntities();
        return result;
    }

    /**
     * Resolve the linked template body via `TemplateEngineBase`'s cached
     * `TemplateContents` (no extra RunView). If the EntityDocument has no
     * `TemplateID` (initial state before first save), `TemplateText` is set
     * to empty so subsequent edits + Save() go through the create-Template
     * branch in the server subclass.
     *
     * When multiple TemplateContent rows exist for a single Template
     * (priority-stacked, multi-language, etc.), this loads the oldest one —
     * matching the convention used by `MJAIPromptEntityExtended`.
     */
    protected async LoadTemplateText(): Promise<boolean> {
        if (this.TemplateID && !this.TemplateText) {
            const candidates = TemplateEngineBase.Instance.TemplateContents.filter(
                tc => UUIDsEqual(tc.TemplateID, this.TemplateID)
            );
            if (candidates.length > 0) {
                const sorted = candidates.sort((a, b) => {
                    const aTime = a.__mj_CreatedAt ? new Date(a.__mj_CreatedAt).getTime() : 0;
                    const bTime = b.__mj_CreatedAt ? new Date(b.__mj_CreatedAt).getTime() : 0;
                    return aTime - bTime;
                });
                this.TemplateText = sorted[0].TemplateText || "";
                this._originalTemplateText = this.TemplateText;
                return true;
            }
        }
        this.TemplateText = "";
        this._originalTemplateText = "";
        return false;
    }

    /** Ensures the TemplateEngineBase cache is warm, then loads template text. */
    protected async LoadRelatedEntities(): Promise<void> {
        await TemplateEngineBase.Instance.Config(false, this.ContextCurrentUser);
        await this.LoadTemplateText();
    }
}
