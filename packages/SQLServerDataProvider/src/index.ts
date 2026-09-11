export { setupSQLServerClient } from "./config";
export { SQLServerDataProvider } from "./SQLServerDataProvider";
export {
  ExecuteSQLOptions,
  SQLServerProviderConfigData,
} from "./types";
export { NodeFileSystemProvider } from "./NodeFileSystemProvider";

/**
 * @deprecated Import from `@memberjunction/generic-database-provider` instead — `UserCache` moved there
 * in f8a8448e0e so `Refresh` could be dialect-neutral.
 *
 * Kept as a re-export because dropping it outright is a BREAKING change for already-published consumers:
 * `@mj-biz-apps/common-server` and `@mj-biz-apps/forms-server` both do
 * `import { UserCache } from '@memberjunction/sqlserver-dataprovider'`, and without it they fail to load
 * with a SyntaxError during Open App bootstrap. The server still starts, so the only symptom is two apps
 * silently missing — which is why this was invisible until a rebuild made dist match src.
 */
export { UserCache } from "@memberjunction/generic-database-provider";
