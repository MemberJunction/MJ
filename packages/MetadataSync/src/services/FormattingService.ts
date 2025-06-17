import chalk from 'chalk';
import { ValidationResult, ValidationError, ValidationWarning, FileValidationResult } from '../types/validation';

export class FormattingService {
    /**
     * Format validation result as JSON
     */
    public formatValidationResultAsJson(result: ValidationResult): string {
        const output = {
            isValid: result.isValid,
            summary: {
                totalFiles: result.summary.totalFiles,
                totalEntities: result.summary.totalEntities,
                totalErrors: result.summary.totalErrors,
                totalWarnings: result.summary.totalWarnings,
                errorsByType: this.getErrorsByType(result.errors),
                warningsByType: this.getWarningsByType(result.warnings)
            },
            errors: result.errors.map(e => ({
                type: e.type,
                entity: e.entity,
                field: e.field,
                file: e.file,
                message: e.message,
                suggestion: e.suggestion
            })),
            warnings: result.warnings.map(w => ({
                type: w.type,
                entity: w.entity,
                field: w.field,
                file: w.file,
                message: w.message,
                suggestion: w.suggestion
            }))
        };
        
        return JSON.stringify(output, null, 2);
    }
    private readonly symbols = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ',
        arrow: '→',
        bullet: '•',
        box: {
            topLeft: '┌',
            topRight: '┐',
            bottomLeft: '└',
            bottomRight: '┘',
            horizontal: '─',
            vertical: '│',
            cross: '┼'
        }
    };

    /**
     * Format validation result for terminal output
     */
    public formatValidationResult(result: ValidationResult, verbose: boolean = false): string {
        const lines: string[] = [];
        
        // Header
        lines.push(this.formatHeader('Validation Report'));
        lines.push('');

        // Summary box
        lines.push(this.formatSummaryBox(result));
        lines.push('');

        // File results
        if (result.summary.fileResults.size > 0) {
            lines.push(this.formatSectionHeader('File Results'));
            lines.push('');
            
            for (const [file, fileResult] of result.summary.fileResults) {
                const hasIssues = fileResult.errors.length > 0 || fileResult.warnings.length > 0;
                if (!verbose && !hasIssues) continue;
                
                lines.push(this.formatFileResult(file, fileResult, verbose));
            }
        }

        // Detailed errors
        if (result.errors.length > 0) {
            lines.push('');
            lines.push(this.formatSectionHeader('Errors'));
            lines.push('');
            result.errors.forEach((error, index) => {
                lines.push(this.formatError(error, index + 1));
            });
        }

        // Detailed warnings
        if (result.warnings.length > 0) {
            lines.push('');
            lines.push(this.formatSectionHeader('Warnings'));
            lines.push('');
            result.warnings.forEach((warning, index) => {
                lines.push(this.formatWarning(warning, index + 1));
            });
        }

        // Footer
        lines.push('');
        lines.push(this.formatFooter(result));

        return lines.join('\n');
    }

    /**
     * Format push/pull summary report
     */
    public formatSyncSummary(
        operation: 'push' | 'pull',
        stats: {
            created: number;
            updated: number;
            deleted: number;
            skipped: number;
            errors: number;
            duration: number;
        }
    ): string {
        const lines: string[] = [];
        
        lines.push(this.formatHeader(`${operation.charAt(0).toUpperCase() + operation.slice(1)} Summary`));
        lines.push('');
        
        const total = stats.created + stats.updated + stats.deleted + stats.skipped;
        
        lines.push(chalk.bold('Operation Statistics:'));
        lines.push('');
        lines.push(`  ${chalk.green(this.symbols.success)} Created: ${chalk.green(stats.created)}`);
        lines.push(`  ${chalk.blue(this.symbols.info)} Updated: ${chalk.blue(stats.updated)}`);
        lines.push(`  ${chalk.red(this.symbols.error)} Deleted: ${chalk.red(stats.deleted)}`);
        lines.push(`  ${chalk.gray('-')} Skipped: ${chalk.gray(stats.skipped)}`);
        lines.push('');
        lines.push(`  Total Records: ${chalk.bold(total)}`);
        lines.push(`  Duration: ${chalk.cyan(this.formatDuration(stats.duration))}`);
        
        if (stats.errors > 0) {
            lines.push('');
            lines.push(chalk.red(`  ${this.symbols.error} Errors: ${stats.errors}`));
        }
        
        return lines.join('\n');
    }

    private formatHeader(title: string): string {
        const width = 60;
        const line = '═'.repeat(width);
        
        // MemberJunction branding
        const brandingText = 'MemberJunction Metadata Sync';
        const brandingPadding = Math.floor((width - brandingText.length - 2) / 2);
        
        // Title
        const titlePadding = Math.floor((width - title.length - 2) / 2);
        
        return chalk.blue([
            line,
            '║' + ' '.repeat(brandingPadding) + brandingText + ' '.repeat(width - brandingPadding - brandingText.length - 2) + '║',
            '║' + ' '.repeat(titlePadding) + title + ' '.repeat(width - titlePadding - title.length - 2) + '║',
            line
        ].join('\n'));
    }

    private formatSectionHeader(title: string): string {
        return chalk.bold.underline(title);
    }

    private formatSummaryBox(result: ValidationResult): string {
        const lines: string[] = [];
        const width = 50;
        
        lines.push(chalk.gray('┌' + '─'.repeat(width - 2) + '┐'));
        
        // Basic stats
        const items = [
            ['Files:', result.summary.totalFiles],
            ['Entities:', result.summary.totalEntities],
            ['Errors:', result.summary.totalErrors],
            ['Warnings:', result.summary.totalWarnings]
        ];
        
        items.forEach(([label, value]) => {
            const numValue = Number(value);
            const color = label === 'Errors:' && numValue > 0 ? chalk.red :
                         label === 'Warnings:' && numValue > 0 ? chalk.yellow :
                         chalk.white;
            const line = `${String(label).padEnd(15)} ${color(String(value))}`;
            lines.push(chalk.gray('│ ') + line.padEnd(width - 4) + chalk.gray(' │'));
        });
        
        // Add separator
        if (result.errors.length > 0 || result.warnings.length > 0) {
            lines.push(chalk.gray('├' + '─'.repeat(width - 2) + '┤'));
        }
        
        // Error breakdown by type
        if (result.errors.length > 0) {
            lines.push(chalk.gray('│ ') + chalk.bold('Errors by Type:').padEnd(width - 4) + chalk.gray(' │'));
            const errorsByType = this.getErrorsByType(result.errors);
            for (const [type, count] of Object.entries(errorsByType)) {
                const typeText = `  ${type}:`;
                const countText = chalk.red(count.toString());
                const spaceBetween = width - 4 - typeText.length - count.toString().length;
                const line = typeText + ' '.repeat(spaceBetween) + countText;
                lines.push(chalk.gray('│ ') + line + chalk.gray(' │'));
            }
        }
        
        // Warning breakdown by type
        if (result.warnings.length > 0) {
            if (result.errors.length > 0) {
                lines.push(chalk.gray('├' + '─'.repeat(width - 2) + '┤'));
            }
            lines.push(chalk.gray('│ ') + chalk.bold('Warnings by Type:').padEnd(width - 4) + chalk.gray(' │'));
            const warningsByType = this.getWarningsByType(result.warnings);
            for (const [type, count] of Object.entries(warningsByType)) {
                const typeText = `  ${type}:`;
                const countText = chalk.yellow(count.toString());
                const spaceBetween = width - 4 - typeText.length - count.toString().length;
                const line = typeText + ' '.repeat(spaceBetween) + countText;
                lines.push(chalk.gray('│ ') + line + chalk.gray(' │'));
            }
        }
        
        lines.push(chalk.gray('└' + '─'.repeat(width - 2) + '┘'));
        
        return lines.join('\n');
    }

    private formatFileResult(file: string, result: FileValidationResult, verbose: boolean): string {
        const lines: string[] = [];
        const hasErrors = result.errors.length > 0;
        const hasWarnings = result.warnings.length > 0;
        
        const icon = hasErrors ? chalk.red(this.symbols.error) :
                    hasWarnings ? chalk.yellow(this.symbols.warning) :
                    chalk.green(this.symbols.success);
        
        const shortPath = this.shortenPath(file);
        lines.push(`${icon} ${chalk.bold(shortPath)}`);
        
        if (verbose || hasErrors || hasWarnings) {
            lines.push(`  ${chalk.gray(`Entities: ${result.entityCount}`)}`);
            
            if (hasErrors) {
                lines.push(`  ${chalk.red(`Errors: ${result.errors.length}`)}`);
            }
            
            if (hasWarnings) {
                lines.push(`  ${chalk.yellow(`Warnings: ${result.warnings.length}`)}`);
            }
        }
        
        lines.push('');
        return lines.join('\n');
    }

    private formatError(error: ValidationError, index: number): string {
        const lines: string[] = [];
        
        lines.push(chalk.red(`${index}. ${error.message}`));
        
        if (error.entity) {
            lines.push(chalk.gray(`   Entity: ${error.entity}`));
        }
        if (error.field) {
            lines.push(chalk.gray(`   Field: ${error.field}`));
        }
        lines.push(chalk.gray(`   File: ${this.shortenPath(error.file)}`));
        
        if (error.suggestion) {
            lines.push(chalk.cyan(`   ${this.symbols.arrow} Suggestion: ${error.suggestion}`));
        }
        
        lines.push('');
        return lines.join('\n');
    }

    private formatWarning(warning: ValidationWarning, index: number): string {
        const lines: string[] = [];
        
        lines.push(chalk.yellow(`${index}. ${warning.message}`));
        
        if (warning.entity) {
            lines.push(chalk.gray(`   Entity: ${warning.entity}`));
        }
        if (warning.field) {
            lines.push(chalk.gray(`   Field: ${warning.field}`));
        }
        lines.push(chalk.gray(`   File: ${this.shortenPath(warning.file)}`));
        
        if (warning.suggestion) {
            lines.push(chalk.cyan(`   ${this.symbols.arrow} Suggestion: ${warning.suggestion}`));
        }
        
        lines.push('');
        return lines.join('\n');
    }

    private formatFooter(result: ValidationResult): string {
        const lines: string[] = [];
        
        if (result.isValid) {
            lines.push(chalk.green.bold(`${this.symbols.success} Validation passed!`));
        } else {
            lines.push(chalk.red.bold(`${this.symbols.error} Validation failed with ${result.errors.length} error(s)`));
        }
        
        // Add documentation link if there are any issues
        if (result.errors.length > 0 || result.warnings.length > 0) {
            lines.push('');
            lines.push(chalk.gray('For help resolving issues, see:'));
            lines.push(chalk.cyan('https://github.com/MemberJunction/MJ/tree/next/packages/MetadataSync'));
        }
        
        return lines.join('\n');
    }

    private shortenPath(filePath: string): string {
        const cwd = process.cwd();
        if (filePath.startsWith(cwd)) {
            return '.' + filePath.slice(cwd.length);
        }
        return filePath;
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }
    
    /**
     * Get count of errors by type
     */
    private getErrorsByType(errors: ValidationError[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const error of errors) {
            counts[error.type] = (counts[error.type] || 0) + 1;
        }
        return counts;
    }
    
    /**
     * Get count of warnings by type
     */
    private getWarningsByType(warnings: ValidationWarning[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const warning of warnings) {
            counts[warning.type] = (counts[warning.type] || 0) + 1;
        }
        return counts;
    }
    
    /**
     * Format validation result as markdown
     */
    public formatValidationResultAsMarkdown(result: ValidationResult): string {
        const lines: string[] = [];
        const timestamp = new Date();
        const dateStr = timestamp.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const timeStr = timestamp.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Header with branding
        lines.push('# 🚀 MemberJunction Metadata Sync');
        lines.push('## Validation Report');
        lines.push('');
        lines.push(`📅 **Date:** ${dateStr}  `);
        lines.push(`🕐 **Time:** ${timeStr}  `);
        lines.push(`📍 **Directory:** \`${process.cwd()}\`  `);
        lines.push('');
        
        // Table of Contents
        lines.push('## 📑 Table of Contents');
        lines.push('');
        lines.push('- [Executive Summary](#executive-summary)');
        lines.push('- [Validation Results](#validation-results)');
        if (result.errors.length > 0 || result.warnings.length > 0) {
            lines.push('- [Issue Analysis](#issue-analysis)');
        }
        lines.push('- [File-by-File Breakdown](#file-by-file-breakdown)');
        if (result.errors.length > 0) {
            lines.push('- [Error Details](#error-details)');
        }
        if (result.warnings.length > 0) {
            lines.push('- [Warning Details](#warning-details)');
        }
        lines.push('- [Next Steps](#next-steps)');
        lines.push('- [Resources](#resources)');
        lines.push('');
        
        // Executive Summary
        lines.push('## 📊 Executive Summary');
        lines.push('');
        
        const statusEmoji = result.isValid ? '✅' : '❌';
        const statusText = result.isValid ? 'PASSED' : 'FAILED';
        const statusColor = result.isValid ? 'green' : 'red';
        
        lines.push(`### Overall Status: ${statusEmoji} **${statusText}**`);
        lines.push('');
        
        if (result.isValid) {
            lines.push('> 🎉 **Congratulations!** Your metadata validation passed with no errors.');
        } else {
            lines.push(`> ⚠️ **Action Required:** ${result.errors.length} error(s) need to be resolved before proceeding.`);
        }
        lines.push('');
        
        // Quick Stats
        lines.push('### 📈 Quick Statistics');
        lines.push('');
        lines.push(`**📁 Files Validated:** ${result.summary.totalFiles}  `);
        lines.push(`**📦 Entities Processed:** ${result.summary.totalEntities}  `);
        lines.push(`**❌ Errors Found:** ${result.summary.totalErrors}  `);
        lines.push(`**⚠️ Warnings Found:** ${result.summary.totalWarnings}  `);
        lines.push('');
        
        // Validation Results
        lines.push('## 🔍 Validation Results');
        lines.push('');
        
        // Issue Analysis
        if (result.errors.length > 0 || result.warnings.length > 0) {
            lines.push('## 📊 Issue Analysis');
            lines.push('');
            
            if (result.errors.length > 0) {
                lines.push('### ❌ Error Distribution');
                lines.push('');
                const errorsByType = this.getErrorsByType(result.errors);
                
                lines.push('<details>');
                lines.push('<summary>Click to expand error breakdown</summary>');
                lines.push('');
                
                for (const [type, count] of Object.entries(errorsByType)) {
                    const percentage = ((count / result.errors.length) * 100).toFixed(1);
                    lines.push(`- **${type}**: ${count} errors (${percentage}%)`);
                }
                lines.push('');
                lines.push('</details>');
                lines.push('');
            }
            
            if (result.warnings.length > 0) {
                lines.push('### ⚠️ Warning Distribution');
                lines.push('');
                const warningsByType = this.getWarningsByType(result.warnings);
                
                lines.push('<details>');
                lines.push('<summary>Click to expand warning breakdown</summary>');
                lines.push('');
                
                for (const [type, count] of Object.entries(warningsByType)) {
                    const percentage = ((count / result.warnings.length) * 100).toFixed(1);
                    lines.push(`- **${type}**: ${count} warnings (${percentage}%)`);
                }
                lines.push('');
                lines.push('</details>');
                lines.push('');
            }
        }
        
        // File Results
        lines.push('## 📁 File-by-File Breakdown');
        lines.push('');
        
        const sortedFiles = Array.from(result.summary.fileResults.entries())
            .sort(([a], [b]) => {
                // Sort by error count (descending), then warning count, then name
                const aResult = result.summary.fileResults.get(a)!;
                const bResult = result.summary.fileResults.get(b)!;
                
                if (aResult.errors.length !== bResult.errors.length) {
                    return bResult.errors.length - aResult.errors.length;
                }
                if (aResult.warnings.length !== bResult.warnings.length) {
                    return bResult.warnings.length - aResult.warnings.length;
                }
                return a.localeCompare(b);
            });
        
        for (const [file, fileResult] of sortedFiles) {
            const shortPath = this.shortenPath(file);
            const hasErrors = fileResult.errors.length > 0;
            const hasWarnings = fileResult.warnings.length > 0;
            const icon = hasErrors ? '❌' : hasWarnings ? '⚠️' : '✅';
            const status = hasErrors ? 'Has Errors' : hasWarnings ? 'Has Warnings' : 'Clean';
            
            lines.push(`<details>`);
            lines.push(`<summary>${icon} <strong>${shortPath}</strong> - ${status}</summary>`);
            lines.push('');
            lines.push('#### File Statistics');
            lines.push(`- **Entities:** ${fileResult.entityCount}`);
            lines.push(`- **Errors:** ${fileResult.errors.length}`);
            lines.push(`- **Warnings:** ${fileResult.warnings.length}`);
            
            if (hasErrors) {
                lines.push('');
                lines.push('#### Errors in this file:');
                fileResult.errors.forEach((error, idx) => {
                    lines.push(`${idx + 1}. ${error.message}`);
                });
            }
            
            if (hasWarnings) {
                lines.push('');
                lines.push('#### Warnings in this file:');
                fileResult.warnings.forEach((warning, idx) => {
                    lines.push(`${idx + 1}. ${warning.message}`);
                });
            }
            
            lines.push('');
            lines.push('</details>');
            lines.push('');
        }
        
        // Detailed Errors
        if (result.errors.length > 0) {
            lines.push('## ❌ Error Details');
            lines.push('');
            lines.push(`> Found ${result.errors.length} error(s) that must be fixed.`);
            lines.push('');
            
            result.errors.forEach((error, index) => {
                lines.push(`### Error ${index + 1}: ${error.message}`);
                lines.push('');
                
                lines.push(`**Type:** \`${error.type}\`  `);
                if (error.entity) lines.push(`**Entity:** ${error.entity}  `);
                if (error.field) lines.push(`**Field:** \`${error.field}\`  `);
                lines.push(`**File:** \`${this.shortenPath(error.file)}\`  `);
                lines.push(`**Severity:** ${error.severity}  `);
                
                if (error.suggestion) {
                    lines.push('');
                    lines.push('> 💡 **Suggestion:** ' + error.suggestion);
                }
                
                lines.push('');
                lines.push('---');
                lines.push('');
            });
        }
        
        // Detailed Warnings
        if (result.warnings.length > 0) {
            lines.push('## ⚠️ Warning Details');
            lines.push('');
            lines.push(`> Found ${result.warnings.length} warning(s) for your review.`);
            lines.push('');
            
            // Group warnings by type for better organization
            const warningsByType = new Map<string, ValidationWarning[]>();
            result.warnings.forEach(warning => {
                if (!warningsByType.has(warning.type)) {
                    warningsByType.set(warning.type, []);
                }
                warningsByType.get(warning.type)!.push(warning);
            });
            
            for (const [type, warnings] of warningsByType) {
                lines.push(`### Warning Type: \`${type}\``);
                lines.push('');
                
                warnings.forEach((warning, index) => {
                    lines.push(`#### ${index + 1}. ${warning.message}`);
                    lines.push('');
                    
                    if (warning.entity) lines.push(`**Entity:** ${warning.entity}  `);
                    if (warning.field) lines.push(`**Field:** \`${warning.field}\`  `);
                    lines.push(`**File:** \`${this.shortenPath(warning.file)}\`  `);
                    
                    if (warning.suggestion) {
                        lines.push('');
                        lines.push('> 💡 **Suggestion:** ' + warning.suggestion);
                    }
                    
                    lines.push('');
                });
            }
        }
        
        // Next Steps
        lines.push('## 🚀 Next Steps');
        lines.push('');
        
        if (result.errors.length > 0) {
            lines.push('### To fix errors:');
            lines.push('');
            lines.push('1. Review each error in the [Error Details](#error-details) section');
            lines.push('2. Follow the suggestions provided for each error');
            lines.push('3. Run validation again after making changes');
            lines.push('4. Repeat until all errors are resolved');
            lines.push('');
        }
        
        if (result.warnings.length > 0) {
            lines.push('### To address warnings:');
            lines.push('');
            lines.push('1. Review warnings in the [Warning Details](#warning-details) section');
            lines.push('2. Determine which warnings are relevant to your use case');
            lines.push('3. Apply suggested fixes where appropriate');
            lines.push('');
        }
        
        if (result.isValid) {
            lines.push('Your metadata is valid and ready to sync! 🎉');
            lines.push('');
            lines.push('```bash');
            lines.push('# Push your metadata to the database');
            lines.push('mj-sync push');
            lines.push('```');
        }
        
        // Resources
        lines.push('');
        lines.push('## 📚 Resources');
        lines.push('');
        lines.push('- 📖 [MetadataSync Documentation](https://github.com/MemberJunction/MJ/tree/next/packages/MetadataSync)');
        lines.push('- 🐛 [Report Issues](https://github.com/MemberJunction/MJ/issues)');
        lines.push('- 💬 [MemberJunction Community](https://memberjunction.org)');
        lines.push('- 📝 [Validation Rules Guide](https://github.com/MemberJunction/MJ/tree/next/packages/MetadataSync#validation-features)');
        lines.push('');
        
        // Footer
        lines.push('---');
        lines.push('');
        lines.push('<div align="center">');
        lines.push('');
        lines.push('**Generated by [MemberJunction](https://memberjunction.org) Metadata Sync**');
        lines.push('');
        lines.push(`<sub>${timestamp.toISOString()}</sub>`);
        lines.push('');
        lines.push('</div>');
        
        return lines.join('\n');
    }
}