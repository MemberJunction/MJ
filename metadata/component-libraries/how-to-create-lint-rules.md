# How to Create Library-Specific Lint Rules

## Overview
This guide explains how to create lint rules for third-party JavaScript libraries used in MemberJunction's component system. These rules help catch common errors and enforce best practices when using each library.

## File Structure
- Lint rules are stored as JSON files in the `lint-rules/` subdirectory
- File naming convention: `{library-name}-lint.json` (e.g., `chart-js-lint.json`, `recharts-lint.json`)
- Referenced in `.component-libraries.json` using: `"LintRules": "@file:lint-rules/{library-name}-lint.json"`

## Lint Rule JSON Structure

```json
{
  "initialization": {
    "constructorName": "string",      // Main constructor function (e.g., "Chart", "Plotly")
    "requiresNew": boolean,            // Whether 'new' keyword is required
    "elementType": "string",           // Required DOM element type (e.g., "canvas", "div")
    "requiredConfig": ["string"],      // Required configuration properties
    "factoryMethod": "string"          // Alternative factory method if no constructor
  },
  "lifecycle": {
    "requiredMethods": ["string"],     // Methods that must be called (e.g., ["render"])
    "cleanupMethods": ["string"],      // Cleanup methods for useEffect return (e.g., ["destroy", "dispose"])
    "updateMethods": ["string"]        // Methods for updating the instance
  },
  "commonErrors": [
    {
      "pattern": "string",             // Error pattern identifier
      "message": "string",             // User-friendly error message
      "severity": "string"             // "critical", "high", "medium", "low"
    }
  ],
  "options": {
    "requiredProperties": ["string"],  // Required option properties
    "deprecatedProperties": ["string"], // Deprecated properties to warn about
    "typeValidation": {
      "propertyName": "type"          // Expected type for specific properties
    }
  },
  "bestPractices": {
    "recommendedPatterns": ["string"], // Recommended usage patterns
    "antiPatterns": ["string"]         // Patterns to avoid
  }
}
```

## Research Requirements for Each Library

When creating lint rules for a library, research:

1. **Initialization Pattern**
   - How is the library typically initialized?
   - Does it use a constructor, factory method, or global function?
   - What DOM element type does it require (if any)?

2. **Lifecycle Management**
   - What methods must be called to properly set up the library?
   - What cleanup is required to prevent memory leaks?
   - How are updates handled?

3. **Common Pitfalls**
   - What are the most common errors developers make?
   - Are there deprecated features to avoid?
   - What patterns lead to performance issues?

4. **Version-Specific Considerations**
   - Check the EXACT version specified in the JSON
   - Note any breaking changes or deprecations in that version
   - Ensure rules are appropriate for the specific version

## Examples by Library Category

### Charting Libraries (Chart.js, Recharts, D3, etc.)
- Usually require specific DOM elements (canvas for Chart.js, div for others)
- Must call destroy/dispose methods to prevent memory leaks
- Often have required configuration like `type` and `data`

### UI Libraries (Material-UI, Ant Design, Bootstrap)
- Focus on proper component usage
- Check for deprecated props or methods
- Validate theme/styling patterns

### Utility Libraries (Lodash, Moment, Day.js)
- Check for proper import patterns
- Warn about deprecated methods
- Suggest modern alternatives

### Map Libraries (Leaflet, Mapbox)
- Require container elements
- Need proper cleanup of map instances
- Token/API key validation

## Implementation Steps

1. **Research the Library**
   - Check official documentation for the EXACT version
   - Look for initialization examples
   - Find cleanup/destroy documentation
   - Review common issues on GitHub/StackOverflow

2. **Create the JSON File**
   - Name it appropriately: `{library-name}-lint.json`
   - Include only relevant sections (not all libraries need all sections)
   - Focus on the most impactful rules

3. **Test Common Scenarios**
   - Basic initialization
   - Update patterns
   - Cleanup in React useEffect
   - Error conditions

4. **Reference in Metadata**
   - Update `.component-libraries.json` with:
     ```json
     "LintRules": "@file:lint-rules/{library-name}-lint.json"
     ```

## Priority Libraries

Focus on libraries that:
1. Have complex initialization (Chart.js, D3, Three.js)
2. Require cleanup to prevent memory leaks (most charting/map libraries)
3. Have common pitfalls (Moment.js deprecation, React-specific libraries)
4. Are frequently used (Lodash, Axios, date libraries)

## Validation

Lint rules should:
- Be specific to the library version
- Focus on preventing runtime errors
- Avoid overly restrictive rules
- Provide helpful error messages
- Include fix suggestions where possible