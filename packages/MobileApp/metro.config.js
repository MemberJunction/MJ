// Metro config for MJ Mobile inside the MemberJunction monorepo.
// Resolves @memberjunction/* packages from the workspace.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the workspace root so changes in @memberjunction/* packages trigger reloads.
config.watchFolders = [workspaceRoot];

// Tell Metro to resolve modules from both the local node_modules and the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prefer symlinked workspace packages over hoisted copies.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
