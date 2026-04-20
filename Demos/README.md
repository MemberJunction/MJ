# MemberJunction Demos

This directory contains complete demonstration applications showcasing various MemberJunction capabilities. Each demo is a standalone example with its own metadata, documentation, and optional code.

## Available Demos

### [Event Abstract Submission](./EventAbstractSubmission)

**Status**: Active
**Type**: Flow Agent System
**Integrations**: Typeform, Events Schema

Automated conference abstract submission processing system demonstrating:
- Flow agents with deterministic workflows
- Sub-agent delegation pattern
- ForEach loops for batch processing
- Typeform API integration
- Events database schema integration
- Multi-step data transformation

**Key Features**:
- Polls Typeform for new submissions
- Creates structured database records
- Handles speakers and submissions
- Ready for AI evaluation extension

[→ View Demo Documentation](./EventAbstractSubmission/README.md)

---

### [Advanced Entities](./AdvancedEntities)

**Status**: Active
**Type**: Schema & Data Demo
**Features**: IS-A Type Relationships, Virtual Entities

Comprehensive demonstration of two key MemberJunction entity system features:
- **IS-A Type Relationships**: Table-Per-Type inheritance with shared primary keys (Product → Meeting → Webinar, Product → Publication)
- **Virtual Entities**: Read-only aggregation view (Customer + Order → vwCustomerOrderSummary)
- 20 products, 25 customers, 85 orders of realistic sample data
- Standalone SQL script — run once, then integrate with CodeGen

**Key Concepts**:
- Shared PK pattern across IS-A inheritance chains
- Disjoint subtype enforcement
- Aggregation views as virtual entities
- Soft PK/FK metadata for virtual entities

[→ View Demo Documentation](./AdvancedEntities/README.md)

---

## Demo Structure

Each demo follows this structure:
```
/DemoName
  /metadata          # MJ metadata (agents, prompts, actions)
    /agents
    /prompts
    /actions
    .mj-sync.json    # Metadata sync configuration
  /src               # Optional: Custom TypeScript code
  /docs              # Additional documentation
  README.md          # Demo overview and setup
```

## Using Demos

### Metadata Only (Most Demos)

If the demo only contains metadata (no custom code):

1. **Install Database Schema** (if required)
   ```bash
   cd SQL\ Scripts/demo
   # Run required schema files
   ```

2. **Sync Metadata**
   ```bash
   cd Demos/DemoName/metadata
   npx mj-sync push
   ```

3. **Test via MJExplorer or API**
   - Agents appear in database
   - Use MJExplorer UI to execute
   - Or call via GraphQL API

### Demos with Custom Code

If the demo includes `/src` directory with custom code:

1. **Follow metadata steps above**

2. **Link to MJ packages** (optional, for development)
   ```bash
   cd packages/MJServer/src
   ln -s ../../../Demos/DemoName/src demos
   ```

3. **Restart MJAPI**
   ```bash
   npm run start:api
   ```

The custom code will be loaded in development mode.

## Not in Monorepo

**Important**: Demo folders are NOT part of the NPM workspace monorepo. This is intentional:
- ✅ Keeps demos isolated
- ✅ Won't slow down main builds
- ✅ Can be tested independently
- ✅ Easy to distribute separately

If you need to use MJ packages from demo code:
- Use `npm link` for development
- Or create symlink (see demo README)
- Or reference built packages directly

## Creating New Demos

To create a new demo:

1. **Create folder structure**
   ```bash
   mkdir -p Demos/YourDemo/metadata/{agents,prompts,actions}
   ```

2. **Create .mj-sync.json**
   ```json
   {
     "$schema": "../../../packages/MetadataSync/schema.json",
     "metadataPath": ".",
     "verbose": true
   }
   ```

3. **Add metadata files**
   - Create agent definitions in `/metadata/agents`
   - Create prompts in `/metadata/prompts`
   - Add custom actions if needed

4. **Document**
   - Create README.md with setup instructions
   - Include payload examples
   - List prerequisites

5. **Update this file**
   - Add your demo to the list above

## Demo Guidelines

**Good Demos**:
- ✅ Solve a complete use case
- ✅ Use real integrations (APIs, databases)
- ✅ Include comprehensive documentation
- ✅ Provide test data and examples
- ✅ Show best practices
- ✅ Are easy to set up and run

**Avoid**:
- ❌ Trivial "hello world" examples
- ❌ Demos that require extensive setup
- ❌ Demos without documentation
- ❌ Demos that depend on external services without fallbacks

## Questions?

For issues or questions about demos:
- Check the demo's own README first
- See main MJ documentation: https://docs.memberjunction.org
- File an issue in the MJ repository

## License

Demos are provided as examples and learning resources. They use the same license as the main MemberJunction project.
