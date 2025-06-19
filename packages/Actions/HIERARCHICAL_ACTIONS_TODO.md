# Hierarchical Actions Implementation Plan

## Overview
Implement parent-child relationships for Actions, allowing specialized actions to inherit from and extend more generic parent actions. This includes LLM-based code generation for "Generated" type actions with automatic parameter discovery.

## Implementation Tasks (Single Phase)

### 1. Database Schema Updates

#### 1.1 Add ParentID Column
- [ ] Create migration file: `V202412190001__Add_ParentID_To_Action.sql`
  ```sql
  ALTER TABLE ${flyway:defaultSchema}.__mj.Action 
  ADD ParentID uniqueidentifier NULL;
  
  ALTER TABLE ${flyway:defaultSchema}.__mj.Action
  ADD CONSTRAINT FK_Action_ParentID 
  FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.__mj.Action(ID);
  
  CREATE INDEX IX_Action_ParentID ON ${flyway:defaultSchema}.__mj.Action(ParentID);
  ```
- [ ] Update entity field descriptions using sp_addextendedproperty
- [ ] Run CodeGen to update ActionEntity class with ParentID property

#### 1.2 Update Action Views
- [ ] Update `vwActions` to include ParentID and Parent (name) fields
- [ ] Create `vwActionHierarchy` with recursive CTE showing full lineage:
  ```sql
  WITH ActionHierarchy AS (
    -- Base case: root actions
    -- Recursive case: child actions
  )
  ```

### 2. AI Prompt Creation

#### 2.1 Create Metadata-Managed Prompts
- [ ] Create `/metadata/AI_Prompts/action_generation_base.md` for non-parent actions
  - Modernize for Claude 3.5, GPT-4+ capabilities
  - Include sections: Purpose, Parameters, Code Structure, Error Handling
  - Add TypeScript best practices and MJ patterns
- [ ] Create `/metadata/AI_Prompts/action_generation_child.md` for child actions
  - Parent context injection template
  - Pre-processing section for parameter mapping
  - Parent invocation via `ActionEngine.Instance.RunAction()`
  - Post-processing and result transformation
  - Clear examples of child-to-parent parameter mapping

#### 2.2 System Prompt Content Structure
- [ ] Base prompt should include:
  ```markdown
  ## Action Code Generation Instructions
  
  You are generating TypeScript code for a MemberJunction Action.
  
  ### Requirements:
  1. Extend BaseAction class
  2. Implement InternalRunAction method
  3. Return ActionResultSimple with Success, ResultCode, Message
  4. Define all parameters with clear types and descriptions
  5. Handle errors gracefully with try-catch
  6. Use async/await for all asynchronous operations
  
  ### Parameter Definition Format:
  Return parameters as JSON array with this structure:
  {
    "parameters": [
      {
        "Name": "ParameterName",
        "Type": "String|Int|Date|Boolean|Object|Array",
        "IsRequired": true/false,
        "DefaultValue": null or value,
        "Description": "Clear description",
        "ParamType": "Input|Output|Both"
      }
    ]
  }
  ```

- [ ] Child action prompt additions:
  ```markdown
  ### Parent Action Context:
  Parent Name: {{ParentName}}
  Parent Description: {{ParentDescription}}
  Parent Parameters: {{ParentParametersJSON}}
  
  ### Child Action Pattern:
  1. Pre-process child parameters into parent format
  2. Invoke parent: const result = await ActionEngine.Instance.RunAction({
       ActionName: '{{ParentName}}',
       Params: mappedParams,
       ContextUser: params.ContextUser
     });
  3. Post-process parent results into child format
  
  ### Example Parameter Mapping:
  Child params (FirstName, LastName) → Parent param (Settings: {first_name, last_name})
  ```

### 3. ActionEntityServerEntity Updates

#### 3.1 Refactor Code Generation
- [ ] In `packages/Actions/Engine/src/ActionEntity.server.ts`:
  - Remove hardcoded prompt
  - Import AIPromptRunner from @memberjunction/ai
  - Add method to load appropriate prompt based on ParentID
  - Implement parent context loading when ParentID exists

#### 3.2 Implement Parameter Auto-Generation
- [ ] Parse LLM response to extract both code and parameters
- [ ] Create ActionParamEntity instances for each parameter
- [ ] Handle parameter updates on regeneration:
  - Soft delete removed parameters
  - Update existing parameters
  - Add new parameters
- [ ] Set proper sequence numbers for parameter ordering

#### 3.3 Parent Context Injection
- [ ] When ParentID exists:
  ```typescript
  const parentAction = await md.GetEntityObject<ActionEntity>('Actions');
  await parentAction.Load(this.ParentID);
  
  const parentParams = await rv.RunView<ActionParamEntity>({
    EntityName: 'Action Params',
    ExtraFilter: `ActionID = '${this.ParentID}'`,
    ResultType: 'entity_object'
  });
  
  const parentContext = {
    Name: parentAction.Name,
    Description: parentAction.Description,
    Parameters: parentParams.Results.map(p => ({
      Name: p.Name,
      Type: p.Type,
      Description: p.Description,
      IsRequired: p.IsRequired
    }))
  };
  ```

### 4. CodeGen Integration

#### 4.1 Update Action Code Generation
- [ ] In `packages/CodeGenLib/src/action_subclasses_codegen.ts`:
  - Ensure Generated type actions with emitted code are included
  - Handle new GeneratedCode field if different from Code field
  - Maintain library aggregation for imports

#### 4.2 UI Integration Check
- [ ] Verify Actions Explorer allows running Generated actions only after code emission
- [ ] Add validation: Generated actions require non-empty Code field

### 5. Testing & Validation

#### 5.1 Create Test Hierarchy
- [ ] Create parent action: "Generic REST API"
  - Parameters: Method, URL, Headers, Body
  - Type: Custom (implement simple HTTP client)
- [ ] Create child action: "Call Salesforce API"
  - Parameters: Action, ObjectType, Data
  - Maps to parent's generic parameters
- [ ] Create grandchild: "Create Salesforce Contact"  
  - Parameters: FirstName, LastName, Email, AccountId
  - Maps to parent's specific action format

#### 5.2 Validation Points
- [ ] Circular reference prevention (A→B→A)
- [ ] Parameter mapping correctness
- [ ] Error propagation through hierarchy
- [ ] Context preservation through calls

### 6. Documentation Updates

#### 6.1 Update Root CLAUDE.md
- [ ] Add note about Record Changes feature for entity versioning
- [ ] Document the new hierarchical actions pattern
- [ ] Add examples of parent-child action relationships

#### 6.2 Create Actions README
- [ ] Document the hierarchical pattern
- [ ] Provide examples of good parent-child relationships
- [ ] Explain parameter mapping strategies

## Future Enhancements (Not Part of Current Implementation)

### Possible Future Features
1. **Action Templates/Archetypes**
   - Pre-built parent actions for common patterns (REST API, GraphQL, Database, etc.)
   - Marketplace for sharing parent action templates

2. **Advanced Validation Agent**
   - Multi-agent system to review, test, and iterate on generated code
   - Automated testing of parameter mappings
   - Code quality and security scanning

3. **Multiple Inheritance**
   - Support for multiple ParentIDs (action mixins)
   - Composition patterns beyond simple hierarchy

4. **Visual Action Designer**
   - Drag-drop interface for building action hierarchies
   - Visual parameter mapping tools
   - Real-time code preview

5. **Performance Optimizations**
   - Compile action hierarchies into single execution plan
   - Cache resolved parameter mappings
   - Parallel execution of independent child actions

## Technical Notes

### Parameter Mapping Philosophy
- Child actions have user-friendly, semantic parameters (FirstName, not first_name)
- Parent actions have generic, flexible parameters (Settings object, not individual fields)
- LLM handles the mapping logic in generated code
- This creates a clean abstraction layer for end users

### Execution Model
- Runtime traversal of hierarchy (not pre-compiled)
- Each action in hierarchy executes independently
- Context flows through the chain via ActionEngine.RunAction calls
- Full audit trail maintained at each level

### Type Safety
- Generated code is full TypeScript with proper types
- CodeGen compiles all generated actions
- Runtime type checking via existing parameter validation
- Build-time type checking via TypeScript compiler

## Success Criteria
- [ ] ParentID relationships work correctly
- [ ] LLM generates both code and parameters successfully
- [ ] Child actions can invoke parent actions
- [ ] Parameter mapping works as designed
- [ ] No manual parameter management needed for Generated actions
- [ ] Test hierarchy executes successfully end-to-end