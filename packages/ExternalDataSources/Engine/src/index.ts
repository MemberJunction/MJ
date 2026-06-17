export * from "./types";
export * from "./BaseExternalDataSourceDriver";
export * from "./ExternalDataSourceRouter";
// Side-effect: registers the concrete ExternalDataSourceReadRouter with MJGlobal.ClassFactory
// so foundational providers can resolve it via dependency inversion.
export * from "./ExternalDataSourceReadRouterImpl";
