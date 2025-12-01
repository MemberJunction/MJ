/**
 * Generic navigation request for cross-resource navigation.
 * Used when a component needs to request navigation to another nav item
 * within the same or different application.
 */
export interface NavigationRequest {
  /**
   * The label/name of the target nav item to navigate to.
   * This should match the Label property of a NavItem in the target application.
   * Examples: "Conversations", "Collections", "Tasks"
   */
  navItemName: string;

  /**
   * Additional configuration parameters to pass to the target resource.
   * These will be merged with the nav item's existing configuration.
   * Examples: { conversationId: '...', artifactId: '...', versionNumber: 1 }
   */
  params?: Record<string, unknown>;

  /**
   * Optional target application ID.
   * If not provided, defaults to the current active application.
   * Use this when navigating to a nav item in a different application.
   */
  appId?: string;
}
