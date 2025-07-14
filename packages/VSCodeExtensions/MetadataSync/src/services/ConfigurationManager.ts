import * as vscode from 'vscode';

export class ConfigurationManager {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('mjMetadataSync');
    }

    reload(): void {
        this.config = vscode.workspace.getConfiguration('mjMetadataSync');
    }

    isEnabled(): boolean {
        return this.config.get<boolean>('enableIntelliSense', true);
    }

    showFieldDescriptions(): boolean {
        return this.config.get<boolean>('showFieldDescriptions', true);
    }

    getCacheTimeout(): number {
        return this.config.get<number>('cacheTimeout', 300); // Default 5 minutes
    }
}