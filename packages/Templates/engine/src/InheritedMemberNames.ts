/**
 * @fileoverview The one list of names that the template sandbox refuses wherever a template names something.
 * @module @memberjunction/templates
 */

/**
 * The members of `Object.prototype`, which every plain object inherits (such as `constructor`, `toString`
 * and `__proto__`), and `prototype`, which leads from a constructor to what its instances inherit.
 */
const INHERITED_MEMBER_NAMES: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

/**
 * True for a name that a template may not use as a dictionary key, a keyword argument, a macro or call-block
 * argument, a variable, macro or block name, a literal member name, or a filter or test name. nunjucks reads
 * and writes such names on plain objects, where they reach inherited members or the object's prototype.
 * @param name the name as nunjucks uses it
 */
export function IsInheritedMemberName(name: string): boolean {
    return INHERITED_MEMBER_NAMES.has(name);
}
