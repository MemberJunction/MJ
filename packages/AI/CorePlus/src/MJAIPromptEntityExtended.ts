import { BaseEntity, CompositeKey } from "@memberjunction/core";
import { MJAIPromptEntity, MJTemplateContentEntity, MJTemplateParamEntity } from "@memberjunction/core-entities";
import { compareStringsByLine, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { LinkedTemplateText, type TemplateContentVersion } from "./LinkedTemplateText";

@RegisterClass(BaseEntity, "MJ: AI Prompts")
export class MJAIPromptEntityExtended extends MJAIPromptEntity {
    /** The template text this prompt mirrors from its template's rendered content (shared with entity documents). */
    private readonly linkedTemplateText = new LinkedTemplateText();

    /** The text as last loaded or saved; servers set it after saving the text so the prompt is no longer dirty. */
    protected get _originalTemplateText(): string {
        return this.linkedTemplateText.OriginalText;
    }
    protected set _originalTemplateText(value: string) {
        this.linkedTemplateText.OriginalText = value;
    }

    /**
     * Virtual property to hold the template text.
     * This property is used to create or update the Template and Template Contents entity records automatically
     * whenever the AIPrompt is saved. Reads through to the template engine's cache (see {@link LinkedTemplateText}).
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

    /**
     * Brings the template text up to date with the template engine's cache: adopts the cached rendered
     * content when it is newer than the text's source, never over an unsaved local edit (see {@link LinkedTemplateText}).
     */
    protected RefreshTemplateTextFromCache(): void {
        this.linkedTemplateText.RefreshFrom(this.CurrentTemplateContent());
    }

    /**
     * The template content this prompt renders, from the template engine's cache for this prompt's provider: the same
     * row the AI prompt runner renders (`GetHighestPriorityContent`), so a feature pipeline's prompt version hash changes
     * exactly when the rendered text does. Undefined when the cache does not know the template.
     */
    protected CurrentTemplateContent(): MJTemplateContentEntity | undefined {
        return LinkedTemplateText.RenderedContent(this, this.TemplateID);
    }

    /**
     * Records the content row the template text now matches — call after saving the text into `content`, so the
     * prompt does not take the engine's older cached copy of that row for an edit.
     */
    protected RecordTemplateTextSource(content: TemplateContentVersion): void {
        this.linkedTemplateText.RecordSource(content);
    }

    override Set(FieldName: string, Value: any): void {
        if (FieldName?.trim().toLowerCase() === "templatetext") {
            this.TemplateText = Value;
        }
        else {
            super.Set(FieldName, Value);
        }
    }

    override get Dirty(): boolean {
        const dirty = super.Dirty;
        if (dirty) {
            // if the base entity is dirty, we don't need to check TemplateTextDirty
            return true;
        }
        else if (this.TemplateTextDirty) {
            // if TemplateText is dirty, we consider the entity dirty
            return true;
        }   
        return false;
        // otherwise, return false
//        return super.Dirty || this.TemplateTextDirty;
    }



    /**
     * private property to cache template parameters.
     */
    private _templateParams: MJTemplateParamEntity[] | null = null;

    /**
     * Virtual property to get the template parameters for this AI Prompt.
     * Returns the cached parameters if available, or an empty array if not loaded yet.
     * Call LoadTemplateParams() to ensure params are loaded.
     */
    public get TemplateParams(): MJTemplateParamEntity[] {
        return this._templateParams || [];
    }

    /**
     * Async getter for template parameters that ensures they are loaded.
     * Use this when you need to guarantee the parameters are loaded from the database.
     */
    public async GetTemplateParams(): Promise<MJTemplateParamEntity[]> {
        if (this._templateParams === null) {
            await this.LoadTemplateParams();
        }
        return this._templateParams || [];
    }


    override async LoadFromData(data: any, replaceOldValues?: boolean): Promise<boolean> {
        // call the base class method to load the data
        const result = await super.LoadFromData(data, replaceOldValues);

        await this.LoadRelatedEntities();

        return result;
    }

    /**
     * Loads the template text from the template engine's cache when the record loads. A different content row, or a
     * later version of the row the text came from, replaces the text (and any unsaved edit of it, as a load replaces
     * the record's other fields); a row no newer than the text this prompt saved does not.
     */
    protected async LoadTemplateText() {
        return this.linkedTemplateText.Load(this.CurrentTemplateContent());
    }

    /**
     * Loads the template parameters for this AI Prompt if it has a TemplateID.
     * This method populates the _templateParams array using TemplateEngineBase's cached data.
     */
    protected async LoadTemplateParams(): Promise<boolean> {
        if (this.TemplateID) {
            // Use the template engine's cached TemplateParams instead of RunView
            const params = LinkedTemplateText.EngineFor(this).TemplateParams.filter(tp => UUIDsEqual(tp.TemplateID, this.TemplateID));
            // Sort by Name ASC to match original behavior
            this._templateParams = params.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
            return true;
        } else {
            // No TemplateID, so no params
            this._templateParams = [];
            return true;
        }
    }


    protected async LoadRelatedEntities(): Promise<void> {
        await LinkedTemplateText.EnsureLoaded(this);
        await Promise.all([
            this.LoadTemplateText(),
            this.LoadTemplateParams()
        ]);
    }

    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad);        

        // Load both template text and params in parallel for better performance
        await this.LoadRelatedEntities();
        return result;
    }

}