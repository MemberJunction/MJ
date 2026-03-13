# Test Harness Limitations

## Process Boundary Constraints

The React test harness uses Playwright to control a browser from Node.js, which creates a process boundary between the test environment and the browser. This architecture imposes several limitations:

### 1. Serialization Requirements

All data passed between Node.js and the browser must be JSON-serializable. This means:

- ✅ **Can pass:** Strings, numbers, booleans, plain objects, arrays
- ❌ **Cannot pass:** Functions, class instances, methods, circular references

### 2. BaseEntity Limitations

MemberJunction's `BaseEntity` objects cannot be passed directly to the browser because they are class instances with methods, getters, and setters. Instead:

```typescript
// In Node.js
const entity = await metadata.GetEntityObject('Users');
return entity.GetAll(); // Returns plain object with just the data

// In Browser - receives only the data
const userData = await utilities.md.GetEntityObject('Users');
// userData is { ID: '123', Name: 'John', ... } without methods like Save()
```

### 3. No Direct Method Access

Components in the test environment cannot:
- Call entity methods like `Save()`, `Load()`, `Delete()`
- Access computed properties that rely on class methods
- Use entity relationships that depend on lazy loading

### 4. Comparison with Production

In production environments (MJ Explorer, Skip), React components run in the same browser context as the MJ libraries and have full access to:
- Complete BaseEntity objects with all methods
- Direct function calls without serialization
- Full TypeScript typing and IntelliSense

## Workarounds

For testing scenarios that require full MJ functionality:

1. **Test data operations only** - Focus on component rendering and data display
2. **Mock entity methods** - Create simplified versions of needed methods in test setup
3. **Use RunView/RunQuery** - These return serializable data and work well across the boundary

## Future Enhancements

A more complete solution would involve setting up a full build process with:
- Webpack/Vite bundling of MJ client libraries
- Dev server running the MJ API
- Real browser environment with full MJ context

This would enable true integration testing but requires significantly more setup complexity.