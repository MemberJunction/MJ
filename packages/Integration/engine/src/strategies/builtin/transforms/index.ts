// Shared transform rules (all connectors, all platforms)
export { EmptyStringToNullRule } from './shared/EmptyStringToNull.js';
export { TrimWhitespaceRule } from './shared/TrimWhitespace.js';

// SQL Server transform rules
export { NormalizeUUIDUppercaseRule } from './sqlserver/NormalizeUUIDUppercase.js';

// PostgreSQL transform rules
export { NormalizeUUIDLowercaseRule } from './postgresql/NormalizeUUIDLowercase.js';
export { ValidateJsonbRule } from './postgresql/ValidateJsonb.js';
export { CoerceBooleanStringsRule } from './postgresql/CoerceBooleanStrings.js';
export { CoerceTimestamptzRule } from './postgresql/CoerceTimestamptz.js';

// Pipeline implementation
export { DefaultTransformPipeline } from './DefaultTransformPipeline.js';
