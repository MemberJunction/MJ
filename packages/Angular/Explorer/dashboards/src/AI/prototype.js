import React, { useState } from 'react';
import { 
  BarChart3, 
  Activity, 
  Box, 
  Server, 
  FileText, 
  Users, 
  Clock, 
  Database, 
  Settings, 
  Search, 
  PlusCircle, 
  MoreHorizontal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Filter,
  ChevronDown
} from 'lucide-react';

// Mock data
const mockAgents = [
  { id: 1, name: "Customer Support Agent", status: "active", lastRun: "10 minutes ago", type: "Root", prompts: 3, children: 2 },
  { id: 2, name: "Data Analysis Agent", status: "active", lastRun: "1 hour ago", type: "Root", prompts: 5, children: 4 },
  { id: 3, name: "Content Generation Agent", status: "inactive", lastRun: "3 days ago", type: "Child", prompts: 2, children: 0 },
  { id: 4, name: "Membership Manager", status: "active", lastRun: "Just now", type: "Root", prompts: 6, children: 3 },
  { id: 5, name: "Email Composer", status: "active", lastRun: "2 hours ago", type: "Child", prompts: 2, children: 0 }
];

const mockModels = [
  { id: 1, name: "GPT-4o", vendor: "OpenAI", type: "LLM", powerRank: 10, status: "active" },
  { id: 2, name: "Claude 3.5 Sonnet", vendor: "Anthropic", type: "LLM", powerRank: 9, status: "active" },
  { id: 3, name: "GPT-4o Mini", vendor: "OpenAI", type: "LLM", powerRank: 7, status: "active" },
  { id: 4, name: "DALL-E 3", vendor: "OpenAI", type: "Image Generation", powerRank: 8, status: "active" },
  { id: 5, name: "Gemini 1.5 Pro", vendor: "Google", type: "LLM", powerRank: 8, status: "inactive" }
];

const mockPrompts = [
  { id: 1, name: "Customer Greeting", modelType: "LLM", lastUsed: "Today", cacheHits: 245, executions: 890 },
  { id: 2, name: "Data Summarization", modelType: "LLM", lastUsed: "Today", cacheHits: 134, executions: 421 },
  { id: 3, name: "Image Description", modelType: "LLM", lastUsed: "Yesterday", cacheHits: 52, executions: 103 },
  { id: 4, name: "Content Generation", modelType: "LLM", lastUsed: "Today", cacheHits: 312, executions: 967 },
  { id: 5, name: "Logo Creation", modelType: "Image Generation", lastUsed: "3 days ago", cacheHits: 12, executions: 45 }
];

const mockExecutions = [
  { id: 1, timestamp: "2025-05-21T10:35:00", agentName: "Customer Support Agent", promptName: "Customer Greeting", modelName: "GPT-4o", status: "success", duration: "1.2s", tokens: 450, cost: "$0.023" },
  { id: 2, timestamp: "2025-05-21T10:30:00", agentName: "Data Analysis Agent", promptName: "Data Summarization", modelName: "Claude 3.5 Sonnet", status: "success", duration: "2.1s", tokens: 780, cost: "$0.031" },
  { id: 3, timestamp: "2025-05-21T10:25:00", agentName: "Membership Manager", promptName: "Member Profile Analysis", modelName: "GPT-4o", status: "error", duration: "0.8s", tokens: 320, cost: "$0.018" },
  { id: 4, timestamp: "2025-05-21T10:20:00", agentName: "Email Composer", promptName: "Email Draft", modelName: "GPT-4o Mini", status: "success", duration: "0.6s", tokens: 520, cost: "$0.012" },
  { id: 5, timestamp: "2025-05-21T10:15:00", agentName: "Content Generation Agent", promptName: "Blog Outline", modelName: "Claude 3.5 Sonnet", status: "success", duration: "1.7s", tokens: 620, cost: "$0.025" }
];

const mockMetrics = {
  promptExecutions: 1254,
  tokenUsage: 8.7,
  cacheHitRate: 42,
  estimatedCost: 12.45,
  activeAgents: 8,
  topModel: "GPT-4o"
};

const mockChartData = [
  { date: "May 15", executions: 123, tokens: 6.2, cost: 8.1 },
  { date: "May 16", executions: 145, tokens: 7.5, cost: 9.2 },
  { date: "May 17", executions: 128, tokens: 6.8, cost: 8.5 },
  { date: "May 18", executions: 156, tokens: 8.1, cost: 10.3 },
  { date: "May 19", executions: 142, tokens: 7.2, cost: 9.1 },
  { date: "May 20", executions: 138, tokens: 7.0, cost: 8.9 },
  { date: "May 21", executions: 152, tokens: 7.9, cost: 10.1 }
];

// Main Application
const AIAdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Render the active tab content
  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'models':
        return <ModelsTab />;
      case 'prompts':
        return <PromptsTab />;
      case 'agents':
        return <AgentsTab />;
      case 'logs':
        return <ExecutionLogsTab />;
      case 'cache':
        return <CacheManagementTab />;
      case 'configs':
        return <ConfigurationsTab />;
      default:
        return <DashboardTab />;
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Content container */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar with tabs */}
        <div className="bg-white border-b border-slate-200">
          <div className="flex px-4 py-2 overflow-x-auto">
            <TabButton 
              icon={<BarChart3 size={18} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <TabButton 
              icon={<Server size={18} />} 
              label="Models & Vendors" 
              active={activeTab === 'models'} 
              onClick={() => setActiveTab('models')} 
            />
            <TabButton 
              icon={<FileText size={18} />} 
              label="Prompts" 
              active={activeTab === 'prompts'} 
              onClick={() => setActiveTab('prompts')} 
            />
            <TabButton 
              icon={<Users size={18} />} 
              label="Agents" 
              active={activeTab === 'agents'} 
              onClick={() => setActiveTab('agents')} 
            />
            <TabButton 
              icon={<Clock size={18} />} 
              label="Execution Logs" 
              active={activeTab === 'logs'} 
              onClick={() => setActiveTab('logs')} 
            />
            <TabButton 
              icon={<Database size={18} />} 
              label="Cache" 
              active={activeTab === 'cache'} 
              onClick={() => setActiveTab('cache')} 
            />
            <TabButton 
              icon={<Settings size={18} />} 
              label="Configurations" 
              active={activeTab === 'configs'} 
              onClick={() => setActiveTab('configs')} 
            />
          </div>
        </div>
        
        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// Tab button component
const TabButton = ({ icon, label, active, onClick }) => (
  <button 
    className={`flex items-center px-4 py-2 mx-1 rounded-md transition-colors ${
      active ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
    }`}
    onClick={onClick}
  >
    <span className="mr-2">{icon}</span>
    <span className="font-medium">{label}</span>
  </button>
);

// Status badge component
const StatusBadge = ({ status }) => {
  let bgColor, textColor, icon;
  
  switch(status.toLowerCase()) {
    case 'active':
    case 'success':
      bgColor = 'bg-green-100';
      textColor = 'text-green-700';
      icon = <CheckCircle2 size={14} className="mr-1" />;
      break;
    case 'inactive':
      bgColor = 'bg-slate-100';
      textColor = 'text-slate-700';
      icon = <XCircle size={14} className="mr-1" />;
      break;
    case 'error':
      bgColor = 'bg-red-100';
      textColor = 'text-red-700';
      icon = <AlertTriangle size={14} className="mr-1" />;
      break;
    default:
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-700';
      icon = <Activity size={14} className="mr-1" />;
  }
  
  return (
    <span className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      {icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Card component
const Card = ({ title, children, className = "", actionButton = null }) => (
  <div className={`bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
    <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200">
      <h3 className="font-medium text-slate-800">{title}</h3>
      {actionButton}
    </div>
    <div className="p-4">
      {children}
    </div>
  </div>
);

// Dashboard Tab
const DashboardTab = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard 
          title="Prompt Executions (24h)" 
          value={mockMetrics.promptExecutions} 
          icon={<Activity size={20} className="text-blue-500" />} 
          trend="+12% from yesterday"
          trendUp={true}
        />
        <MetricCard 
          title="Token Usage (24h)" 
          value={`${mockMetrics.tokenUsage}M`} 
          icon={<Box size={20} className="text-purple-500" />} 
          trend="+5% from yesterday"
          trendUp={true}
        />
        <MetricCard 
          title="Cache Hit Rate" 
          value={`${mockMetrics.cacheHitRate}%`} 
          icon={<Database size={20} className="text-green-500" />} 
          trend="+3% from yesterday"
          trendUp={true}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card 
            title="Usage Trends" 
            actionButton={
              <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
                View Details <ExternalLink size={14} className="ml-1" />
              </button>
            }
          >
            <div className="h-64">
              <UsageChart data={mockChartData} />
            </div>
          </Card>
        </div>
        <div>
          <Card title="System Stats">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Active Agents</span>
                <span className="font-medium">{mockMetrics.activeAgents}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Estimated Cost (24h)</span>
                <span className="font-medium">${mockMetrics.estimatedCost}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Top Model</span>
                <span className="font-medium">{mockMetrics.topModel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">API Status</span>
                <StatusBadge status="active" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Cache Status</span>
                <StatusBadge status="active" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card 
          title="Recent Agent Activity" 
          actionButton={
            <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
              View All <ExternalLink size={14} className="ml-1" />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Run</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {mockAgents.slice(0, 4).map(agent => (
                  <tr key={agent.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-slate-800">{agent.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{agent.lastRun}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:text-blue-800">
                        <ExternalLink size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card 
          title="Recent Executions" 
          actionButton={
            <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
              View All <ExternalLink size={14} className="ml-1" />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Prompt</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Model</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {mockExecutions.slice(0, 4).map(ex => (
                  <tr key={ex.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-slate-800">{ex.promptName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{ex.modelName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <StatusBadge status={ex.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{ex.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Models Tab
const ModelsTab = () => {
  const [activeSubTab, setActiveSubTab] = useState('models');
  
  return (
    <div className="space-y-6">
      <div className="flex mb-4 border-b border-slate-200">
        <button 
          className={`px-4 py-2 font-medium ${activeSubTab === 'models' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setActiveSubTab('models')}
        >
          Models
        </button>
        <button 
          className={`px-4 py-2 font-medium ${activeSubTab === 'vendors' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setActiveSubTab('vendors')}
        >
          Vendors
        </button>
        <button 
          className={`px-4 py-2 font-medium ${activeSubTab === 'types' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setActiveSubTab('types')}
        >
          Model Types
        </button>
      </div>
      
      {activeSubTab === 'models' && (
        <div>
          <div className="flex justify-between mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search models..."
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex space-x-2">
              <button className="flex items-center px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
                <Filter size={16} className="mr-2" />
                Filter
              </button>
              <button className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                <PlusCircle size={16} className="mr-2" />
                Add Model
              </button>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Power Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {mockModels.map(model => (
                  <tr key={model.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">{model.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{model.vendor}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{model.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{model.powerRank}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <StatusBadge status={model.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      <button className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                      <button className="text-slate-600 hover:text-slate-800">
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {activeSubTab === 'vendors' && (
        <div className="text-center p-8 text-slate-600">
          Vendor management interface would go here.
        </div>
      )}
      
      {activeSubTab === 'types' && (
        <div className="text-center p-8 text-slate-600">
          Model types management interface would go here.
        </div>
      )}
    </div>
  );
};

// Prompts Tab
const PromptsTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search prompts..."
            className="pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex space-x-2">
          <button className="flex items-center px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
            <Filter size={16} className="mr-2" />
            Filter
          </button>
          <button className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <PlusCircle size={16} className="mr-2" />
            Create Prompt
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {mockPrompts.map(prompt => (
          <PromptCard key={prompt.id} prompt={prompt} />
        ))}
      </div>
    </div>
  );
};

// Prompt Card Component
const PromptCard = ({ prompt }) => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
    <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
      <h3 className="font-medium text-slate-800 truncate">{prompt.name}</h3>
      <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">{prompt.modelType}</span>
    </div>
    <div className="p-4">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Last Used</span>
          <span className="text-sm font-medium">{prompt.lastUsed}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Cache Hits</span>
          <span className="text-sm font-medium">{prompt.cacheHits}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Total Executions</span>
          <span className="text-sm font-medium">{prompt.executions}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Cache Hit Rate</span>
          <span className="text-sm font-medium">{Math.round((prompt.cacheHits / prompt.executions) * 100)}%</span>
        </div>
      </div>
    </div>
    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
      <button className="text-blue-600 hover:text-blue-800 text-sm mr-3">Edit</button>
      <button className="text-blue-600 hover:text-blue-800 text-sm mr-3">Test</button>
      <button className="text-slate-600 hover:text-slate-800">
        <MoreHorizontal size={16} />
      </button>
    </div>
  </div>
);

// Agents Tab
const AgentsTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search agents..."
            className="pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex space-x-2">
          <button className="flex items-center px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
            <Filter size={16} className="mr-2" />
            Filter
          </button>
          <button className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <PlusCircle size={16} className="mr-2" />
            Create Agent
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Run</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Prompts</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Child Agents</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {mockAgents.map(agent => (
              <tr key={agent.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">{agent.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{agent.type}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <StatusBadge status={agent.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{agent.lastRun}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{agent.prompts}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{agent.children}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  <button className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                  <button className="text-blue-600 hover:text-blue-800 mr-2">Run</button>
                  <button className="text-slate-600 hover:text-slate-800">
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Execution Logs Tab
const ExecutionLogsTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search executions..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex space-x-2 ml-4">
          <button className="flex items-center px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
            <Filter size={16} className="mr-2" />
            Filter
          </button>
          <button className="flex items-center px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Prompt</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tokens</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {mockExecutions.map(ex => (
              <tr key={ex.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {new Date(ex.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{ex.agentName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">{ex.promptName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{ex.modelName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <StatusBadge status={ex.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{ex.duration}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{ex.tokens}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{ex.cost}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  <button className="text-blue-600 hover:text-blue-800">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="flex justify-between items-center py-2">
        <div className="text-sm text-slate-600">
          Showing 5 of 1,234 executions
        </div>
        <div className="flex space-x-2">
          <button className="px-3 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
            Previous
          </button>
          <button className="px-3 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50">
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

// Cache Management Tab
const CacheManagementTab = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard 
          title="Cache Size" 
          value="3.2 GB" 
          icon={<Database size={20} className="text-blue-500" />} 
        />
        <MetricCard 
          title="Cache Entries" 
          value="12,345" 
          icon={<Box size={20} className="text-purple-500" />} 
        />
        <MetricCard 
          title="Hit Rate (24h)" 
          value="42%" 
          icon={<Activity size={20} className="text-green-500" />} 
          trend="+3% from yesterday"
          trendUp={true}
        />
      </div>
      
      <Card 
        title="Cache Settings" 
        actionButton={
          <button className="text-sm text-blue-600 hover:text-blue-800">
            Save Changes
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Cache TTL</label>
              <div className="flex items-center">
                <input
                  type="number"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  defaultValue={3600}
                />
                <span className="ml-2 text-slate-600">seconds</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cache Match Type</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option>Exact</option>
                <option>Vector</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vector Similarity Threshold</label>
              <div className="flex items-center">
                <input
                  type="number"
                  step="0.01"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  defaultValue={0.92}
                  min={0}
                  max={1}
                />
                <span className="ml-2 text-slate-600">(0-1)</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Must Match Settings</label>
              <div className="space-y-2">
                <div className="flex items-center">
                  <input type="checkbox" id="match-model" className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" defaultChecked />
                  <label htmlFor="match-model" className="ml-2 text-sm text-slate-700">Must match model</label>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" id="match-vendor" className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                  <label htmlFor="match-vendor" className="ml-2 text-sm text-slate-700">Must match vendor</label>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" id="match-agent" className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" defaultChecked />
                  <label htmlFor="match-agent" className="ml-2 text-sm text-slate-700">Must match agent</label>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" id="match-config" className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                  <label htmlFor="match-config" className="ml-2 text-sm text-slate-700">Must match configuration</label>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-8">
              <button className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50">
                Clear Cache
              </button>
              <button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50">
                Rebuild Embeddings
              </button>
            </div>
          </div>
        </div>
      </Card>
      
      <Card title="Cache Management">
        <div className="text-center p-8 text-slate-600">
          Advanced cache management interface would go here.
        </div>
      </Card>
    </div>
  );
};

// Configurations Tab
const ConfigurationsTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search configurations..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex space-x-2 ml-4">
          <button className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <PlusCircle size={16} className="mr-2" />
            New Configuration
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConfigCard 
          name="Default Configuration" 
          description="System-wide default settings for all AI operations." 
          isDefault={true}
          params={4}
          lastModified="Today at 10:23 AM"
        />
        <ConfigCard 
          name="High Performance" 
          description="Configuration optimized for quality results regardless of cost." 
          isDefault={false}
          params={6}
          lastModified="Yesterday at 4:15 PM"
        />
        <ConfigCard 
          name="Cost Optimized" 
          description="Configuration optimized for minimal token usage and cost." 
          isDefault={false}
          params={7}
          lastModified="May 19, 2025"
        />
        <ConfigCard 
          name="Development" 
          description="Configuration for development and testing environments." 
          isDefault={false}
          params={5}
          lastModified="May 18, 2025"
        />
      </div>
    </div>
  );
};

// Configuration Card Component
const ConfigCard = ({ name, description, isDefault, params, lastModified }) => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
    <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
      <div className="flex items-center">
        <h3 className="font-medium text-slate-800">{name}</h3>
        {isDefault && (
          <span className="ml-2 text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded-full">Default</span>
        )}
      </div>
      <button className="text-slate-600 hover:text-slate-800">
        <MoreHorizontal size={16} />
      </button>
    </div>
    <div className="p-4">
      <p className="text-slate-600 text-sm mb-4">{description}</p>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Parameters</span>
          <span className="text-sm font-medium">{params}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Last Modified</span>
          <span className="text-sm font-medium">{lastModified}</span>
        </div>
      </div>
    </div>
    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
      <button className="text-blue-600 hover:text-blue-800 text-sm mr-3">Edit</button>
      <button className="text-blue-600 hover:text-blue-800 text-sm mr-3">Clone</button>
      {!isDefault && (
        <button className="text-blue-600 hover:text-blue-800 text-sm">Set as Default</button>
      )}
    </div>
  </div>
);

// Metric Card Component
const MetricCard = ({ title, value, icon, trend = null, trendUp = null }) => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
    <div className="flex items-center mb-2">
      <div className="mr-3 p-2 rounded-full bg-slate-100">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-slate-600">{title}</h3>
    </div>
    <div className="flex items-end justify-between">
      <div className="text-2xl font-semibold text-slate-800">{value}</div>
      {trend && (
        <div className={`text-xs ${trendUp ? 'text-green-600' : 'text-red-600'} flex items-center`}>
          {trendUp ? '▲' : '▼'} {trend}
        </div>
      )}
    </div>
  </div>
);

// Usage Chart Component
const UsageChart = ({ data }) => {
  // This is a mockup - in a real implementation, this would use a chart library
  const maxValue = Math.max(...data.map(d => Math.max(d.executions, d.tokens * 20, d.cost * 15)));
  
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between mb-2">
        <div className="flex space-x-4">
          <div className="flex items-center">
            <span className="h-3 w-3 bg-blue-500 rounded-full mr-1"></span>
            <span className="text-xs text-slate-600">Executions</span>
          </div>
          <div className="flex items-center">
            <span className="h-3 w-3 bg-purple-500 rounded-full mr-1"></span>
            <span className="text-xs text-slate-600">Tokens (M)</span>
          </div>
          <div className="flex items-center">
            <span className="h-3 w-3 bg-green-500 rounded-full mr-1"></span>
            <span className="text-xs text-slate-600">Cost ($)</span>
          </div>
        </div>
        <div className="flex items-center">
          <select className="text-xs border border-slate-300 rounded px-2 py-1">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Custom range</option>
          </select>
        </div>
      </div>
      
      <div className="flex-1 flex items-end space-x-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center space-y-1 h-full">
            <div className="w-full flex flex-col-reverse items-center space-y-reverse space-y-1 flex-1">
              <div 
                className="w-full bg-blue-500 rounded-t"
                style={{ height: `${(d.executions / maxValue) * 100}%` }}
              ></div>
              <div 
                className="w-full bg-purple-500 rounded-t"
                style={{ height: `${(d.tokens * 20 / maxValue) * 100}%` }}
              ></div>
              <div 
                className="w-full bg-green-500 rounded-t"
                style={{ height: `${(d.cost * 15 / maxValue) * 100}%` }}
              ></div>
            </div>
            <div className="text-xs text-slate-600 whitespace-nowrap">{d.date.split(' ')[1]}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIAdminDashboard;