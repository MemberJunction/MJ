import { BaseEntity, CompositeKey } from "@memberjunction/core";
import { MJEntityDocumentEntity, MJTemplateContentEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { LinkedTemplateText, type TemplateContentVersion } from "./LinkedTemplateText";

/**
 * Extended client-side subclass for `MJ: Entity Documents` that exposes a
 * `TemplateText` virtual property mirroring the content the linked Template
 * renders (its highest-priority `TemplateContent`), as `MJAIPromptEntityExtended` does:
 *
 *   - `TemplateText` is NOT a database column on `EntityDocument` — it's read
 *     from the linked Template + TemplateContent via `TemplateEngineBase` on
 *     load (and read through on every access), and pushed back to the same
 *     Template/TemplateContent records on save (the save-side wiring lives in `MJEntityDocumentEntityServer` in
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
    private readonly linkedTemplateText = new LinkedTemplateText();

    /** Pre-mutation snapshot of TemplateText, used by `TemplateTextDirty` and reset post-Save. */
    protected get _originalTemplateText(): string {
        return this.linkedTemplateText.OriginalText;
    }
    protected set _originalTemplateText(value: string) {
        this.linkedTemplateText.OriginalText = value;
    }

    /**
     * Virtual property holding the active template body for this EntityDocument: the content the linked Template
     * renders, read through the template engine's cache; pushed back into that same row on `Save` (server-side subclass).
     */
    public get TemplateText(): string {
        this.RefreshTemplateTextFromCache();
        return this.linkedTemplateText.Text;
    }
    public set TemplateText(value: string) {
        this.linkedTemplateText.Text = value;
    }
    public get TemplateTextDirty(): boolean {
        return this.linkedTemplateText.Dirty;
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

    /** Adopts the cached rendered content when it is newer than the text's source, never over an unsaved edit. */
    protected RefreshTemplateTextFromCache(): void {
        this.linkedTemplateText.RefreshFrom(this.CurrentTemplateContent());
    }

    /** The content the linked template renders (`GetHighestPriorityContent`), from its provider's template cache. */
    protected CurrentTemplateContent(): MJTemplateContentEntity | undefined {
        return LinkedTemplateText.RenderedContent(this, this.TemplateID);
    }

    /** Records the content row the template text now matches; the server subclass calls it after saving the text. */
    protected RecordTemplateTextSource(content: TemplateContentVersion): void {
        this.linkedTemplateText.RecordSource(content);
    }

    /**
     * Resolves the linked template body from the template engine's cache. Without a `TemplateID` (before the first
     * save) the text is empty, so a later edit and Save() go through the create-Template branch in the server subclass.
     */
    protected async LoadTemplateText(): Promise<boolean> {
        return this.linkedTemplateText.Load(this.CurrentTemplateContent());
    }

    /** Ensures the template engine cache is warm, then loads template text. */
    protected async LoadRelatedEntities(): Promise<void> {
        await LinkedTemplateText.EnsureLoaded(this);
        await this.LoadTemplateText();
    }
}
