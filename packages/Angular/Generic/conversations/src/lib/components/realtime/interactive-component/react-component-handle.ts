import type { MJReactComponent } from '@memberjunction/ng-react';
import type { IInteractiveComponentHandle } from './interactive-component-types';

/**
 * An {@link IInteractiveComponentHandle} over a rendered `mj-react-component`: the channel's only way to drive the
 * component, kept as a thin adapter so the channel never touches Angular or React.
 */
export class ReactComponentHandle implements IInteractiveComponentHandle {
    /** @param react The rendered component. @param IsReady Whether it has finished initializing (a handle is created once it has). */
    public constructor(
        private readonly react: MJReactComponent,
        public readonly IsReady: boolean = true
    ) {}

    /** @inheritdoc */
    public HasMethod(methodName: string): boolean {
        return this.react.HasMethod(methodName);
    }

    /** @inheritdoc */
    public InvokeMethod(methodName: string, args: readonly unknown[]): Promise<unknown> {
        // A custom method may be sync or async; the channel awaits either.
        return Promise.resolve(this.react.InvokeMethod(methodName, ...args));
    }

    /** @inheritdoc */
    public GetCurrentDataState(): object | undefined {
        return this.react.GetCurrentDataState();
    }

    /** @inheritdoc */
    public Refresh(): void {
        this.react.Refresh();
    }

    /** @inheritdoc */
    public Print(): void {
        this.react.Print();
    }

    /** @inheritdoc */
    public Validate(): unknown {
        return this.react.validate();
    }

    /** @inheritdoc */
    public IsDirty(): boolean {
        return this.react.IsDirty();
    }

    /** @inheritdoc */
    public Reset(): void {
        this.react.Reset();
    }

    /** @inheritdoc */
    public ScrollTo(target: string | { top?: number; left?: number }): void {
        this.react.ScrollTo(target);
    }

    /** @inheritdoc */
    public Focus(target?: string): void {
        this.react.Focus(target);
    }
}
