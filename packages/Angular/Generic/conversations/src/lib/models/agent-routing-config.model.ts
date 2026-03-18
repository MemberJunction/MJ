export interface AgentRoutingConfig {
  AvailableAgents?: { ID: string; Name: string }[];
  DefaultAgent?: { ID: string; Name: string };
}
