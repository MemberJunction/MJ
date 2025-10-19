# Security Notice: Code Execution Service

## ⚠️ IMPORTANT: Current Security Status

This package uses **vm2** for sandboxing JavaScript code execution.

### Known Issues

**vm2 is DEPRECATED and has known security vulnerabilities.**

As of the last npm install:
```
npm warn deprecated vm2@3.9.19: The library contains critical security
issues and should not be used for production! The maintenance of the
project has been discontinued. Consider migrating your code to isolated-vm.
```

### What This Means

- ✅ **Safe for**: Trusted AI agents (like Codesmith) generating code iteratively
- ✅ **Safe for**: Internal business users with audit trails
- ✅ **Safe for**: Development and testing environments
- ❌ **NOT safe for**: Arbitrary user-submitted code from the internet
- ❌ **NOT safe for**: Multi-tenant production without additional isolation
- ❌ **NOT safe for**: High-security environments (finance, healthcare, PCI)

### Current Protections

1. **Timeout**: Code execution limited to 30 seconds (configurable)
2. **Module Allowlist**: Only approved npm packages can be imported
3. **No Filesystem**: `fs` and related modules are mocked/blocked
4. **No Network**: `http`, `https`, `net`, `axios` are blocked
5. **No Process Control**: `child_process`, `cluster` are blocked
6. **Audit Trail**: All executions logged via ActionExecutionLogs

### Known Attack Vectors

While we block obvious dangerous modules, vm2 has had bypass vulnerabilities that allow:

- Sandbox escape to access Node.js internals
- File system access despite mocking
- Process spawning despite blocking
- Memory exhaustion attacks
- Prototype pollution attacks

**These are theoretical in our setup but vm2 has proven vulnerable.**

## Recommended Migration Path

### Phase 1: Immediate (Current State)
- ✅ Use only with **trusted agents** (Codesmith generating code)
- ✅ Add **user warnings** in UI
- ✅ Enable **audit logging** for all executions
- ✅ Run in **network-isolated environment** if possible
- ✅ **Monitor** for suspicious patterns

### Phase 2: Short Term (1-2 weeks)
Migrate to **isolated-vm**:

```bash
npm uninstall vm2
npm install isolated-vm
```

Update CodeExecutionService.ts to use isolated-vm:
```typescript
import ivm from 'isolated-vm';

// isolated-vm provides true V8 isolates
const isolate = new ivm.Isolate({ memoryLimit: 128 });
const context = await isolate.createContext();
// ... see isolated-vm documentation
```

**Benefits:**
- Actively maintained
- No known escape vulnerabilities
- True memory limits
- Production-grade security

**Effort:** ~4-8 hours to migrate and test

### Phase 3: Long Term (1-2 months)
Add **Docker-based execution** for ultimate isolation:

```typescript
// Execute in disposable Docker container
const docker = new Docker();
await docker.run('node:20-alpine', [
  'node', '-e', userCode
], process.stdout, {
  Memory: 128 * 1024 * 1024,
  NetworkDisabled: true,
  HostConfig: {
    ReadonlyRootfs: true,
    SecurityOpt: ['no-new-privileges']
  }
});
```

**Benefits:**
- Kernel-level isolation
- Can't escape to host system
- Resource limits enforced by OS
- Industry standard (AWS Lambda, GitHub Actions, etc.)

**Effort:** ~1-2 weeks for production-ready implementation

## Additional Security Measures

### 1. Static Code Analysis
Add pre-execution scanning:

```typescript
function analyzeCodeSafety(code: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  // Check for suspicious patterns
  if (code.includes('constructor.constructor')) {
    issues.push({ severity: 'high', message: 'Potential sandbox escape attempt' });
  }

  if (code.includes('process.') || code.includes('global.')) {
    issues.push({ severity: 'high', message: 'Attempted access to global objects' });
  }

  // More patterns...
  return issues;
}
```

### 2. Rate Limiting
Prevent abuse:

```typescript
const rateLimiter = new Map<string, number>();

async function execute(params: CodeExecutionParams) {
  const userId = params.contextUser.ID;
  const count = rateLimiter.get(userId) || 0;

  if (count > 100) { // 100 executions per hour
    throw new Error('Rate limit exceeded');
  }

  rateLimiter.set(userId, count + 1);
  // ... execute code
}
```

### 3. Human Review for Sensitive Operations
Add approval workflow:

```typescript
if (detectsSensitiveData(params.inputData)) {
  await requestHumanApproval({
    code: params.code,
    requestedBy: params.contextUser,
    reason: 'Code accesses sensitive customer data'
  });
}
```

## For Production Deployment

**Before deploying to production:**

1. ✅ Migrate to isolated-vm or Docker-based execution
2. ✅ Add static code analysis
3. ✅ Implement rate limiting
4. ✅ Add approval workflows for sensitive data
5. ✅ Run in isolated network segment
6. ✅ Monitor all executions with alerts
7. ✅ Regular security audits
8. ✅ User education and warnings

## Questions?

If you need help with the migration or have security concerns:

1. Check isolated-vm documentation: https://github.com/laverdet/isolated-vm
2. Review Docker security best practices
3. Consult with security team before production deployment

## Summary

**Current state**: Suitable for trusted agents in controlled environments
**Production state**: Requires migration to isolated-vm or Docker
**Timeline**: 1-8 weeks depending on security requirements
