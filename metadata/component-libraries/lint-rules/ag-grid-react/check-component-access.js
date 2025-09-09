/**
 * Ensures AG-Grid React components are accessed with the correct namespace pattern
 * The UMD bundle exports components as properties on the AgGridReact global object,
 * not as the object itself.
 * 
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context with libraryName, globalVariable, instanceVariables
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Check for JSX elements using AgGridReact directly
  if (t.isJSXElement(path.node) || t.isJSXOpeningElement(path.node)) {
    const elementName = path.node.name || path.node.openingElement?.name;
    
    // Check if it's just <AgGridReact> (incorrect)
    if (t.isJSXIdentifier(elementName) && elementName.name === 'AgGridReact') {
      return {
        rule: 'ag-grid-react-component-access',
        severity: 'critical',
        message: 'AG-Grid React component must be accessed as AgGridReact.AgGridReact or destructured first',
        line: elementName.loc?.start.line || 0,
        column: elementName.loc?.start.column || 0,
        fix: 'Use <AgGridReact.AgGridReact> or add: const { AgGridReact } = AgGridReact;'
      };
    }
  }
  
  // Check for React.createElement calls using AgGridReact directly
  if (t.isCallExpression(path.node) &&
      t.isMemberExpression(path.node.callee) &&
      t.isIdentifier(path.node.callee.object) &&
      path.node.callee.object.name === 'React' &&
      t.isIdentifier(path.node.callee.property) &&
      path.node.callee.property.name === 'createElement') {
    
    const firstArg = path.node.arguments?.[0];
    
    // Check if first argument is just "AgGridReact" (incorrect)
    if (t.isIdentifier(firstArg) && firstArg.name === 'AgGridReact') {
      return {
        rule: 'ag-grid-react-component-access',
        severity: 'critical',
        message: 'AG-Grid React component must be accessed as AgGridReact.AgGridReact or destructured first',
        line: firstArg.loc?.start.line || 0,
        column: firstArg.loc?.start.column || 0,
        fix: 'Use React.createElement(AgGridReact.AgGridReact, ...) or add: const { AgGridReact } = AgGridReact;'
      };
    }
  }
  
  return null;
}