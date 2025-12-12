import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: library-variable-names
 *
 * Ensures correct usage of library global variables. Libraries must be accessed
 * using unwrapComponents with the correct global variable name as specified in
 * the component spec.
 *
 * Prevents:
 * - Using incorrect library global variable names
 * - Self-assignment of library globals (const chroma = chroma)
 *
 * Severity: critical
 * Applies to: all components
 */
export const libraryVariableNamesRule: LintRule = {
  name: 'library-variable-names',
  appliesTo: 'all',
  test: (ast, componentName, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

    // Build a map of library names to their globalVariables
    const libraryGlobals = new Map<string, string>();
    if (componentSpec?.libraries) {
      for (const lib of componentSpec.libraries) {
        // Skip empty library objects or those without required fields
        if (lib.name && lib.globalVariable) {
          // Store both the exact name and lowercase for comparison
          libraryGlobals.set(lib.name.toLowerCase(), lib.globalVariable);
        }
      }
    }

    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        // Check for destructuring from a variable (library global)
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
          const sourceVar = path.node.init.name;

          // Check if this looks like a library name (case-insensitive match)
          const matchedLib = Array.from(libraryGlobals.entries()).find(
            ([libName, globalVar]) => sourceVar.toLowerCase() === libName || sourceVar.toLowerCase() === globalVar.toLowerCase(),
          );

          if (matchedLib) {
            const [libName, correctGlobal] = matchedLib;
            if (sourceVar !== correctGlobal) {
              violations.push({
                rule: 'library-variable-names',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Incorrect library global variable "${sourceVar}". Use unwrapComponents with the correct global: "const { ... } = unwrapComponents(${correctGlobal}, [...]);"`,
              });
            }
          }
        }

        // Check for self-assignment (const chroma = chroma)
        if (t.isIdentifier(path.node.id) && t.isIdentifier(path.node.init)) {
          const idName = path.node.id.name;
          const initName = path.node.init.name;

          if (idName === initName) {
            // Check if this is a library global
            const isLibraryGlobal = Array.from(libraryGlobals.values()).some((global) => global === idName);

            if (isLibraryGlobal) {
              violations.push({
                rule: 'library-variable-names',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Self-assignment of library global "${idName}". This variable is already available as a global from the library. Remove this line entirely - the library global is already accessible.`,
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
