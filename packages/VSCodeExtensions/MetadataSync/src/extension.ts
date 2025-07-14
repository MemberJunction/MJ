import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MetadataProvider } from './providers/MetadataProvider';
import { CompletionProvider } from './providers/CompletionProvider';
import { HoverProvider } from './providers/HoverProvider';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { ConfigurationManager } from './services/ConfigurationManager';
import { EntityInfoPanel } from './panels/EntityInfoPanel';

let metadataProvider: MetadataProvider | undefined;
let configManager: ConfigurationManager | undefined;
let diagnosticProvider: DiagnosticProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('MemberJunction MetadataSync IntelliSense is now active');

    // Initialize services
    configManager = new ConfigurationManager();
    metadataProvider = new MetadataProvider(configManager);

    // Initialize the metadata provider (connect to database)
    initializeMetadataProvider(context);

    // Register completion provider for JSON files
    const completionProvider = new CompletionProvider(metadataProvider);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', pattern: '**/*.json' },
        completionProvider,
        '"', ':', ' ', '@'
    );

    // Register hover provider for JSON files
    const hoverProvider = new HoverProvider(metadataProvider);
    const hoverDisposable = vscode.languages.registerHoverProvider(
        { scheme: 'file', pattern: '**/*.json' },
        hoverProvider
    );

    // DISABLED: Diagnostic provider for now
    // diagnosticProvider = new DiagnosticProvider(metadataProvider);
    
    // // Update diagnostics when documents change
    // const onDidChangeDocument = vscode.workspace.onDidChangeTextDocument(async (e) => {
    //     if (e.document.languageId === 'json' && diagnosticProvider) {
    //         await diagnosticProvider.updateDiagnostics(e.document);
    //     }
    // });
    
    // // Update diagnostics when documents are opened
    // const onDidOpenDocument = vscode.workspace.onDidOpenTextDocument(async (document) => {
    //     if (document.languageId === 'json' && diagnosticProvider) {
    //         await diagnosticProvider.updateDiagnostics(document);
    //     }
    // });
    
    // // Update diagnostics for all open documents
    // vscode.workspace.textDocuments.forEach(async (document) => {
    //     if (document.languageId === 'json' && diagnosticProvider) {
    //         await diagnosticProvider.updateDiagnostics(document);
    //     }
    // });

    // Register workspace change listener to reinitialize on config changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mjMetadataSync') && configManager) {
            configManager.reload();
        }
    });

    // Register file watcher for .env and mj.config.cjs changes
    const envWatcher = vscode.workspace.createFileSystemWatcher('**/.env');
    const configWatcher2 = vscode.workspace.createFileSystemWatcher('**/mj.config.cjs');

    const reinitialize = () => {
        console.log('Configuration changed, reinitializing metadata provider');
        initializeMetadataProvider(context);
    };

    envWatcher.onDidChange(reinitialize);
    envWatcher.onDidCreate(reinitialize);
    configWatcher2.onDidChange(reinitialize);
    configWatcher2.onDidCreate(reinitialize);

    // Add disposables to context
    context.subscriptions.push(
        completionDisposable,
        hoverDisposable,
        // onDidChangeDocument,
        // onDidOpenDocument,
        configWatcher,
        envWatcher,
        configWatcher2
    );
    
    // if (diagnosticProvider) {
    //     context.subscriptions.push(diagnosticProvider);
    // }

    // Add command to manually refresh metadata
    const refreshCommand = vscode.commands.registerCommand('mjMetadataSync.refreshMetadata', async () => {
        if (metadataProvider) {
            await metadataProvider.refreshMetadata();
            vscode.window.showInformationMessage('MJ metadata refreshed');
        }
    });
    context.subscriptions.push(refreshCommand);

    // Add command to show entity info panel
    const showEntityInfoCommand = vscode.commands.registerCommand('mjMetadataSync.showEntityInfo', async () => {
        if (!metadataProvider) {
            vscode.window.showErrorMessage('Metadata provider not initialized');
            return;
        }

        // Get the current entity from the active document
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.languageId === 'json') {
            const entityName = await getEntityFromDocument(activeEditor.document);
            if (entityName) {
                await EntityInfoPanel.createOrShow(metadataProvider, entityName);
            } else {
                vscode.window.showErrorMessage('No .mj-sync.json configuration found');
            }
        } else {
            vscode.window.showInformationMessage('Open a JSON file in an MJ metadata directory first');
        }
    });
    context.subscriptions.push(showEntityInfoCommand);

    // Auto-show panel when opening relevant JSON files
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && editor.document.languageId === 'json') {
            const entityName = await getEntityFromDocument(editor.document);
            if (entityName) {
                if (EntityInfoPanel.currentPanel) {
                    // Update existing panel with new entity
                    await EntityInfoPanel.currentPanel.updateEntity(entityName);
                } else if (metadataProvider && vscode.workspace.getConfiguration('mjMetadataSync').get('autoShowEntityPanel', true)) {
                    // Auto-show panel if we have a valid entity and metadata provider (and setting is enabled)
                    await EntityInfoPanel.createOrShow(metadataProvider, entityName);
                }
            }
        }
    });
    context.subscriptions.push(onDidChangeActiveEditor);
    
    // Check if current editor is already a JSON file in MJ directory
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'json' && 
        vscode.workspace.getConfiguration('mjMetadataSync').get('autoShowEntityPanel', true)) {
        // Use setTimeout to handle async operation outside of the activation function
        setTimeout(async () => {
            const entityName = await getEntityFromDocument(activeEditor.document);
            if (entityName && metadataProvider) {
                // Show panel for already open JSON file
                await EntityInfoPanel.createOrShow(metadataProvider, entityName);
            }
        }, 100);
    }
}

async function initializeMetadataProvider(context: vscode.ExtensionContext) {
    try {
        if (metadataProvider) {
            await metadataProvider.initialize();
            vscode.window.showInformationMessage('MJ MetadataSync IntelliSense connected to database');
        }
    } catch (error) {
        console.error('Failed to initialize metadata provider:', error);
        vscode.window.showErrorMessage(`Failed to connect to MJ database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getEntityFromDocument(document: vscode.TextDocument): Promise<string | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        return undefined;
    }

    let currentDir = path.dirname(document.uri.fsPath);
    
    while (currentDir.startsWith(workspaceFolder.uri.fsPath)) {
        const configPath = path.join(currentDir, '.mj-sync.json');
        if (fs.existsSync(configPath)) {
            try {
                const configContent = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configContent);
                return config.entity;
            } catch (error) {
                console.error('Error parsing .mj-sync.json:', error);
            }
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break;
        currentDir = parentDir;
    }

    return undefined;
}

export function deactivate() {
    if (metadataProvider) {
        metadataProvider.dispose();
    }
    if (diagnosticProvider) {
        diagnosticProvider.dispose();
    }
}