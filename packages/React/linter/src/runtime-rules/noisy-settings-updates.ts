import { Traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Helper function to extract function name from a NodePath
 */
function getFunctionName(path: NodePath): string | null {
  const node = path.node;

  // Check for named function
  if (t.isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }

  // Check for arrow function assigned to variable
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      return parent.id.name;
    }
  }

  // Check for function assigned as property
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
      return parent.key.name;
    }
  }

  // Check for `const handleX = useCallback((e) => {...}, [deps])`
  if ((t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) && isUseCallbackArgument(path)) {
    const declarator = path.parentPath?.parent;
    if (t.isVariableDeclarator(declarator) && t.isIdentifier(declarator.id)) {
      return declarator.id.name;
    }
  }

  return null;
}

/** True when the function at `path` is the first argument of `useCallback(...)` or `React.useCallback(...)`. */
function isUseCallbackArgument(path: NodePath): boolean {
  const call = path.parent;
  if (!t.isCallExpression(call) || call.arguments[0] !== path.node) return false;
  const callee = call.callee;
  return (t.isIdentifier(callee) && callee.name === 'useCallback') ||
    (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'useCallback');
}

/** True for `onSaveUserSettings(...)`, `onSaveUserSettings?.(...)` and `props.onSaveUserSettings(...)`. */
function isSaveSettingsCallee(callee: t.Node): boolean {
  if (t.isIdentifier(callee)) return callee.name === 'onSaveUserSettings';
  return (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) &&
    !callee.computed &&
    t.isIdentifier(callee.property) &&
    callee.property.name === 'onSaveUserSettings';
}

/** True when the function body names a debounce or a timer (`setTimeout`, `debounce`, `lastDebounceAt`, ...). */
function bodyHasDebounce(funcPath: NodePath): boolean {
  let found = false;
  funcPath.traverse({
    Identifier(inner: NodePath<t.Identifier>) {
      const name = inner.node.name;
      if (name === 'setTimeout' || name.toLowerCase().includes('debounce')) {
        found = true;
        inner.stop();
      }
    },
  });
  return found;
}

/** True for `setTimeout(...)`, `window.setTimeout(...)`, `debounce(...)`, `_.debounce(...)` and other `*debounce*` calls. */
function isDeferringCall(call: t.Node | null | undefined): call is t.CallExpression | t.OptionalCallExpression {
  if (!t.isCallExpression(call) && !t.isOptionalCallExpression(call)) return false;
  const callee = call.callee;
  const name = t.isIdentifier(callee)
    ? callee.name
    : (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && !callee.computed && t.isIdentifier(callee.property)
      ? callee.property.name
      : '';
  return name === 'setTimeout' || name.toLowerCase().includes('debounce');
}

/**
 * True when the save's function, or a function around it, is the callback of a `setTimeout`
 * or `debounce` call: `onChange={(e) => { t.current = setTimeout(() => save(...), 500); }}` or
 * `onChange={debounce((e) => save(...), 500)}`. The save then runs once the typing stops.
 */
function isDeferredCallback(funcPath: NodePath): boolean {
  for (let current: NodePath | null = funcPath; current; current = current.parentPath?.getFunctionParent() ?? null) {
    const call = current.parent;
    const node = current.node;
    if (isDeferringCall(call) && call.arguments.some((arg) => arg === node)) return true;
  }
  return false;
}

/**
 * Events that fire on every keystroke whatever the element. Key events are left out: a key
 * handler that saves almost always checks for Enter first, which is a submit, not a keystroke save.
 */
const KEYSTROKE_EVENTS = new Set(['onInput']);
/** Text-entry components whose onChange fires per keystroke (antd/MUI-style names, matched on the last segment). */
const TEXT_ENTRY_COMPONENTS = new Set(['Input', 'TextArea', 'Textarea', 'Search', 'Password', 'TextField', 'InputNumber']);
/** `<input type=...>` values that take typed text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'url', 'tel', 'password']);

/** The element name, using the last segment of a member name (`Input.Search` → `Search`). */
function jsxElementName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) return name.property.name;
  return '';
}

/** True for a textarea, an Input-like component, or an `<input>` whose type takes typed text. */
function isTextInputElement(opening: t.JSXOpeningElement): boolean {
  const name = jsxElementName(opening.name);
  if (name === 'textarea' || TEXT_ENTRY_COMPONENTS.has(name)) return true;
  if (name !== 'input') return false;
  const typeAttr = opening.attributes.find(
    (a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === 'type'
  );
  if (!typeAttr?.value) return true; // no type: a text input
  if (t.isStringLiteral(typeAttr.value)) return TEXT_INPUT_TYPES.has(typeAttr.value.value);
  return true; // dynamic type: assume text
}

/** True when this JSX attribute fires per keystroke: onInput/onKey*, or onChange on a text-entry element. */
function isKeystrokeAttribute(attrPath: NodePath<t.JSXAttribute>): boolean {
  const attrName = t.isJSXIdentifier(attrPath.node.name) ? attrPath.node.name.name : '';
  if (KEYSTROKE_EVENTS.has(attrName)) return true;
  if (attrName !== 'onChange') return false;
  const opening = attrPath.parent;
  return t.isJSXOpeningElement(opening) && isTextInputElement(opening);
}

/** The JSX attribute a path sits in (its value or a callback in it), or null when it is in children or plain code. */
function enclosingJsxAttribute(path: NodePath): NodePath<t.JSXAttribute> | null {
  const found = path.findParent((p) => p.isJSXAttribute() || p.isJSXElement());
  return found && found.isJSXAttribute() ? found : null;
}

/**
 * True when the function holding the save call runs per keystroke: it is inline in such an
 * attribute, or it is a named handler referenced from one (`onChange={handleX}` or
 * `onChange={(e) => handleX(e.target.value)}`).
 */
function runsPerKeystroke(funcPath: NodePath, funcName: string | null): boolean {
  const inline = enclosingJsxAttribute(funcPath);
  if (inline && isKeystrokeAttribute(inline)) return true;
  if (!funcName) return false;
  const binding = funcPath.parentPath?.scope.getBinding(funcName);
  if (!binding) return false;
  return binding.referencePaths.some((ref) => {
    const attr = enclosingJsxAttribute(ref);
    return attr !== null && isKeystrokeAttribute(attr);
  });
}

/** The violation for a save made on every keystroke without a debounce. */
function noisySaveViolation(node: t.Node): Violation {
  return {
    rule: 'noisy-settings-updates',
    severity: 'critical',
    line: node.loc?.start.line || 0,
    column: node.loc?.start.column || 0,
    message: `Saving settings on every change/keystroke. Save on blur, submit, or after debouncing.`,
    suggestion: {
      text: 'Save settings sparingly - only on meaningful user actions',
      example: `// ❌ WRONG - Saving on every keystroke:
const handleSearchChange = (e) => {
  setSearchTerm(e.target.value);
  onSaveUserSettings?.({ searchTerm: e.target.value }); // TOO NOISY!
};

// ✅ CORRECT - Save on blur or debounced:
const handleSearchBlur = () => {
  if (searchTerm !== savedUserSettings?.searchTerm) {
    onSaveUserSettings?.({ ...savedUserSettings, searchTerm });
  }
};

// ✅ CORRECT - Debounced save:
const saveSearchTerm = useMemo(() =>
  debounce((term) => {
    onSaveUserSettings?.({ ...savedUserSettings, searchTerm: term });
  }, 500),
  [savedUserSettings]
);`,
    },
  };
}

/**
 * Rule: noisy-settings-updates
 *
 * Prevents saving settings on every change/keystroke. Settings should only be
 * saved on blur, submit, or after debouncing to avoid excessive updates.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'noisy-settings-updates')
export class NoisySettingsUpdatesRule extends BaseLintRule {
  get Name() { return 'noisy-settings-updates'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string): Violation[] {
    const violations: Violation[] = [];

    // A save is flagged only when the function making it is wired to a per-keystroke event
    // (onInput, or onChange on a text input, textarea or Input-like component) and does not
    // debounce. A dropdown's or checkbox's onChange fires once per choice, which is fine.
    const visitCall = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
      if (!isSaveSettingsCallee(path.node.callee)) return;
      const parent = path.getFunctionParent();
      if (!parent || isDeferredCallback(parent)) return;
      if (!runsPerKeystroke(parent, getFunctionName(parent)) || bodyHasDebounce(parent)) return;
      violations.push(noisySaveViolation(path.node));
    };
    Traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) { visitCall(path); },
      OptionalCallExpression(path: NodePath<t.OptionalCallExpression>) { visitCall(path); },
    });

    return violations;
  }
}
