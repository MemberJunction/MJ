import { BaseEntity, DatabaseProviderBase, EntityInfo, EntitySaveOptions, LogError, Metadata } from "@memberjunction/core";
import { MJRemoteOperationEntity, MJRemoteOperationEntity_RemoteOperationLibrary } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { DocumentationEngine, MJLibraryEntityExtended, MJLibraryItemEntityExtended } from "@memberjunction/doc-utils";

/** The shape `GenerateCode()` returns — the AI-authored body + its explanation + the libraries it declared. */
interface RemoteOperationGeneratedCode {
    Success: boolean;
    Code: string;
    Comments: string;
    Libraries: MJRemoteOperationEntity_RemoteOperationLibrary[];
}

/**
 * Server-only subclass for the `MJ: Remote Operations` entity — the RO-4 "AI-from-Description" half of the
 * Remote Operations primitive. When an `AI`-generation operation's `Description` changes, `Save()` asks the
 * `Generate Remote Operation Code` prompt to author the body of `InternalExecute` (against the ambient
 * contract: typed `input`, `provider`, `user`, `context`), stores it in `Code`, records the libraries the
 * body uses in `LibrariesObject`, and resets `CodeApprovalStatus` to `Pending` for human review. CodeGen's
 * {@link import('@memberjunction/codegen-lib').RemoteOperationGeneratorBase} then emits the registered class
 * from the approved `Code` + `LibrariesObject` — no hand-written subclass required.
 *
 * Mirrors `MJActionEntityServer` (the Generated-Actions pipeline); the library list is a JSONType field, so
 * there is no junction CRUD — `this.LibrariesObject = ...` is the whole "manage libraries" step.
 */
@RegisterClass(BaseEntity, 'MJ: Remote Operations') // high priority — ensure this server subclass wins over the generated entity
export class MJRemoteOperationEntityServer extends MJRemoteOperationEntity {
    /**
     * Transient (never persisted) flag — set it before `Save()` to force regeneration even when `Description`
     * is unchanged. Reset to false after every save, exactly like Action.ForceCodeGeneration.
     */
    public ForceCodeGeneration = false;

    constructor(Entity: EntityInfo) {
        super(Entity);
        // Constructor runs before the entity provider is wired, so the global Metadata is the only check available.
        const md = new Metadata(); // global-provider-ok: constructor-time provider-type check
        if (md.ProviderType !== 'Database') {
            throw new Error('MJRemoteOperationEntityServer is server/database-only — remove @memberjunction/core-entities-server from client applications.');
        }
    }

    /**
     * Save override: (re)generates the AI body when needed, within a transaction so a generation/save failure
     * leaves no partial state.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        await AIEngine.Instance.Config(false, this.ContextCurrentUser);
        await DocumentationEngine.Instance.Config(false, this.ContextCurrentUser);

        const provider = this.ProviderToUse as unknown as DatabaseProviderBase;
        await provider.BeginTransaction();
        try {
            if (this.ShouldRegenerate()) {
                const result = await this.GenerateCode();
                if (!result.Success) {
                    throw new Error(`Failed to generate code for Remote Operation '${this.Name}': ${result.Comments}`);
                }
                this.Code = result.Code;
                this.CodeComments = result.Comments;
                this.CodeApprovalStatus = 'Pending'; // re-review required whenever the body changes
                this.CodeApprovedAt = null;
                this.CodeApprovedByUserID = null;
                this.LibrariesObject = result.Libraries; // JSONType setter — serializes to the Libraries column
            }
            this.ForceCodeGeneration = false; // never persists past one Save

            if (await super.Save(options)) {
                await provider.CommitTransaction();
                return true;
            }
            await provider.RollbackTransaction();
            return false;
        } catch (e) {
            await provider.RollbackTransaction();
            throw e;
        }
    }

    /** AI regeneration runs only for `GenerationType='AI'` ops whose `Description` changed (or new/forced) and that aren't locked. */
    protected ShouldRegenerate(): boolean {
        return (
            this.GenerationType === 'AI' &&
            !this.CodeLocked &&
            (this.GetFieldByName('Description').Dirty || !this.IsSaved || this.ForceCodeGeneration)
        );
    }

    /**
     * Asks the `Generate Remote Operation Code` prompt to author the body of `InternalExecute` from this op's
     * Description + typed I/O contract + the available libraries. Returns the body, an explanation, and the
     * declared libraries; never throws for a logical model failure (returns `Success: false`).
     */
    public async GenerateCode(): Promise<RemoteOperationGeneratedCode> {
        try {
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);
            const aiPrompt = AIEngine.Instance.Prompts.find((p) => p.Name === 'Generate Remote Operation Code');
            if (!aiPrompt) {
                throw new Error('Failed to find AI prompt template: "Generate Remote Operation Code"');
            }

            const runner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = this.PreparePromptData();
            params.contextUser = this.ContextCurrentUser;

            const result = await runner.ExecutePrompt<{
                code: string;
                explanation: string;
                libraries: Array<{ Library: string; ItemsUsed: string[] }>;
            }>(params);

            if (result.success && result.result) {
                return {
                    Success: true,
                    Code: (result.result.code ?? '').trim(),
                    Comments: result.result.explanation ?? '',
                    Libraries: (result.result.libraries ?? [])
                        .filter((l) => !!l?.Library)
                        .map((l) => ({ Library: l.Library, ItemsUsed: l.ItemsUsed ?? [] })),
                };
            }
            return { Success: false, Code: '', Comments: result.errorMessage ?? 'Failed to generate code', Libraries: [] };
        } catch (e) {
            LogError(e);
            throw e;
        }
    }

    /** Builds the template variables consumed by remote-operation-generation.template.md. */
    protected PreparePromptData(): Record<string, unknown> {
        return {
            name: this.Name,
            operationKey: this.OperationKey,
            executionMode: this.ExecutionMode,
            description: this.Description ?? '',
            inputTypeName: this.InputTypeName ?? 'unknown',
            inputTypeDefinition: this.InputTypeDefinition ?? '',
            outputTypeName: this.OutputTypeName ?? 'unknown',
            outputTypeDefinition: this.OutputTypeDefinition ?? '',
            availableLibraries: this.GenerateLibrariesContext(),
        };
    }

    /** The libraries an authored body may import from, with their documentation — reused verbatim from the Action pipeline. */
    protected GenerateLibrariesContext(): Array<{ Name: string; Description: string; Items: Array<{ Name: string; Content: string }> }> {
        return DocumentationEngine.Instance.Libraries.map((library: MJLibraryEntityExtended) => ({
            Name: library.Name,
            Description: library.Description,
            Items: library.Items.map((item: MJLibraryItemEntityExtended) => ({ Name: item.Name, Content: item.HTMLContent })),
        }));
    }
}
