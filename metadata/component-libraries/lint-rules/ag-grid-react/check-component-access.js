/**
 * AG-Grid React Component Access Validator
 * 
 * This validator checks that AG-Grid React components are accessed correctly.
 * The UMD bundle exports components as properties on the AgGridReact global object,
 * not as the object itself.
 * 
 * It also suggests using JSX syntax instead of React.createElement for better readability.
 */

module.exports = function checkComponentAccess(ast, componentSpec) {
  const violations = [];
  
  // Check if ag-grid-react is in the libraries
  const hasAgGridReact = componentSpec.libraries?.some(
    lib => lib.name === 'ag-grid-react' || lib.globalVariable === 'AgGridReact'
  );
  
  if (!hasAgGridReact) {
    return violations; // No need to check if library isn't used
  }
  
  // Helper to add critical violation for incorrect access
  function addAccessViolation(node, incorrectUsage, correctUsage, isJSX = false) {
    const jsxSuggestion = !isJSX ? `\n\nAlso consider using JSX syntax for better readability:\n<AgGridReact.AgGridReact {...props} />` : '';
    
    violations.push({
      rule: 'ag-grid-react-component-access',
      severity: 'critical',
      line: node.loc?.start?.line || 0,
      column: node.loc?.start?.column || 0,
      message: `AG-Grid React component incorrectly accessed as "${incorrectUsage}". Use "${correctUsage}" instead.${jsxSuggestion}`,
      code: incorrectUsage,
      fix: correctUsage
    });
  }
  
  // Helper to add suggestion for JSX usage
  function addJSXSuggestion(node) {
    violations.push({
      rule: 'ag-grid-prefer-jsx',
      severity: 'medium',
      line: node.loc?.start?.line || 0,
      column: node.loc?.start?.column || 0,
      message: `Consider using JSX syntax for better readability.\n\nCurrent: React.createElement(AgGridReact.AgGridReact, {...})\nSuggested: <AgGridReact.AgGridReact {...} />`,
      code: 'React.createElement(AgGridReact.AgGridReact, ...)',
      fix: '<AgGridReact.AgGridReact ... />'
    });
  }
  
  // Traverse AST looking for React.createElement calls and JSX
  function traverse(node, path = []) {
    if (!node || typeof node !== 'object') return;
    
    // Check for React.createElement calls
    if (node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee?.object?.name === 'React' &&
        node.callee?.property?.name === 'createElement') {
      
      const firstArg = node.arguments?.[0];
      
      // Check if first argument is just "AgGridReact" (incorrect)
      if (firstArg?.type === 'Identifier' && firstArg.name === 'AgGridReact') {
        addAccessViolation(
          firstArg,
          'AgGridReact',
          'AgGridReact.AgGridReact',
          false
        );
      }
      // Check if it's correctly using AgGridReact.AgGridReact but suggest JSX
      else if (firstArg?.type === 'MemberExpression' &&
               firstArg.object?.name === 'AgGridReact' &&
               firstArg.property?.name === 'AgGridReact') {
        addJSXSuggestion(firstArg);
      }
    }
    
    // Check for JSX elements
    if (node.type === 'JSXElement' || node.type === 'JSXOpeningElement') {
      const elementName = node.name || node.openingElement?.name;
      
      // Check if it's just <AgGridReact> (incorrect)
      if (elementName?.type === 'JSXIdentifier' && elementName.name === 'AgGridReact') {
        addAccessViolation(
          elementName,
          '<AgGridReact>',
          '<AgGridReact.AgGridReact>',
          true
        );
      }
    }
    
    // Recursively traverse all properties
    for (const key in node) {
      if (key === 'parent' || key === 'loc') continue; // Skip circular refs
      
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(item => traverse(item, [...path, key]));
      } else if (value && typeof value === 'object') {
        traverse(value, [...path, key]);
      }
    }
  }
  
  traverse(ast);
  
  return violations;
};