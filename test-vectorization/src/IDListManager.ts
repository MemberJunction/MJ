import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple utility to load Content Item IDs from text file
 */
export class IDListManager {
    /**
     * Load IDs from retag-ids.txt and return as comma-separated quoted string for SQL IN clause
     * @returns String like "'id1','id2','id3'" ready for SQL IN clause
     */
    public static async getIDsForSQLFilter(): Promise<string> {
        const filePath = path.join(__dirname, '../../retag-ids.txt');
        
        try {
            // Read file
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            
            // Get all non-empty, non-comment lines
            const ids = fileContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .flatMap(line => line.includes(',') ? line.split(',').map(id => id.trim()) : [line])
                .filter(id => id.length > 0);
            
            // Return as quoted, comma-separated string
            const quotedIds = ids.map(id => `'${id.replace(/'/g, "''")}'`);
            console.log(`📋 Loaded ${ids.length} Content Item IDs for re-tagging`);
            
            return quotedIds.join(',');
            
        } catch (error) {
            console.warn(`⚠️ Could not load retag-ids.txt: ${(error as Error).message}`);
            return ''; // Return empty string if file doesn't exist
        }
    }
}