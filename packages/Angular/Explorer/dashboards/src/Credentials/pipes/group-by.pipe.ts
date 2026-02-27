import { Pipe, PipeTransform } from '@angular/core';

interface GroupedResult<T> {
    key: string;
    values: T[];
}

@Pipe({
  standalone: false,
    name: 'groupBy'
})
export class GroupByPipe implements PipeTransform {
    transform<T extends Record<string, unknown>>(items: T[], property: string): GroupedResult<T>[] {
        if (!items || !property) {
            return [];
        }

        const grouped = new Map<string, T[]>();

        for (const item of items) {
            const key = String(item[property] || '');
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(item);
        }

        return Array.from(grouped.entries())
            .map(([key, values]) => ({ key, values }))
            .sort((a, b) => a.key.localeCompare(b.key));
    }
}
