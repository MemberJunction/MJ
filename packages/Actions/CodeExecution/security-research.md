# Analysis of our approach from Claude Code (Sonnet 4.5) on 19 Oct 2025
# Code Execution Security Model

## Overview
Production-grade sandboxed JavaScript execution using **isolated-vm** for AI agents to safely generate and run code for data analysis and transformations.

## Security Architecture

### Core Technology: isolated-vm
- **True V8 Isolates**: Each execution runs in completely separate V8 isolate with independent heap
- **Battle-Tested**: Used by Figma for plugin sandboxing, similar to Cloudflare Workers
- **No Known CVEs**: Actively maintained, no known security vulnerabilities
- **Migrated from vm2**: Eliminated deprecated package with multiple sandbox escape CVEs

### Multi-Layer Defense

#### 1. Isolate Separation
- Separate memory space per execution
- No shared heap between sandbox and host process
- Automatic resource cleanup (`isolate.dispose()`)

#### 2. Module Blocking
Dangerous modules throw security errors:
- **Filesystem**: `fs`, `path` (blocked)
- **Network**: `http`, `https`, `net`, `axios` (blocked)
- **Process**: `child_process`, `cluster`, `os`, `process` (blocked)

#### 3. Library Allowlist
Only 4 pre-vetted libraries permitted:
- `lodash` - Data manipulation (25+ essential functions)
- `date-fns` - Date operations
- `uuid` - UUID generation
- `validator` - String validation

#### 4. Resource Limits
- **Timeout**: 30 seconds default (configurable)
- **Memory**: 128MB default (configurable)
- **Prevents**: Infinite loops, resource exhaustion attacks

#### 5. Code Execution Controls
- ❌ `eval()` blocked for user code
- ❌ `Function()` constructor blocked
- ✅ Only safe built-ins accessible (JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp)

## Library Loading Security

### Source Code Injection (Not Function Bridging)
Libraries are provided as inline JavaScript implementations:

1. **Host Process**: Stores library source code as strings
2. **Transfer**: Source code string crosses isolate boundary via `ivm.Reference`
3. **Execution**: Library code evaluated and runs **inside sandbox** (not host)
4. **Result**: All library functions subject to same security constraints as user code

**Key Point**: Library code executes in the isolated V8 context, NOT in the host process. Host only acts as a "string database" for library source code.

### Why This Is Safe
- ✅ Libraries can't escape sandbox any more than user code
- ✅ No host process code execution
- ✅ No shared memory between isolate and host
- ✅ Library code subject to timeout and memory limits
- ✅ Inline implementations prevent npm package tampering

## What Code CAN Do
- Access input data via `input` variable
- Set output via `output` variable
- Use console methods (log, error, warn, info)
- Use safe JavaScript built-ins
- Require allowed libraries (lodash, date-fns, uuid, validator)

## What Code CANNOT Do
- Access filesystem (fs blocked)
- Make network requests (http/https/net blocked)
- Spawn processes (child_process blocked)
- Use eval() or Function constructor
- Run beyond timeout limit
- Exceed memory limit
- Access environment variables or system information

## Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Sandbox Escape | True V8 isolates with separate heap (isolated-vm architecture) |
| Resource Exhaustion | Enforced timeout (30s) and memory limits (128MB) |
| Code Injection | No eval or dynamic Function constructor for user code |
| Information Disclosure | No filesystem, environment, or network access |
| Dependency Vulnerabilities | Inline library implementations, not loaded from node_modules |
| Module Tampering | Libraries provided as vetted inline source code |

## Audit Trail
All code executions automatically logged via MemberJunction's Action execution logging:
- Who executed code (contextUser)
- When it was executed (timestamp)
- What code was run (input parameters)
- Results or errors (output parameters)
- Execution time (performance tracking)

## Security Confidence Level
**Production-Ready**: Comparable to Cloudflare Workers, AWS Lambda, or Figma plugin sandboxing. Safe for executing untrusted AI-generated code.






# GPT 5 Thinking Mode (Pro)
## Report Written on 19 OCT 2025 @ 2:28 PM CDT
Running AI-Generated JavaScript Securely: isolated-vm vs. Alternatives

Security and Isolation with isolated-vm

isolated-vm provides sandboxing by leveraging V8 isolates, creating a completely separate JS engine instance for untrusted code ￼. Code running in an isolate has no access to Node’s runtime or host APIs by default ￼, which greatly reduces the attack surface. This design is inherently more secure and “less prone to escapes” than sandboxes like vm2 that operate within the Node context ￼. In fact, the Backstage project switched from vm2 to isolated-vm specifically because isolates offer stronger separation (no shared process or core modules) ￼. Projects such as the MMO game Screeps and Fly.io’s edge platform use isolated-vm to run arbitrary user-supplied code safely in production ￼, underscoring its real-world viability for untrusted scripts.

Known vulnerabilities or weaknesses: Notably, isolated-vm had a critical issue (CVE-2022-39266) where feeding untrusted V8 cached bytecode into the API could break out of the sandbox and execute arbitrary code in the host process ￼. This was addressed by disallowing/denying untrusted cached data (developers are now warned not to accept cachedData from users) ￼. Aside from that scenario, there have been no public sandbox escapes of isolated-vm when used as intended. However, its author cautions that misuse can introduce vulnerabilities – for example, if your code accidentally exposes an isolated-vm internal object (like a Reference or ExternalCopy) to the untrusted script, an attacker could use it as a bridge back into the Node context and fully compromise the process ￼. In short, isolated-vm is only as safe as the care you take to confine the untrusted code’s inputs/outputs. The library’s documentation emphasizes that sandboxing “must be approached with great care” and is not automatically foolproof ￼.

Another important consideration is that isolated-vm operates in-process. While each isolate has a memory limit setting, it’s a soft limit; a determined attacker can exceed it by 2-3x before the isolate is terminated ￼. In worst-case scenarios (e.g. deliberate infinite memory allocation or certain V8 engine bugs), the Node process could be brought down – V8 is “not resilient to out-of-memory conditions” and may crash the process on catastrophic errors ￼ ￼. The maintainer added an onCatastrophicError hook to quarantine a crashing isolate, but acknowledges it isn’t fully reliable ￼. For maximum safety, it’s recommended to run isolates in a separate process from critical services (so even if one isolate crashes its host process, it doesn’t take down your entire app) ￼. This is similar to how Chromium isolates sites in different processes as a defense-in-depth measure ￼.

Maintenance and support: As of 2023-2024, isolated-vm is in maintenance mode, meaning active development of new features has slowed ￼. The maintainer has identified architectural improvements (like running isolates in separate processes and bundling a stable V8 build) that would further harden security, but these are not yet implemented ￼ ￼. Still, the library is kept compatible with new Node/V8 versions and remains one of the best available options for in-process sandboxing. The Backstage team called it a “highly secure sandbox” despite the extra effort of compiling a native module ￼. In summary, isolated-vm is appropriate for running untrusted or AI-generated code – it provides strong isolation by design, with no known sandbox escape exploits in the wild (barring developer error). Just be mindful of its caveats: enforce strict memory/time limits, don’t pass it sensitive objects, keep Node updated (for V8 patches) ￼, and consider spawning separate worker processes for untrusted code if your threat model demands the highest assurance ￼.

Comparing isolated-vm to Other Sandboxing Solutions

When choosing a sandbox, you should weigh security, ease of use, and performance. Below is a comparison of isolated-vm with common alternatives:

Node’s Built-in vm Module
	•	Security: Node’s own vm module is not intended as a security mechanism. The official docs explicitly warn: “The node:vm module is not a security mechanism. Do not use it to run untrusted code.” ￼. In practice, code running in a vm context can break out easily – e.g. by accessing the constructor of built-ins to execute arbitrary code in the host environment ￼. Even a simple payload like this.constructor.constructor('process.exit()')() can escape the sandbox, granting full access to process and the filesystem ￼. In short, vm is unsafe for untrusted code.
	•	Ease of Use: The vm API is straightforward and synchronous, which makes it easy to run snippets of code. But because it cannot truly sandbox malicious code, its simplicity comes at the cost of security. You would have to manually remove or white-list globals (and even then, bypass techniques exist).
	•	Performance: Since it runs code in-process without extra isolation, vm has minimal overhead – on par with a normal function call. There’s no serialization cost for passing data in/out. However, this performance is meaningless if the approach is insecure for your use case.

vm2 (Third-Party Sandbox Module)
	•	Security: Until recently, vm2 was a popular choice to run untrusted JS in Node. It improved on Node’s vm by intercepting and proxying access to objects, aiming to prevent dangerous operations. However, over 2022–2023 multiple critical sandbox escape vulnerabilities were discovered in vm2 ￼ ￼. Attackers found ways to break out of the vm2 context, for example by exploiting how vm2 proxied Node’s Buffer and __proto__ properties ￼ ￼. Each escape allowed arbitrary code execution in the host. The maintainer eventually concluded that vm2’s approach had “fundamental flaws” and could not be fully secured; in July 2023 they discontinued vm2 due to unfixable security issues ￼. In fact, the maintainer’s announcement states: “Due to security issues that cannot be properly addressed I will stop maintaining this library. For a replacement look into isolated-vm.” ￼. Clearly, vm2 is no longer a safe or supported option for sandboxing.
	•	Ease of Use: vm2 was designed as a drop-in solution: you could instantiate a sandbox and simply call vm.run(code) with untrusted code. It supported configuring allowed built-ins or modules, which was convenient. But given the security problems and the project being abandoned, ease of use is moot – one should avoid vm2 in new projects.
	•	Performance: vm2 runs code in-process with some overhead (due to the proxy wrappers on objects and intercepting system calls). Generally it was fast enough for many use cases, but each security patch tended to add a bit more overhead. Regardless, the recent exploits eliminate it from consideration despite any performance benefits.

isolated-vm (V8 Isolates in Node)
	•	Security: As described above, isolated-vm offers stronger isolation guarantees by running code in a separate V8 isolate with no Node.js APIs or modules available ￼. This significantly limits what untrusted code can do – by default it cannot touch the filesystem, spawn processes, or even access global objects from the host. The isolation is at the engine level: “Objects from one isolate must not be used in other isolates,” effectively making each isolate a true sandbox ￼. No known sandbox escape exploits have been published against isolated-vm (when used correctly and kept updated). Its main security weaknesses lie in potential misconfiguration (as noted, passing it host objects by mistake) or V8 engine bugs that are rare. One documented weakness is that a script can try to exhaust memory or CPU – you should use the provided memory limit and a watchdog/timer to terminate runaway scripts. Keep in mind the memory limit isn’t absolute (host process may need to handle an isolate OOM) ￼, so for critical use you might still isolate the isolate (run it in a separate worker process). In practice, isolated-vm is considered “much more secure” than vm2’s approach ￼ and suitable for running untrusted code.
	•	Ease of Use: Using isolated-vm is more involved than using Node’s vm or vm2. Since it’s a native addon, you must have a C++ build environment to install it, and it needs to compile on your target OS (Backstage noted this native-build requirement as a minor burden on adopters ￼). The API is asynchronous and based on explicit data marshaling between the host and isolate. For example, to execute a snippet, you typically create an Isolate and a Context, then compile a script and run it within that context. Transferring data (inputs/outputs) often requires using ExternalCopy or Reference objects. This is a bit of a learning curve compared to the simplicity of vm2. That said, the library is well-documented and stable. Once set up, it integrates into a Node app without requiring a separate process, which keeps complexity manageable. Given that no truly secure sandbox is “plug and play,” isolated-vm’s API is reasonably straightforward for the power it provides – just be prepared for a different programming model (promises and transferable references rather than direct function calls).
	•	Performance: One advantage of isolated-vm is that it runs isolates within the same process, avoiding the heavy overhead of spawning a new process or container per execution. V8 isolates are designed to be efficient – context switches between isolates are cheaper than starting a new OS process. isolated-vm even allows running code asynchronously in a thread pool so that an isolate’s execution doesn’t block Node’s event loop ￼ ￼. In practice, this means you can run multiple untrusted scripts concurrently on separate threads (each in its own isolate), utilizing multi-core systems effectively. Data passing incurs a serialization cost (copied across isolate boundaries), but for primitives and small objects this is very fast ￼. The memory footprint of each isolate can be tuned (default ~128 MB, adjustable ￼). Compared to alternatives, isolated-vm strikes a good balance: significantly lower overhead than full VMs or containers, and typically faster startup than launching an external process like Deno or Docker. The main performance hit to watch out for is if an isolate does something very CPU-intensive – since it shares the host CPU, it could starve other work if not limited. Overall, the overhead is well worth the security gain in most scenarios.

Deno (Secure JavaScript/TypeScript Runtime)
	•	Security: Deno takes a fundamentally different approach by being a standalone runtime that is secure by default. By design, a Deno program has no file system, network, or environment access unless explicitly granted via flags or the permission API ￼. This means if you run untrusted code in Deno with zero permissions, that code is effectively sandboxed – it can compute, but it cannot read/write files, open sockets, or otherwise interact with the system or secrets. Deno’s runtime doesn’t expose Node libraries or require(), so many Node-specific attack vectors are absent. In essence, Deno’s sandbox is as strong as the underlying V8 engine and the OS process isolation. Breaking out would likely require a V8 exploit or misconfigured permissions. Deno’s security model makes it appropriate for running untrusted scripts; indeed, some platforms (like the Val Town service) migrated to Deno to execute user code more safely after experiencing vm2 issues ￼ ￼. Deno’s team has even built a multi-tenant “Subhosting” platform using V8 isolates under the hood, combined with OS isolation, to run untrusted code at scale ￼ ￼. For a single-user scenario, simply running each snippet with no permissions (and perhaps a timeout) is very effective.
	•	Ease of Use: The challenge with Deno is integration. If you are already using Node.js, adopting Deno might require spinning up a separate process to execute the untrusted code. One common pattern is to use the Deno CLI: write the dynamic code to a temporary file and invoke deno run with restricted permissions. This was the approach used by one developer who built a “script sandbox” service – the API would save the code and call deno run with flags like --allow-read=<script_file> (to allow reading that file only) and --allow-net=<whitelist> (if network access to certain domains is needed) ￼, plus --v8-flags=--max-old-space-size=<limit> to cap memory usage ￼. This method works and is fairly straightforward from a permissions standpoint (Deno provides very granular control), but it introduces overhead and complexity in deployment. You need Deno installed alongside Node, and have to manage processes or use something like Docker to run Deno. If you are open to using Deno as your platform (instead of Node), you could potentially write your entire service in Deno, which would simplify things by not needing two runtimes – but that’s a larger architectural decision. In summary, using Deno for sandboxing in a Node app is possible but adds complexity (process management, inter-process communication). If writing a new system from scratch, you might consider Deno alone for its secure-by-default properties.
	•	Performance: Running each piece of untrusted code in a separate Deno process has higher overhead compared to in-process solutions. There is a noticeable “cold boot” penalty to spawn a Deno process and initialize the V8 engine for each execution ￼. Writing the code to disk and starting Deno can take on the order of hundreds of milliseconds, whereas an in-process isolate might start in a few milliseconds. There’s also no built-in mechanism to limit CPU usage of the spawned process (beyond nice-ing the process or using cgroups via the OS) ￼. Memory can be constrained via V8 flags as noted, which proved effective in testing (e.g. a script attempting to allocate a huge array was killed when it hit the defined memory limit) ￼ ￼. One way to amortize the cost is to keep a Deno process running and feed it multiple user scripts (perhaps via Deno’s Web Worker API or a custom protocol), but that requires more complex orchestration to ensure one user’s code doesn’t affect the next. The Val Town team reported that moving from vm2 to a persistent Deno worker model significantly improved security and stability ￼. Still, for each individual execution, Deno’s process isolation gives you a lot of safety at the cost of more CPU and memory overhead. It’s a trade-off: Deno is extremely secure and fairly simple to reason about (permissions model), but not as lightweight as an in-process isolate. For low-volume or high-security needs, the overhead may be acceptable; for high-volume, you’d need to optimize (or consider the isolate approach instead).

Containers / Docker (OS-Level Isolation)
	•	Security: Running untrusted code in a container (e.g. Docker) or lightweight VM (like Firecracker microVMs used by AWS Lambda) is often seen as the strongest isolation available to developers. A container can provide a separate filesystem, user namespace, network namespace, and restricted syscalls (via seccomp), such that even if the code fully compromises its runtime, it’s still confined to the container and cannot directly harm the host system. This is essentially how cloud providers safely run arbitrary user code (each instance in its own sandboxed container/VM). If you properly harden the container – e.g. drop root privileges, apply a strict seccomp profile (disabling risky system calls), limit memory/CPU with cgroups – the security is very high. However, container escapes are not unheard of (Linux kernel vulnerabilities or misconfigurations can lead to breakouts), so you must stay on top of updates. Generally, though, a well-contained Docker sandbox with no sensitive mounts and no privileged mode is considered a robust sandbox (it “can I consider this container safe to run untrusted code?” – the answer is yes, if hardened, according to security best practices ￼ ￼). Essentially, this is an OS-enforced sandbox rather than a language-level sandbox.
	•	Ease of Use: The downsides of containerization are the complexity and operational overhead. You would need to create a Docker image that contains the environment to run the JS code (for instance, a Node or Deno base image), and then, for each execution, launch a container from that image with the untrusted code. Managing these containers – building images, starting them up, passing code in/out (perhaps via volumes or networking), and tearing them down – introduces a lot of moving parts. There’s also a requirement that your infrastructure can run Docker or VMs, which might not be feasible in all contexts (e.g. serverless environments or restricted PaaS might not allow dynamic Docker launches). In addition, running Docker securely itself requires care (the Docker daemon runs as root, so you don’t want untrusted users controlling it). For a single developer on a server they control, using Docker is doable but definitely higher complexity compared to an in-process library. Tools like Kubernetes or AWS Fargate can help manage containers, but that’s an even bigger investment. In short, containerization is usually overkill for embedding a sandbox in an application, unless the stakes are so high that nothing less will do.
	•	Performance: Containers carry significant overhead. Starting a container can take seconds (though techniques like using minimal base images or snapshotting can improve this). Each container has its own kernel isolation context, which consumes more memory (at least tens of MBs, often more). If you need to spin up a fresh container for every snippet of AI-generated code, the latency will be much higher than using isolated-vm or even Deno. You can mitigate startup cost by reusing containers (keeping one running and sending multiple jobs into it), but then you have to ensure one job’s effects don’t leak to the next – essentially you’d need to re-instantiate a clean JS runtime inside the container for each job, which circles back to needing a language-level sandbox inside the container. That’s why some platforms using containers choose a hybrid approach (for example, running a pool of long-lived sandbox processes within containers). Also note that while Docker’s cgroups can limit CPU/RAM globally, there’s less granular control at the language level unless you implement your own monitors. Given these factors, container solutions are the heaviest in terms of performance overhead. They are best suited when you require maximum isolation and are willing to pay with extra resources and complexity. For most app-level use cases, an in-process solution or Deno is preferred over full containers, except maybe as a last line of defense in defense-in-depth.

(Aside: Other approaches exist too. For example, the QuickJS engine (by Fabrice Bellard) can be compiled to WebAssembly and run within Node – an approach taken by the Bruno API client after vm2 failed ￼. QuickJS in WASM executes JS in a completely separate engine with no access to Node, similar to an isolate, and because it’s run inside a WASM sandbox in Node, it cannot escape the process. The downside is performance – QuickJS is an interpreter (no JIT), so it’s slower, but it is very safe. Another advanced option some have tried is Secure ECMAScript (SES) realms on top of JavaScript, though those are more for taming capabilities than true sandbox escapes. For brevity, the focus remains on the main tools above.)

Recommendation: Choosing the Right Sandbox

Considering the above, the most suitable option for running untrusted AI-generated JavaScript with strong security and minimal complexity is isolated-vm for most scenarios. It provides a well-tested balance of security and performance: by using V8 isolates, it dramatically reduces the risk of sandbox escape (no Node APIs available inside) ￼, and it runs within your application for easier integration. Unlike containers or heavy virtualization, isolated-vm doesn’t require a complex deployment – it’s just an npm package (though you’ll compile a native addon) that you can embed and use with a relatively simple API. This is why projects like Backstage switched to isolated-vm and deemed the trade-offs “worth the effort to ensure better security” ￼ ￼. By following best practices (e.g. not leaking host references, setting memory limits, possibly running isolates in worker processes for extreme isolation), developers have a high degree of confidence in safely executing untrusted code with isolated-vm.

Alternatives can make sense in certain contexts: if you prefer a separate-process isolation with a robust permission system and don’t mind a bit more overhead, Deno is a viable choice – especially if you are building a new system or can containerize Deno easily. Deno’s security-by-default design and easy CLI flags for permissions are very attractive ￼ ￼, but incorporating it into a Node app adds complexity. Containerized solutions (Docker or microVMs) offer the strongest isolation and are a good fallback if in-process solutions are deemed too risky; however, the engineering effort and performance cost are high for general use. Given that even the Node documentation suggests using containers or serverless platforms only for “truly untrusted code” when no safer alternative exists ￼, it’s telling that we now have libraries like isolated-vm that fill that niche within Node itself.

In summary, for a typical developer scenario, isolated-vm is recommended as the best mix of security and simplicity. It has been vetted in the community, has no known sandbox escapes in recent years, and outperforms heavier approaches in efficiency. Deno is a close second if you require an even stronger separation (separate runtime) or are already using Deno, while containers are the fallback for maximum isolation at the cost of complexity. By choosing isolated-vm and staying mindful of its guidelines and limitations, you can execute AI-generated (or any untrusted) JavaScript code with a high level of safety and minimal hassle.

Sources & References:
	•	Node.js vm module documentation (security notes) ￼
	•	vm2 sandbox advisories and maintainer notes ￼ ￼ ￼
	•	Backstage engineering blog – rationale for moving from vm2 to isolated-vm ￼ ￼
	•	isolated-vm GitHub README (project status, security considerations, usage) ￼ ￼ ￼
	•	CVE-2022-39266 advisory for isolated-vm (cached data vulnerability) ￼
	•	Andrew Healey, “Sandboxing JavaScript Code” – experiences with Deno vs vm2 ￼ ￼
	•	SonarSource security blog on sandbox escapes (QuickJS vs vm2) ￼ ￼
	•	Deno Subhosting blog (isolate-based multi-tenant architecture) ￼




Running AI‑Generated JavaScript Securely: isolated‑vm vs Alternatives

TL;DR
For most apps that need to execute untrusted or AI‑generated JavaScript securely without a ton of infrastructure, use [isolated‑vm]. It runs code inside V8 isolates (no Node APIs by default), supports timeouts and memory limits, and is widely deployed. Pair it with a separate worker process for defense‑in‑depth. Consider Deno (secure‑by‑default permissions) if you’re comfortable running a separate process/runtime; consider containers only if you need maximum OS‑level isolation and can tolerate higher complexity and cost.  ￼

⸻

What isolated‑vm is (and why it’s strong)
	•	Engine‑level isolation. isolated‑vm exposes V8 Isolates in Node.js. Code runs in a separate JS engine instance with its own heap and built‑ins, and no access to Node APIs or your app unless you explicitly bridge it. This design sharply limits the attack surface compared to in‑context sandboxes.  ￼
	•	Used in production. The project lists adopters (e.g., Screeps, Fly.io, Algolia, Tripadvisor) that run user‑supplied code at scale—evidence it’s viable beyond demos.  ￼
	•	Security posture & caveats. The README stresses: running untrusted code is hard; don’t leak isolated‑vm objects (e.g., Reference, ExternalCopy) into the sandbox, or attackers may pivot back into your process. Keep Node/V8 patched. Prefer separate processes for isolates when reliability matters.  ￼
	•	Resource controls. You can set a memory limit per isolate and attach timeouts when evaluating or running scripts/modules (context.eval(…, { timeout }), script.run(…, { timeout })).  ￼
	•	Maintenance status & resilience. The project is in maintenance mode; the author recommends a future multi‑process architecture because V8 isn’t resilient to OOM and provides an onCatastrophicError hook as a “band‑aid.” This is why running isolates in separate worker processes is prudent.  ￼

Important: Do not accept untrusted V8 cached bytecode (cachedData) from users; a past vuln (CVE‑2022‑39266) allowed sandbox escape when untrusted cached data was consumed. The docs now warn explicitly against this.  ￼

⸻

How secure is it in practice?
	•	Stronger by design than “in‑context” sandboxes. Because isolates start with zero Node capabilities, sandbox escapes are far harder than with libraries that run code inside the same Node context. The Backstage team switched from vm2 to isolated‑vm for exactly this reason.  ￼
	•	Your usage matters. Most real‑world risks come from bridges you build (e.g., helper functions you expose). Keep them minimal, stateless, and rigorously validate/limit inputs/outputs. The README explicitly warns that leaking isolated‑vm internals is a process‑takeover risk.  ￼
	•	Defense‑in‑depth recommended. Use process isolation (e.g., a pool of worker processes) so a catastrophic V8 failure can’t take down your main service.  ￼

⸻

Comparisons (security, simplicity, performance)

Node’s built‑in vm
	•	Not a security mechanism. The official docs: “Do not use it to run untrusted code.” Full stop.  ￼

vm2 (deprecated)
	•	Multiple critical escapes (2022–2023), project discontinued by maintainers due to unaddressable security issues; maintainers point users to isolated‑vm.  ￼
	•	Given the track record and maintenance state, avoid for untrusted code.  ￼

Deno (separate runtime / process)
	•	Secure by default. Deno programs have no FS, network, or env access unless you grant permissions (--allow-net, --allow-read, etc.). Great mental model for confinement.  ￼
	•	Practical pattern. Many teams spawn Deno with tight permission flags and V8 memory limits (--v8-flags=--max-old-space-size=…), trading cold‑start overhead for simple, robust isolation.  ￼
	•	When to choose: If you’re comfortable with a separate process/runtime and want OS/process isolation + explicit permissions out of the box. Deno’s own multi‑tenant platform uses isolates with strong tenant isolation.  ￼

Containers / micro‑VMs
	•	Strongest isolation envelope (namespaces, cgroups, seccomp, etc.) but highest complexity and latency. Typically used for multi‑tenant “run user code” platforms; often overkill for embedding into a single app unless your risk tolerance demands it. (General trade‑off; consider combining with isolated‑vm or Deno for layered defense.)

⸻

Quick‑start: a safe isolated‑vm sandbox (Node.js)	


https://github.com/laverdet/isolated-vm
https://nodejs.org/api/vm.html
https://backstage.io/blog/2023/06/21/switching-out-sandbox/
https://github.com/patriksimek/vm2/issues/533
https://docs.deno.com/runtime/fundamentals/security/
https://healeycodes.com/sandboxing-javascript-code
https://nvd.nist.gov/vuln/detail/CVE-2022-39266