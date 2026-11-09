/**
 * @fileoverview The error the template sandbox throws.
 * @module @memberjunction/nunjucks-sandbox
 */

/** Thrown when a template uses a name, a value or a call that the template sandbox does not allow. */
export class TemplateSandboxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TemplateSandboxError';
    }
}
