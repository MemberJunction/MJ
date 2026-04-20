import { ActionEngineServer } from '@memberjunction/actions';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { MJActionEntity, MJActionParamEntity } from '@memberjunction/core-entities';
import { ExecutionLogger } from '../lib/execution-logger';
import { initializeMJProvider } from '../lib/mj-provider';
import { ActionInfo, ExecutionResult } from '../lib/output-formatter';

export interface ActionExecutionOptions {
  verbose?: boolean;
  timeout?: number;
  parameters?: Record<string, any>;
}

export class ActionService {
  private initialized = false;
  private contextUser?: UserInfo;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await initializeMJProvider();
      this.contextUser = await this.getContextUser();
      this.initialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize Action Service: ${error?.message || 'Unknown error'}`);
    }
  }

  async listActions(): Promise<ActionInfo[]> {
    await this.ensureInitialized();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJActionEntity>({
        EntityName: 'MJ: Actions',
        ExtraFilter: '',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      }, this.contextUser);

      if (!result.Success) {
        throw new Error(`Failed to load actions: ${result.ErrorMessage}`);
      }

      const actions = result.Results || [];
      const actionInfos: ActionInfo[] = [];

      for (const action of actions) {
        // Get parameters for this action
        const actionParameters = await this.getActionParameters(action.ID);
        
        actionInfos.push({
          name: action.Name,
          description: action.Description || undefined,
          status: 'available' as const,
          lastUsed: undefined,
          parameters: actionParameters
        });
      }

      return actionInfos;

    } catch (error: any) {
      throw new Error(`❌ Failed to list actions

Problem: ${error?.message || 'Unknown error'}
Context: Loading actions from database

Next steps:
1. Verify Actions entity exists in your database
2. Check user permissions to access Actions
3. Ensure @memberjunction/actions package is built

For help with action configuration, see the MJ documentation.`);
    }
  }

  async findAction(actionName: string): Promise<MJActionEntity | null> {
    await this.ensureInitialized();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJActionEntity>({
        EntityName: 'MJ: Actions',
        ExtraFilter: `Name = '${actionName.replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
      }, this.contextUser);

      if (!result.Success) {
        throw new Error(result.ErrorMessage || 'Unknown error');
      }

      return result.Results && result.Results.length > 0 ? result.Results[0] : null;

    } catch (error: any) {
      throw new Error(`Failed to find action "${actionName}": ${error?.message || 'Unknown error'}`);
    }
  }

  async executeAction(
    actionName: string,
    options: ActionExecutionOptions = {}
  ): Promise<ExecutionResult> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const logger = new ExecutionLogger(`actions:run`, undefined, actionName);
    
    try {
      // Find the action
      logger.logStep('INFO', 'SYSTEM', 'Finding action', { actionName });
      const action = await this.findAction(actionName);
      
      if (!action) {
        const suggestions = await this.getSimilarActionNames(actionName);
        const suggestionText = suggestions.length > 0 
          ? `\n\nDid you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}`
          : '';
        
        throw new Error(`❌ Action not found: "${actionName}"

Problem: No action exists with the specified name
Available actions: Use 'mj-ai actions:list' to see all actions${suggestionText}

Next steps:
1. Check the action name spelling
2. Use 'mj-ai actions:list' to see available actions
3. Verify the action is deployed and enabled`);
      }

      logger.logStep('SUCCESS', 'SYSTEM', 'Action found', { 
        actionId: action.ID, 
        actionName: action.Name 
      });

      // Get and validate parameters
      const actionParameterDefs = await this.getActionParameters(action.ID);
      const validatedParams = this.validateAndPrepareParameters(actionParameterDefs, options.parameters || {});
      
      logger.logStep('INFO', 'SYSTEM', 'Parameters validated', { 
        providedParams: Object.keys(options.parameters || {}),
        requiredParams: actionParameterDefs.filter(p => p.required).map(p => p.name)
      });

      // Execute the action
      logger.logStep('INFO', 'AGENT', 'Starting action execution', { 
        parameters: validatedParams
      });

      const actionEngine = ActionEngineServer.Instance;
      
      // Configure the action engine with the context user
      await actionEngine.Config(false, this.contextUser!);
      
      // Convert parameters to ActionParam array
      const actionParams = Object.entries(validatedParams).map(([name, value]) => ({
        Name: name,
        Value: value,
        Type: 'Input' as const
      }));

      const executionResult = await actionEngine.RunAction({
        Action: action,
        ContextUser: this.contextUser!,
        Params: actionParams,
        Filters: []
      });

      const duration = Date.now() - startTime;

      if (executionResult && executionResult.Success) {
        // Extract output parameters as the result
        const outputParams = executionResult.Params?.filter(p => p.Type === 'Output' || p.Type === 'Both') || [];
        const resultData = outputParams.length > 0 ? outputParams : executionResult.Message || 'Action completed successfully';

        logger.logStep('SUCCESS', 'AGENT', 'Action execution completed', {
          result: typeof resultData === 'string' 
            ? resultData.substring(0, 200) + (resultData.length > 200 ? '...' : '')
            : resultData
        });

        const result: ExecutionResult = {
          success: true,
          entityName: actionName,
          result: resultData,
          duration,
          executionId: logger.getExecutionId(),
          logFilePath: logger.getLogFilePath()
        };

        logger.finalize('SUCCESS', resultData);
        return result;

      } else {
        const errorMessage = executionResult?.Message || 'Unknown execution error';
        logger.logError(errorMessage, 'AGENT');

        const result: ExecutionResult = {
          success: false,
          entityName: actionName,
          error: errorMessage,
          duration,
          executionId: logger.getExecutionId(),
          logFilePath: logger.getLogFilePath()
        };

        logger.finalize('FAILED', undefined, errorMessage);
        return result;
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || 'Unknown error';
      
      logger.logError(error, 'SYSTEM');
      logger.finalize('FAILED', undefined, errorMessage);

      // If it's already a formatted error, re-throw as is
      if (errorMessage.startsWith('❌')) {
        throw error;
      } else {
        throw new Error(`❌ Action execution failed

Problem: ${errorMessage}
Action: ${actionName}
Context: Running action with parameters

Next steps:
1. Check the action configuration and parameters
2. Verify required parameters are provided
3. Review execution logs for detailed error information
4. Test action with minimal parameters first

Log file: ${logger.getLogFilePath()}`);
      }
    }
  }

  private async getActionParameters(actionId: string): Promise<Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJActionParamEntity>({
        EntityName: 'MJ: Action Params',
        ExtraFilter: `ActionID = '${actionId}'`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      }, this.contextUser);

      if (!result.Success) {
        throw new Error(result.ErrorMessage || 'Failed to load action parameters');
      }

      return (result.Results || []).map(param => ({
        name: param.Name,
        type: param.Type || 'string',
        required: param.IsRequired || false,
        description: param.Description || undefined
      }));

    } catch (error: any) {
      // If we can't load parameters, assume none are required
      console.warn(`Warning: Could not load parameters for action ${actionId}: ${error.message}`);
      return [];
    }
  }

  private validateAndPrepareParameters(
    actionParams: Array<{ name: string; type: string; required: boolean; description?: string }>,
    providedParams: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    const missingRequired: string[] = [];

    // Check required parameters
    for (const param of actionParams) {
      if (param.required && !(param.name in providedParams)) {
        missingRequired.push(param.name);
      } else if (param.name in providedParams) {
        // Basic type conversion
        result[param.name] = this.convertParameterValue(providedParams[param.name], param.type);
      }
    }

    if (missingRequired.length > 0) {
      throw new Error(`❌ Missing required parameters

Problem: Required parameters not provided
Missing: ${missingRequired.join(', ')}

Next steps:
1. Provide all required parameters using --param flags
2. Use 'mj-ai actions:list' to see parameter requirements
3. Example: mj-ai actions:run -n "${actionParams[0]?.name || 'ActionName'}" --param "ParamName=value"

Required parameters:
${actionParams.filter(p => p.required).map(p => `  - ${p.name} (${p.type}): ${p.description || 'No description'}`).join('\n')}`);
    }

    // Add any extra provided parameters (they might be valid even if not in schema)
    for (const [key, value] of Object.entries(providedParams)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }

    return result;
  }

  private convertParameterValue(value: any, type: string): any {
    if (value === null || value === undefined) {
      return value;
    }

    switch (type.toLowerCase()) {
      case 'number':
      case 'int':
      case 'integer':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Parameter value "${value}" cannot be converted to number`);
        }
        return num;
      
      case 'boolean':
      case 'bool':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          return lower === 'true' || lower === '1' || lower === 'yes';
        }
        return Boolean(value);
      
      case 'json':
      case 'object':
        if (typeof value === 'object') return value;
        try {
          return JSON.parse(value);
        } catch {
          throw new Error(`Parameter value "${value}" is not valid JSON`);
        }
      
      default:
        return String(value);
    }
  }

  private async getSimilarActionNames(searchName: string): Promise<string[]> {
    try {
      const actions = await this.listActions();
      const searchLower = searchName.toLowerCase();
      
      return actions
        .filter(action => 
          action.name.toLowerCase().includes(searchLower) ||
          searchLower.includes(action.name.toLowerCase()) ||
          this.calculateSimilarity(action.name.toLowerCase(), searchLower) > 0.6
        )
        .map(action => action.name)
        .slice(0, 3); // Limit to 3 suggestions
    } catch {
      return [];
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private async getContextUser(): Promise<UserInfo> {
    const { UserCache } = await import('@memberjunction/sqlserver-dataprovider');
    
    // Try to get the System user like MetadataSync does
    let user = UserCache.Instance.UserByName("System", false);
    
    if (!user) {
      // Fallback to first available user if System user doesn't exist
      if (!UserCache.Instance.Users || UserCache.Instance.Users.length === 0) {
        throw new Error(`❌ No users found in UserCache

Problem: UserCache is empty or not properly initialized
Likely cause: Database connection or UserCache refresh issue

Next steps:
1. Verify database connection is working
2. Check that Users table has data
3. Ensure UserCache.Refresh() was called during initialization

This is typically a configuration or database setup issue.`);
      }
      
      user = UserCache.Instance.Users[0];
    }
    
    if (!user) {
      throw new Error('No valid user found for execution context');
    }

    return user;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}