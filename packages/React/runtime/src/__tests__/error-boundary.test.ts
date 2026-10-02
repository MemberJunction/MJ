import { describe, it, expect, vi } from 'vitest';
import { CreateErrorBoundary } from '../runtime/error-boundary';

/**
 * Minimal stand-in for the React the runtime is handed at call time. This package takes
 * React as an injected `any` and has no react dependency of its own, so the tests below
 * reproduce React's calling convention rather than importing the library.
 */
function makeFakeReact() {
    return {
        Component: class {
            props: any;
            state: any;
            constructor(props: any) {
                this.props = props;
            }
            setState(update: any) {
                const next = typeof update === 'function' ? update(this.state) : update;
                this.state = { ...this.state, ...next };
            }
        },
        createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
    };
}

describe('CreateErrorBoundary — React lifecycle contract', () => {
    /**
     * react-dom reads the static into a local and invokes it with no receiver:
     *
     *     var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
     *     ... getDerivedStateFromError(error);
     *
     * Anything that reaches `this` in that call throws — and it throws while React is
     * already handling the child's error, so the boundary never renders and the whole
     * tree unmounts. The name must therefore sit on the real declaration, never on a
     * forwarding stub.
     */
    it('exposes getDerivedStateFromError as a static that survives an unbound call', () => {
        const Boundary = CreateErrorBoundary(makeFakeReact(), { logErrors: false });

        const getDerivedStateFromError = Boundary.getDerivedStateFromError;
        expect(typeof getDerivedStateFromError).toBe('function');

        const error = new Error('boom');
        const next = getDerivedStateFromError(error);

        expect(next).toEqual({ hasError: true, error });
    });

    /** React calls this one ON the instance, so an ordinary prototype method is correct. */
    it('calls the error handler from componentDidCatch on the instance', () => {
        const onError = vi.fn();
        const React = makeFakeReact();
        const Boundary = CreateErrorBoundary(React, { logErrors: false, onError });

        const instance = new Boundary({});
        const error = new Error('boom');
        const errorInfo = { componentStack: 'at Boom' };

        instance.componentDidCatch(error, errorInfo);

        expect(onError).toHaveBeenCalledWith(error, errorInfo);
        expect(instance.State.errorInfo).toBe(errorInfo);
    });

    /** The fallback is what the two members above exist to reach. */
    it('renders the fallback once the error state is applied', () => {
        const React = makeFakeReact();
        const Boundary = CreateErrorBoundary(React, {
            logErrors: false,
            fallback: () => React.createElement('div', null, 'FALLBACK'),
        });

        const instance = new Boundary({});
        instance.setState(Boundary.getDerivedStateFromError(new Error('boom')));

        const tree = instance.render();
        expect(tree.children).toContain('FALLBACK');
    });
});
