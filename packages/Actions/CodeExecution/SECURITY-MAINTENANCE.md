# Security Maintenance Plan

This document outlines the security maintenance policies and procedures for the code execution package.

## Code Review Policy for Isolate Boundary

### What Requires Mandatory Review

Any changes to the following files **MUST** undergo security-focused code review:

1. **[worker.ts](./src/worker.ts)** - Handles the isolate boundary between host and sandbox
2. **[WorkerPool.ts](./src/WorkerPool.ts)** - Manages worker processes and IPC communication
3. **[libraries/index.ts](./src/libraries/index.ts)** - Defines allowed libraries and their implementations

### Review Checklist

When reviewing changes to isolate boundary code, verify:

- [ ] **No ivm.Reference leakage**: Ensure no `ivm.Reference` or `ivm.ExternalCopy` objects are exposed to untrusted code
- [ ] **Only primitives via IPC**: Verify only JSON-serializable data crosses process boundaries
- [ ] **No cachedData from untrusted sources**: Confirm no V8 `cachedData` from user input (CVE-2022-39266)
- [ ] **Module blocking intact**: Verify dangerous modules remain in blocked list
- [ ] **Library allowlist enforced**: Confirm only approved libraries can be loaded
- [ ] **Resource limits enforced**: Check timeout and memory limits are properly set
- [ ] **Error handling**: Ensure errors don't leak sensitive information

### Security Review Process

1. **Self-Review**: Developer completes checklist above
2. **Peer Review**: Another developer reviews with security focus
3. **Testing**: Add test cases for new security-sensitive paths
4. **Documentation**: Update security docs if threat model changes

## Known Vulnerabilities and Mitigations

### CVE-2022-39266 (isolated-vm cachedData)

**Vulnerability**: Accepting untrusted V8 `cachedData` can lead to sandbox escape

**Mitigation**:
- Never pass `cachedData` parameter to `isolate.compileScript()`
- Only compile from source code strings
- Documented in [worker.ts:190](./src/worker.ts#L190)

**Status**: ✅ Protected (no cachedData usage in codebase)

### Future CVE Monitoring

Monitor these resources for new vulnerabilities:

- `isolated-vm` GitHub issues: https://github.com/laverdet/isolated-vm/issues
- `isolated-vm` security advisories: https://github.com/laverdet/isolated-vm/security/advisories
- Node.js security releases: https://nodejs.org/en/security/
- V8 security updates: https://chromium.googlesource.com/v8/v8/+/refs/heads/main/docs/security.md

## Dependency Maintenance Plan

### Current Status (as of 2025-10-20)

**Primary Dependency**: `isolated-vm@5.0.1`
- **Status**: Maintenance mode (mature, stable)
- **Security**: No known CVEs when used correctly
- **Support**: Active community, responsive maintainer
- **Recommendation**: Safe for production use

### Annual Review Schedule

**When**: Every January (or immediately upon security advisory)

**Review Tasks**:

1. **Check isolated-vm status**
   - Review GitHub activity and issue tracker
   - Check for security advisories
   - Verify Node.js/V8 compatibility with latest versions
   - Assess community health and maintainer responsiveness

2. **Evaluate alternatives**
   - **Deno**: Check maturity of Deno as Node.js module
   - **WASM-based solutions**: Evaluate QuickJS-wasm or similar
   - **Container solutions**: Review lightweight container options
   - **New sandboxes**: Survey any new sandboxing technologies

3. **Decision tree**:
   ```
   Is isolated-vm maintained? ──Yes→ Continue using
                            │
                            No
                            │
   Is Deno mature enough? ──Yes→ Plan migration to Deno
                            │
                            No
                            │
   Fork isolated-vm? ──Yes→ Fork and maintain internally
                     │
                     No
                     │
   Migrate to containers → Plan containerized solution
   ```

4. **Document findings**
   - Update this file with review date and findings
   - Update security-research.md if threat model changes
   - Create migration plan if needed

### Emergency Response Plan

If a critical vulnerability is discovered in `isolated-vm`:

1. **Immediate Actions** (Day 1)
   - Assess severity and exploitability
   - Check if MJ's usage is affected
   - Deploy temporary workaround if possible (e.g., disable code execution feature)

2. **Short-term Response** (Week 1)
   - Apply patches if available
   - If no patch: evaluate fork vs. alternative solutions
   - Communicate with users about status

3. **Long-term Solution** (Month 1)
   - Implement permanent fix (patch, fork, or migration)
   - Add regression tests for the vulnerability
   - Update security documentation

### Contingency Options

If `isolated-vm` becomes unmaintained or insecure:

1. **Option A: Fork and Maintain**
   - **Pros**: Full control, minimal code changes
   - **Cons**: Requires C++ expertise for V8 integration
   - **Timeline**: 2-4 weeks for initial fork setup

2. **Option B: Migrate to Deno**
   - **Pros**: Active development, secure by default
   - **Cons**: Separate process overhead, different API
   - **Timeline**: 4-6 weeks for migration

3. **Option C: Container-based Isolation**
   - **Pros**: Maximum isolation, mature tooling
   - **Cons**: High overhead, complex deployment
   - **Timeline**: 6-8 weeks for implementation

## Security Testing

### Recommended Test Cases

Add tests for these scenarios:

1. **Sandbox Escape Attempts**
   - Try to access `ivm` objects via prototype pollution
   - Attempt to use `Function` constructor
   - Try to access Node.js globals

2. **Resource Exhaustion**
   - Infinite loops (should timeout)
   - Memory exhaustion (should hit limit)
   - Recursive explosions (stack overflow)

3. **Module Access**
   - Try to require blocked modules
   - Try to require non-existent modules
   - Verify allowed modules work correctly

4. **Process Isolation**
   - Simulate worker crashes
   - Verify main process continues
   - Verify other workers continue
   - Confirm automatic restart

5. **Error Handling**
   - Verify error messages don't leak internals
   - Confirm proper error classification
   - Test all error types

### Penetration Testing

Consider annual penetration testing focused on:
- Sandbox escape attempts
- Resource exhaustion attacks
- Process isolation bypass
- Supply chain attacks (library tampering)

## Incident Response

If a security issue is discovered:

1. **Contain**: Disable affected functionality if severity is high
2. **Assess**: Determine scope and impact
3. **Fix**: Develop and test patch
4. **Deploy**: Roll out fix with priority
5. **Disclose**: Notify users of issue and resolution
6. **Learn**: Update policies and tests based on learnings

## Contact

For security concerns, contact:
- MemberJunction security team: [security contact info]
- `isolated-vm` maintainer: https://github.com/laverdet/isolated-vm/security

## Review History

| Date | Reviewer | Findings | Actions Taken |
|------|----------|----------|---------------|
| 2025-10-20 | Initial | Initial security hardening | Implemented process isolation, code review policy, CVE documentation |
| 2025-10-20 | Colleague | Missing fetch() API blocking | Added explicit fetch() disabling in worker.ts - blocks Node.js 18+ global fetch() |

## Lessons Learned

### fetch() API Security Hole (2025-10-20)

**Issue**: Node.js 18+ includes a global `fetch()` API that was not blocked in initial implementation. This would allow network access despite module blocking.

**Root Cause**: Focus on `require()` module blocking missed newer global APIs added to Node.js runtime.

**Fix**: Explicitly override `globalThis.fetch` with error-throwing function in worker.ts

**Prevention**:
- Document all Node.js global APIs that need blocking (fetch, WebSocket, etc.)
- Review Node.js release notes for new globals during version upgrades
- Add test case for attempting network access via fetch()

**Action Items**:
- [ ] Add test case: `fetch('https://example.com')` should throw security error
- [ ] Review Node.js 18+ globals: WebSocket, structuredClone, BroadcastChannel, etc.
- [ ] Document "Blocked Globals" section in security-research.md

## Next Review Due: January 2026
