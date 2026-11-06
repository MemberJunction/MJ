/**
 * JSON Schema fragment for one Action parameter's value.
 *
 * Stored in the `ValueSchema` column of `MJ: Action Params`. CodeGen emits a typed
 * `ValueSchemaObject` accessor that returns `IActionParamValueSchema | null`.
 *
 * When set, the native tool builder declares this schema to the model in place of the coarse
 * `ValueType` mapping, and argument coercion follows it before the Action runs. For an `IsArray`
 * param it describes ONE element; the builder wraps it in `{ type: 'array', items: … }`.
 *
 * Deliberately limited to the subset every tool-calling provider accepts (`type`, `description`,
 * `enum`, `items`, `properties`, `required`). Keywords outside it (`oneOf`, `$ref`, `format`,
 * `additionalProperties`, …) are rejected or handled differently from one provider to the next, so
 * the interface does not offer them.
 *
 * @example { "type": "string", "enum": ["asc", "desc"] }
 * @example { "type": "object", "properties": { "TopCount": { "type": "integer" } }, "required": ["TopCount"] }
 */
export interface IActionParamValueSchema {
    /**
     * The JSON type of the value. An array of types is a union; prefer a single type, since OpenAPI
     * 3.0 (which Gemini's function declarations follow) has no union `type`.
     */
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | Array<'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'>;
    /** What the value means. On the top-level schema the param's own `Description` is used when this is absent. */
    description?: string;
    /** The only values allowed. */
    enum?: Array<string | number | boolean | null>;
    /** For `type: 'array'`: the schema of each element. */
    items?: IActionParamValueSchema;
    /** For `type: 'object'`: the schema of each named property. */
    properties?: Record<string, IActionParamValueSchema>;
    /** For `type: 'object'`: the property names that must be present. */
    required?: string[];
}
