export class ValidationService {
  
  async validateAgentInput(agentName?: string, prompt?: string, chatMode?: boolean): Promise<void> {
    // If no agent name provided, we'll show the list (handled in command)
    if (!agentName) {
      return;
    }

    // Validate agent name
    if (typeof agentName !== 'string' || agentName.trim().length === 0) {
      throw new Error(`❌ Invalid agent name

Problem: Agent name is empty or invalid
Provided: "${agentName}"

Next steps:
1. Provide a valid agent name with -a or --agent flag
2. Use 'mj-ai agents:list' to see available agents
3. Example: mj-ai agents:run -a "Demo Loop Agent" -p "Hello world"`);
    }

    // In chat mode, prompt is optional (can be provided later)
    if (!chatMode && (!prompt || prompt.trim().length === 0)) {
      throw new Error(`❌ Prompt required for agent execution

Problem: No prompt provided for non-interactive mode
Agent: ${agentName}

Next steps:
1. Provide a prompt with -p or --prompt flag
2. Or use --chat flag for interactive mode
3. Example: mj-ai agents:run -a "${agentName}" -p "Your prompt here"
4. Example: mj-ai agents:run -a "${agentName}" --chat`);
    }

    // Validate prompt length (reasonable limits)
    if (prompt && prompt.length > 10000) {
      throw new Error(`❌ Prompt too long

Problem: Prompt exceeds maximum length (10,000 characters)
Current length: ${prompt.length}

Next steps:
1. Shorten your prompt to under 10,000 characters
2. Break complex requests into multiple interactions
3. Use --chat mode for longer conversations`);
    }
  }

  async validateActionInput(actionName?: string, parameters?: Record<string, any>): Promise<void> {
    // If no action name provided, we'll show the list (handled in command)
    if (!actionName) {
      return;
    }

    // Validate action name
    if (typeof actionName !== 'string' || actionName.trim().length === 0) {
      throw new Error(`❌ Invalid action name

Problem: Action name is empty or invalid
Provided: "${actionName}"

Next steps:
1. Provide a valid action name with -n or --name flag
2. Use 'mj-ai actions:list' to see available actions
3. Example: mj-ai actions:run -n "Get Weather" --param "Location=Boston"`);
    }

    // Validate parameters format
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        if (typeof key !== 'string' || key.trim().length === 0) {
          throw new Error(`❌ Invalid parameter name

Problem: Parameter name is empty or invalid
Parameter: "${key}"

Next steps:
1. Ensure parameter names are non-empty strings
2. Use format: --param "ParameterName=value"
3. Example: --param "Location=Boston" --param "Units=metric"`);
        }

        // Check for potentially problematic values
        if (typeof value === 'string' && value.length > 5000) {
          throw new Error(`❌ Parameter value too long

Problem: Parameter "${key}" exceeds maximum length (5,000 characters)
Current length: ${value.length}

Next steps:
1. Shorten the parameter value
2. Consider using a file reference instead of inline data
3. Break large data into smaller parameters`);
        }
      }
    }
  }

  validateTimeout(timeout: number): number {
    if (timeout < 1000) {
      throw new Error(`❌ Invalid timeout value

Problem: Timeout too short (minimum 1 second)
Provided: ${timeout}ms

Next steps:
1. Use a timeout of at least 1000ms (1 second)
2. Recommended: 30000ms (30 seconds) for simple operations
3. For complex operations: 300000ms (5 minutes) or more`);
    }

    if (timeout > 1800000) { // 30 minutes
      throw new Error(`❌ Invalid timeout value

Problem: Timeout too long (maximum 30 minutes)
Provided: ${timeout}ms

Next steps:
1. Use a timeout of at most 1800000ms (30 minutes)
2. For long-running operations, consider breaking into smaller tasks
3. Check if the operation can be optimized`);
    }

    return timeout;
  }

  validateOutputFormat(format: string): 'compact' | 'json' | 'table' {
    const validFormats = ['compact', 'json', 'table'];
    
    if (!validFormats.includes(format)) {
      throw new Error(`❌ Invalid output format

Problem: Unknown output format "${format}"
Valid formats: ${validFormats.join(', ')}

Next steps:
1. Use one of the supported formats: ${validFormats.join(', ')}
2. Example: --output compact
3. Example: --output json`);
    }

    return format as 'compact' | 'json' | 'table';
  }

  parseParameters(paramStrings: string[]): Record<string, any> {
    const parameters: Record<string, any> = {};

    for (const paramString of paramStrings) {
      const equalIndex = paramString.indexOf('=');
      
      if (equalIndex === -1) {
        throw new Error(`❌ Invalid parameter format

Problem: Parameter missing '=' separator
Parameter: "${paramString}"

Next steps:
1. Use format: --param "ParameterName=value"
2. Example: --param "Location=Boston"
3. For values with spaces: --param "Message=Hello world"`);
      }

      const key = paramString.substring(0, equalIndex).trim();
      const value = paramString.substring(equalIndex + 1);

      if (key.length === 0) {
        throw new Error(`❌ Invalid parameter format

Problem: Parameter name is empty
Parameter: "${paramString}"

Next steps:
1. Provide a parameter name before the '=' sign
2. Example: --param "Location=Boston"
3. Parameter names cannot be empty`);
      }

      // Try to parse JSON values, but fall back to string
      try {
        // Check if it looks like JSON (starts with { or [, or is a number/boolean)
        const trimmedValue = value.trim();
        if (trimmedValue.startsWith('{') || trimmedValue.startsWith('[') || 
            trimmedValue === 'true' || trimmedValue === 'false' ||
            trimmedValue === 'null' || !isNaN(Number(trimmedValue))) {
          parameters[key] = JSON.parse(trimmedValue);
        } else {
          parameters[key] = value;
        }
      } catch {
        // Not JSON, treat as string
        parameters[key] = value;
      }
    }

    return parameters;
  }

  validateDryRun(isDryRun: boolean, hasRequiredParams: boolean): void {
    if (isDryRun && !hasRequiredParams) {
      throw new Error(`❌ Dry run validation failed

Problem: Cannot validate without required parameters
Dry run: true

Next steps:
1. Provide all required parameters for validation
2. Or remove --dry-run flag to see parameter requirements
3. Use 'list' commands to see parameter requirements`);
    }
  }
}