import { ComponentSpec } from "./component-spec";
import { ComponentEntitySimplePermission } from "./data-requirements";
import { ComponentLibraryDependency } from "./library-dependency";
import { EntityPermissionType, UserInfo, Metadata } from "@memberjunction/core";

/**
 * Runtime extension of ComponentSpec that provides helper methods for permission checking,
 * validation, and other runtime operations. This class is not included in AI prompts
 * to keep token usage efficient.
 */
export class ComponentSpecRuntime extends ComponentSpec {
    /**
     * Get all unique permissions required by this component across all entities.
     * This aggregates permissions from all entity data requirements to provide
     * a complete picture of what the component needs.
     * 
     * @returns Array of unique permission types required by the component
     */
    public GetRequiredPermissions(): ComponentEntitySimplePermission[] {
        const permissions = new Set<ComponentEntitySimplePermission>();
        
        this.dataRequirements?.entities.forEach(entity => {
            entity.permissionLevelNeeded.forEach(perm => permissions.add(perm));
        });
        
        return Array.from(permissions);
    }
    
    /**
     * Check if the component only requires read permissions across all entities.
     * This is useful for determining if a component is effectively read-only
     * from a permissions perspective.
     * 
     * @returns true if the component only requires 'read' permissions
     */
    public IsEffectivelyReadOnly(): boolean {
        const perms = this.GetRequiredPermissions();
        return perms.length === 1 && perms[0] === 'read';
    }
    
    /**
     * Get all entity names that this component accesses.
     * Useful for pre-loading permissions or understanding component data dependencies.
     * 
     * @returns Array of entity names accessed by the component
     */
    public GetAccessedEntities(): string[] {
        return this.dataRequirements?.entities.map(e => e.name) || [];
    }
    
    /**
     * Check if the component has any write capabilities (create, update, or delete).
     * This helps determine if the component can modify data or is purely read-only.
     * 
     * @returns true if the component requires any write permissions
     */
    public HasWriteCapabilities(): boolean {
        return this.GetRequiredPermissions().some(p => 
            p === 'create' || p === 'update' || p === 'delete'
        );
    }
    
    /**
     * Convert component permission types to MemberJunction EntityPermissionType.
     * This enables integration with MJ's permission system.
     * 
     * @param permission - Component permission type
     * @returns MemberJunction EntityPermissionType
     */
    private convertToEntityPermissionType(permission: ComponentEntitySimplePermission): EntityPermissionType {
        switch (permission) {
            case 'read': return EntityPermissionType.Read;
            case 'create': return EntityPermissionType.Create;
            case 'update': return EntityPermissionType.Update;
            case 'delete': return EntityPermissionType.Delete;
            default: return EntityPermissionType.Read; // Safe default
        }
    }
    
    /**
     * Validate that a user has all required permissions to use this component.
     * This method checks each entity's permission requirements against the user's
     * actual permissions in MemberJunction using the Metadata system.
     * 
     * @param user - The MemberJunction UserInfo object
     * @returns Validation result with details about any missing permissions
     */
    public async ValidateUserPermissions(
        user: UserInfo
    ): Promise<{
        canRender: boolean;
        missingPermissions: Array<{
            entity: string;
            permission: ComponentEntitySimplePermission;
        }>;
        degradedPermissions: Array<{
            entity: string;
            permission: ComponentEntitySimplePermission;
            reason: string;
        }>;
    }> {
        const missing: Array<{entity: string, permission: ComponentEntitySimplePermission}> = [];
        const degraded: Array<{entity: string, permission: ComponentEntitySimplePermission, reason: string}> = [];
        
        // Get metadata instance to access entity information
        const md = new Metadata();
        
        // Check each entity's required permissions
        for (const entityReq of this.dataRequirements?.entities || []) {
            // Find the entity in the metadata
            const entityInfo = md.Entities.find(e => e.Name === entityReq.name);
            
            if (!entityInfo) {
                // Entity not found - add to missing with special reason
                for (const requiredPerm of entityReq.permissionLevelNeeded) {
                    missing.push({ entity: entityReq.name, permission: requiredPerm });
                }
                continue;
            }
            
            // Get user permissions for this entity
            const userPerms = entityInfo.GetUserPermisions(user);
            
            for (const requiredPerm of entityReq.permissionLevelNeeded) {
                let hasPermission = false;
                
                switch (requiredPerm) {
                    case 'read': hasPermission = userPerms.CanRead; break;
                    case 'create': hasPermission = userPerms.CanCreate; break;
                    case 'update': hasPermission = userPerms.CanUpdate; break;
                    case 'delete': hasPermission = userPerms.CanDelete; break;
                }
                
                if (!hasPermission) {
                    missing.push({ entity: entityReq.name, permission: requiredPerm });
                }
            }
        }
        
        return {
            canRender: missing.length === 0,
            missingPermissions: missing,
            degradedPermissions: degraded
        };
    }
    
    /**
     * Get a summary of all data access patterns for this component.
     * Useful for documentation and understanding component behavior.
     * 
     * @returns Object describing all data access patterns
     */
    public GetDataAccessSummary(): {
        mode: string;
        entityCount: number;
        queryCount: number;
        requiresWrite: boolean;
        entities: Array<{name: string, permissions: string[]}>;
        queries: Array<{name: string, category: string}>;
    } {
        const entitySummary = this.dataRequirements?.entities.map(e => ({
            name: e.name,
            permissions: e.permissionLevelNeeded
        })) || [];
        
        const querySummary = this.dataRequirements?.queries.map(q => ({
            name: q.name,
            category: q.categoryPath
        })) || [];
        
        return {
            mode: this.dataRequirements?.mode || 'none',
            entityCount: entitySummary.length,
            queryCount: querySummary.length,
            requiresWrite: this.HasWriteCapabilities(),
            entities: entitySummary,
            queries: querySummary
        };
    }
    
    /**
     * Create a ComponentSpecRuntime instance from a plain object.
     * Useful when deserializing from JSON or database storage.
     * 
     * @param obj - Plain object with ComponentSpec properties
     * @returns New ComponentSpecRuntime instance
     */
    public static FromObject(obj: ComponentSpec): ComponentSpecRuntime {
        const instance = new ComponentSpecRuntime();
        Object.assign(instance, obj);
        return instance;
    }
    
    /**
     * Create a ComponentSpecRuntime instance from JSON string.
     * Handles parsing and object conversion in one step.
     * 
     * @param json - JSON string representation of a ComponentSpec
     * @returns New ComponentSpecRuntime instance
     */
    public static FromJSON(json: string): ComponentSpecRuntime {
        const obj = JSON.parse(json);
        return ComponentSpecRuntime.FromObject(obj);
    }
    
    /**
     * Get all external library dependencies for this component.
     * Returns both the library names and their global variables.
     * 
     * @returns Array of library dependencies with details
     */
    public GetLibraryDependencies(): ComponentLibraryDependency[] {
        return this.libraries || [];
    }
    
    /**
     * Check if this component depends on a specific library.
     * Can check by either library name or global variable.
     * 
     * @param libraryNameOrGlobal - Library name or global variable to check
     * @returns true if the component depends on the specified library
     */
    public DependsOnLibrary(libraryNameOrGlobal: string): boolean {
        return this.libraries?.some(lib => 
            lib.libraryName === libraryNameOrGlobal || 
            lib.globalVariable === libraryNameOrGlobal
        ) || false;
    }
    
    /**
     * Get all component dependencies recursively.
     * Traverses the entire dependency tree to return a flat list of all
     * components this one depends on, directly or indirectly.
     * 
     * @param visitedNames - Set of already visited component names (for cycle detection)
     * @returns Array of all component dependencies
     */
    public GetAllDependencies(visitedNames = new Set<string>()): ComponentSpec[] {
        const allDeps: ComponentSpec[] = [];
        
        // Avoid cycles
        if (visitedNames.has(this.name)) {
            return allDeps;
        }
        visitedNames.add(this.name);
        
        // Process direct dependencies
        for (const dep of this.dependencies || []) {
            allDeps.push(dep);
            
            // Recursively get subdependencies if it's a runtime instance
            if (dep instanceof ComponentSpecRuntime) {
                allDeps.push(...dep.GetAllDependencies(visitedNames));
            }
        }
        
        return allDeps;
    }
}