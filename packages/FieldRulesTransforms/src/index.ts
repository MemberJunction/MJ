import { RegisterFieldTransform } from '@memberjunction/global';
import { jsonPathTransform } from './jsonpath-transform.js';
import { xPathTransform } from './xpath-transform.js';

let registered = false;

/**
 * Registers the `jsonpath` and `xpath` transforms into the global FieldTransform registry so any
 * {@link import('@memberjunction/global').FieldTransformEngine} in the process can run them. Idempotent.
 *
 * Importing this package runs it for its side effect, but call it explicitly from a startup/registration
 * path to keep aggressive bundlers from tree-shaking the import away (the MJ `Load*()` convention).
 */
export function RegisterFieldRulesTransforms(): void {
    if (registered) {
        return;
    }
    RegisterFieldTransform('jsonpath', jsonPathTransform);
    RegisterFieldTransform('xpath', xPathTransform);
    registered = true;
}

// Side-effect registration on import.
RegisterFieldRulesTransforms();

export { jsonPathTransform } from './jsonpath-transform.js';
export { xPathTransform } from './xpath-transform.js';
