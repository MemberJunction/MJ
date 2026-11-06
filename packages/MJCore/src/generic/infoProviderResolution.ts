import { Metadata } from "./metadata";
import type { BaseInfo } from "./baseInfo";
import type { IMetadataProvider } from "./interfaces";

/**
 * Resolves the metadata provider an Info object's sibling lookups must read from: the provider
 * that built the object ({@link BaseInfo.OwningProvider}), falling back to the process-global
 * provider only for an Info object constructed outside any provider (tests, ad-hoc construction).
 *
 * Reading the global provider first was the bug this replaces: in a multi-provider process the
 * global is another provider's metadata, or unset entirely, so IS-A children, RLS filters, query
 * fields and authorization roles silently resolved to nothing.
 *
 * @param info - the Info object performing the lookup
 * @returns the owning provider, else the global provider (which may itself be unset)
 */
export function MetadataProviderFor(info: BaseInfo): IMetadataProvider | undefined {
    return info.OwningProvider ?? Metadata.Provider; // global-provider-ok: last-resort fallback for an Info object built outside any provider
}
