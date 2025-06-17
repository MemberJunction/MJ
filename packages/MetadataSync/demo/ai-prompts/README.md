# AI Prompts Demo - Field Management

This demo illustrates how to use `excludeFields` and `preserveFields` in your `.mj-sync.json` configuration.

## Configuration Overview

Check the `.mj-sync.json` file in this directory to see:

```json
{
  "pull": {
    "excludeFields": ["TemplateID", "InternalMetrics"],
    "preserveFields": ["Prompt", "Notes"],
    ...
  }
}
```

## How It Works

### excludeFields
- **TemplateID** and **InternalMetrics** are completely omitted from the JSON files
- These fields won't appear in any of the `.json` files in this directory
- Use this for internal database fields that shouldn't be in version control

### preserveFields  
- **Prompt** and **Notes** fields keep their local values during pull updates
- Even if the database has different values, these fields won't be overwritten
- Perfect for local customizations like file paths or development notes

## Example Scenario

1. You customize the Prompt field locally:
   ```json
   "Prompt": "@file:my-custom-path/prompt.md"
   ```

2. Someone updates the prompt in the database

3. When you run `mj-sync pull`:
   - Other fields (Name, Description, etc.) get updated from the database
   - But your custom Prompt path is preserved!

## Real-World Use Case

Look at `.field-management-example.json` to see how these fields work in practice:
- The file doesn't have TemplateID or InternalMetrics (excluded)
- The Prompt and Notes fields contain local customizations (preserved)

This pattern is especially useful when:
- Working with file references that differ between environments
- Maintaining local development notes
- Customizing paths after initial setup