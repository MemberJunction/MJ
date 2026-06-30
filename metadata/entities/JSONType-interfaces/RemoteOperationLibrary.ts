/**
 * One library that an AI-authored Remote Operation body imports. CodeGen turns the `LibrariesObject` array
 * (the strongly-typed accessor bound to `MJ: Remote Operations.Libraries` via JSONType metadata) into one
 * `import { ...ItemsUsed } from "Library"` per entry at the top of the generated `remote_operations.ts`.
 * The always-available default libraries (RunView / Metadata / RunQuery from @memberjunction/core) are NOT
 * listed here — they are emitted for every operation automatically.
 */
export interface RemoteOperationLibrary {
    /** The npm package to import from, e.g. "@memberjunction/ai-prompts". */
    Library: string;
    /** The exported items used from that package, e.g. ["AIPromptRunner"]. */
    ItemsUsed: string[];
}
