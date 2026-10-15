import { BaseEntity, IMetadataProvider } from "@memberjunction/core";
import { MJTemplateContentEntity, MJTemplateEntityExtended } from "@memberjunction/core-entities";
import { EscapeSQLString, UUIDsEqual } from "@memberjunction/global";
import { TemplateEngineBase } from "@memberjunction/templates-base-types";

/** The Template Content fields {@link LinkedTemplateText.ReadRenderedText} reads: the selection's fields and the text. */
type RenderedContentRow = Pick<MJTemplateContentEntity, 'ID' | 'Type' | 'Priority' | '__mj_CreatedAt' | 'TemplateText'>;

/** The Template Content fields that identify a version of a row: its ID and its `__mj_UpdatedAt`. */
export type TemplateContentVersion = Pick<MJTemplateContentEntity, 'ID' | '__mj_UpdatedAt'>;

/** The content row a template text came from, and that row's `__mj_UpdatedAt` (epoch ms) at the time. */
interface TemplateTextSource {
    ContentID: string;
    UpdatedAt: number;
}

/**
 * The template text an entity (`MJ: AI Prompts`, `MJ: Entity Documents`) mirrors from the content its linked Template
 * renders. Reads through to the template engine's cache, so a saved Template Content is picked up without a restart;
 * a cached row is adopted only when it is newer than the text's source, and never over an unsaved local edit.
 */
export class LinkedTemplateText {
    private text = '';
    private originalText = '';
    private source: TemplateTextSource | null = null;

    /** The current text, including an unsaved local edit. */
    public get Text(): string {
        return this.text;
    }
    public set Text(value: string) {
        this.text = value;
    }

    /** The text as last loaded or saved: what {@link Dirty} compares against. */
    public get OriginalText(): string {
        return this.originalText;
    }
    public set OriginalText(value: string) {
        this.originalText = value;
    }

    /** Whether the text has an unsaved local edit. */
    public get Dirty(): boolean {
        return this.text !== this.originalText;
    }

    /** Adopts `content` when it is newer than the text's source; never over an unsaved local edit. */
    public RefreshFrom(content: MJTemplateContentEntity | undefined): void {
        if (this.Dirty || !content || !this.IsNewerThanSource(content)) {
            return;
        }
        this.Adopt(content);
    }

    /**
     * Loads the text when its record loads: a newer content row replaces it (and any unsaved edit); no content clears it.
     * @returns true when the template has content
     */
    public Load(content: MJTemplateContentEntity | undefined): boolean {
        if (content) {
            if (this.IsNewerThanSource(content)) {
                this.Adopt(content);
            }
            return true;
        }
        this.text = '';
        this.originalText = '';
        this.source = null;
        return false;
    }

    /** Records the content row the text now matches; call after saving the text into `content`. */
    public RecordSource(content: TemplateContentVersion): void {
        this.source = { ContentID: content.ID, UpdatedAt: LinkedTemplateText.updatedAt(content) };
    }

    /** True when `content` is not the row the text came from, or is a later version of it. */
    protected IsNewerThanSource(content: TemplateContentVersion): boolean {
        if (!this.source || !UUIDsEqual(this.source.ContentID, content.ID)) {
            return true;
        }
        return LinkedTemplateText.updatedAt(content) > this.source.UpdatedAt;
    }

    /** Takes the text of `content` as the current, unmodified text. */
    protected Adopt(content: MJTemplateContentEntity): void {
        this.text = content.TemplateText || '';
        this.originalText = this.text;
        this.RecordSource(content);
    }

    /** The template engine for the entity's provider: its own instance when it names a connection, else the global one. */
    public static EngineFor(entity: BaseEntity): TemplateEngineBase {
        const provider = LinkedTemplateText.ProviderOf(entity);
        if (provider?.InstanceConnectionString) {
            return TemplateEngineBase.GetProviderInstance<TemplateEngineBase>(provider, TemplateEngineBase) as TemplateEngineBase;
        }
        return TemplateEngineBase.Instance;
    }

    /** The content row the entity's linked template renders, from its provider's template cache; undefined when unknown. */
    public static RenderedContent(entity: BaseEntity, templateID: string | null): MJTemplateContentEntity | undefined {
        return templateID ? LinkedTemplateText.EngineFor(entity).FindRenderedContent(templateID) : undefined;
    }

    /** Loads the entity's provider's template cache when it has not loaded yet. */
    public static async EnsureLoaded(entity: BaseEntity): Promise<void> {
        await LinkedTemplateText.EngineFor(entity).Config(false, entity.ContextCurrentUser, LinkedTemplateText.ProviderOf(entity));
    }

    /**
     * The text the entity's linked template renders, read through the entity's own provider, so a Template Content row
     * written earlier in the same open transaction is seen (the engine cache reloads only after commit).
     * @returns the rendered row's text; undefined when the template has no content row
     * @throws Error when the template's content rows cannot be read
     */
    public static async ReadRenderedText(entity: BaseEntity, templateID: string): Promise<string | undefined> {
        const result = await entity.RunViewProviderToUse.RunView<RenderedContentRow>({
            EntityName: 'MJ: Template Contents',
            ExtraFilter: `TemplateID='${EscapeSQLString(templateID)}'`,
            Fields: ['ID', 'Type', 'Priority', '__mj_CreatedAt', 'TemplateText'],
        }, entity.ContextCurrentUser);
        if (!result.Success) {
            throw new Error(`The content of template '${templateID}' could not be read: ${result.ErrorMessage}`);
        }
        const rendered = MJTemplateEntityExtended.SelectHighestPriorityContent(result.Results);
        return rendered ? rendered.TemplateText || '' : undefined;
    }

    /** The entity's provider as a metadata provider (`BaseEntity.ProviderToUse` is typed as its entity-data side). */
    public static ProviderOf(entity: BaseEntity): IMetadataProvider | undefined {
        return entity.ProviderToUse as unknown as IMetadataProvider | undefined;
    }

    private static updatedAt(content: TemplateContentVersion): number {
        return content.__mj_UpdatedAt ? new Date(content.__mj_UpdatedAt).getTime() : 0;
    }
}
