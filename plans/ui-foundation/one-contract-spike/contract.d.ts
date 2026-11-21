// Fixed platform contract — in MJ this is emitted from @memberjunction/interactive-component-types.
// Everything is ambient: components have no imports, so nothing here is imported either.
declare const React: typeof import('react');
declare const useState: typeof import('react').useState;
declare const useEffect: typeof import('react').useEffect;
declare const useMemo: typeof import('react').useMemo;
declare const useCallback: typeof import('react').useCallback;
declare const useRef: typeof import('react').useRef;

interface RunViewResult<R> { Success: boolean; Results: R[]; ErrorMessage?: string; }
/** RunView typed by the entities THIS spec declared in dataRequirements (see generated.d.ts). */
interface TypedRunView {
  RunView<E extends keyof EntityRowMap>(params: {
    EntityName: E;
    Fields?: Array<keyof EntityRowMap[E]>;
    ExtraFilter?: string; OrderBy?: string; MaxRows?: number;
  }): Promise<RunViewResult<EntityRowMap[E]>>;
}
interface ComponentStyles { spacing: { sm: string; md: string; lg: string }; colors: { text: string; textSecondary: string; warning: string } }
interface ComponentCallbacks { OpenEntityRecord(entityName: keyof EntityRowMap, key: string): void; }
interface StandardProps<Settings = Record<string, unknown>> {
  utilities: { rv: TypedRunView };
  styles: ComponentStyles;
  components: ChildComponents;
  callbacks: ComponentCallbacks;
  savedUserSettings: Partial<Settings>;
  onSaveUserSettings(changed: Partial<Settings>): void;
}
