/**
 * Ensure D3 selections are properly cleaned up
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Check for D3 selections in useEffect without cleanup
  if (t.isCallExpression(path.node) &&
      t.isMemberExpression(path.node.callee) &&
      t.isIdentifier(path.node.callee.object) &&
      path.node.callee.object.name === 'd3' &&
      t.isIdentifier(path.node.callee.property) &&
      ['select', 'selectAll'].includes(path.node.callee.property.name)) {
    
    // Check if we're in a useEffect
    let useEffectPath = path;
    while (useEffectPath) {
      if (t.isCallExpression(useEffectPath.node) && 
          t.isIdentifier(useEffectPath.node.callee) &&
          useEffectPath.node.callee.name === 'useEffect') {
        
        // Check for cleanup return
        const effectFn = useEffectPath.node.arguments[0];
        if (t.isArrowFunctionExpression(effectFn) || t.isFunctionExpression(effectFn)) {
          const body = effectFn.body;
          let hasCleanup = false;
          
          if (t.isBlockStatement(body)) {
            for (const stmt of body.body) {
              if (t.isReturnStatement(stmt) && stmt.argument) {
                hasCleanup = true;
                break;
              }
            }
          }
          
          if (!hasCleanup) {
            return {
              rule: 'd3-missing-cleanup',
              severity: 'medium',
              message: 'D3 selections must be cleaned up in useEffect to prevent memory leaks',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              fix: 'return () => { d3.select(ref.current).selectAll("*").remove(); }'
            };
          }
        }
        break;
      }
      useEffectPath = useEffectPath.parentPath;
    }
  }
  return null;
}