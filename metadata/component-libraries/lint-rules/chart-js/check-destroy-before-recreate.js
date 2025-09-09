/**
 * Ensure Chart instances are destroyed before recreating on same canvas
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context with libraryName, globalVariable, instanceVariables
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  if (t.isNewExpression(path.node) && 
      t.isIdentifier(path.node.callee) && 
      path.node.callee.name === 'Chart') {
    
    // Check if we're in a useEffect
    let inUseEffect = false;
    let useEffectPath = path;
    while (useEffectPath) {
      if (t.isCallExpression(useEffectPath.node) && 
          t.isIdentifier(useEffectPath.node.callee) &&
          useEffectPath.node.callee.name === 'useEffect') {
        inUseEffect = true;
        break;
      }
      useEffectPath = useEffectPath.parentPath;
    }
    
    if (inUseEffect) {
      // Look for cleanup function return
      let hasCleanup = false;
      const effectFn = useEffectPath.node.arguments[0];
      if (t.isArrowFunctionExpression(effectFn) || t.isFunctionExpression(effectFn)) {
        // Check if it returns a cleanup function
        const body = effectFn.body;
        if (t.isBlockStatement(body)) {
          for (const stmt of body.body) {
            if (t.isReturnStatement(stmt) && stmt.argument) {
              hasCleanup = true;
              break;
            }
          }
        }
      }
      
      if (!hasCleanup) {
        return {
          rule: 'chart-missing-cleanup',
          severity: 'high',
          message: 'Chart.js instances must be destroyed in useEffect cleanup to prevent memory leaks',
          line: path.node.loc?.start.line || 0,
          column: path.node.loc?.start.column || 0,
          fix: 'return () => { chartInstance.current?.destroy(); }'
        };
      }
    }
  }
  return null;
}