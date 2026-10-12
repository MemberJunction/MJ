/**
 * decision-test-double.ts — a scripted stand-in for a decision model, for bundles that must run real
 * agents through `AIDecisionRunner` without calling one.
 *
 * NOT a check bundle: it registers nothing on import. A bundle registers the stand-in in its lifecycle
 * Setup ({@link RegisterScriptedDecision}) and restores the real drivers in Teardown, the way
 * prompt-eval-harness registers `TestLLM` over the chat drivers.
 *
 * Why a stand-in, and why over the real driver class names: `AIDecisionRunner` picks a candidate from
 * the decision prompt's bindings and builds its driver through the ClassFactory by the model-vendor
 * row's `DriverClass`. Registering the stand-in under those names keeps everything else real (the
 * prompt, the binding, the candidate selection, the `MJ: AI Prompt Runs` row) and makes sure no
 * decision call can reach a provider, whichever candidate this environment's credentials select.
 * `LLMDecision` needs no credential, so a runner with no keys at all (CI) selects it; a host with an
 * OpenRouter key selects Jev's `OpenRouterDecision`. Both names go to the stand-in, and so do
 * `CloudflareDecision`, `SystemOneDecision` and `PerplexityDecision`: the Clef, Kev and Perplexity Decider
 * models are in no shipped prompt's bindings, but as active Decision models they join the Default Decision
 * prompt's power-matched fallback candidates, so a host with their credentials could otherwise reach a
 * provider on a failover.
 */
import { MJGlobal } from '@memberjunction/global';
import {
    BaseDecision,
    DecisionResult,
    ModelUsage,
    type DecisionAnswer,
    type DecisionParams,
    type DecisionQuestion,
} from '@memberjunction/ai';

/**
 * The decision driver classes the shipped decision prompts can reach: LLM Decision and Jev, which they
 * bind to, and Clef, self-hosted Kev and the Perplexity Decider, power-matched fallbacks (Kev-4B on
 * OpenRouter is Jev's driver).
 */
export const SCRIPTED_DECISION_DRIVER_CLASSES: readonly string[] = ['LLMDecision', 'OpenRouterDecision', 'CloudflareDecision', 'SystemOneDecision', 'PerplexityDecision'];

/** The model name the stand-in reports, so a prompt run it answered is recognisable. */
export const SCRIPTED_DECISION_MODEL = 'it-scripted-decision';

/** What the stand-in was asked: the state and question keys of one call. */
export interface ScriptedDecisionCall {
    State: DecisionParams['State'];
    QuestionKeys: string[];
    Instructions: string[];
}

/**
 * A decision driver that answers every question at once, with no provider. A Likelihood gets
 * {@link ScriptedDecision.LikelihoodFor} of its instructions; a Choice or Score its first option or
 * level, with all the probability on it. Calls are recorded on {@link Calls}.
 *
 * While disarmed it fails every call instead: a name that had no real registration before the bundle
 * keeps resolving to the stand-in after the restore, and must not hand later bundles an answer.
 */
export class ScriptedDecision extends BaseDecision {
    private readonly calls: ScriptedDecisionCall[] = [];
    private armed = false;

    /**
     * The probability every Likelihood gets, given its instructions. Defaults to a confident yes, which
     * passes a finishIf gate at its 0.9 threshold.
     */
    public LikelihoodFor: (instructions: string) => number = () => 0.97;

    constructor(apiKey = 'it-scripted-decision') {
        super(apiKey);
    }

    /** Every call since the last {@link Reset}, in order. */
    public get Calls(): readonly ScriptedDecisionCall[] {
        return this.calls;
    }

    /** Lets the stand-in answer. */
    public Arm(): void {
        this.armed = true;
    }

    /** Makes every later call fail, so nothing outside the bundle gets a scripted answer. */
    public Disarm(): void {
        this.armed = false;
    }

    /** Clears the recorded calls and puts the default Likelihood back. */
    public Reset(): void {
        this.calls.length = 0;
        this.LikelihoodFor = () => 0.97;
    }

    protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
        const now = new Date();
        if (!this.armed) {
            const refused = new DecisionResult(false, now, now);
            refused.errorMessage = 'The integration-test decision stand-in is not armed: no bundle that uses it is running';
            return refused;
        }
        const questions = Object.entries(params.Questions);
        this.calls.push({
            State: params.State,
            QuestionKeys: questions.map(([key]) => key),
            Instructions: questions.map(([, question]) => question.Instructions),
        });
        const result = new DecisionResult(true, now, new Date());
        for (const [key, question] of questions) {
            result.Answers[key] = this.answer(question);
        }
        result.Usage = new ModelUsage(0, 0);
        result.ResolvedModel = SCRIPTED_DECISION_MODEL;
        return result;
    }

    private answer(question: DecisionQuestion): DecisionAnswer {
        switch (question.Kind) {
            case 'Likelihood':
                return { Kind: 'Likelihood', Probability: this.LikelihoodFor(question.Instructions) };
            case 'Choice':
                return {
                    Kind: 'Choice',
                    Value: question.Options[0].Value,
                    Confidence: 1,
                    Probabilities: Object.fromEntries(question.Options.map((option, i) => [option.Value, i === 0 ? 1 : 0])),
                };
            case 'Score':
                return {
                    Kind: 'Score',
                    Value: 0,
                    Confidence: 1,
                    Probabilities: Object.fromEntries(question.Levels.map((level, i) => [level, i === 0 ? 1 : 0])),
                };
        }
    }
}

/**
 * Registers `driver` on the real ClassFactory under each of `driverClasses`, at `priority` or above
 * whatever is registered there (a real driver an earlier restore put back included), so every
 * `CreateInstance(BaseDecision, name, …)` returns that one instance. The
 * same technique as `RegisterTestLLM`: a real registration and a real `new`, whose constructor hands
 * back the shared instance.
 *
 * @returns `restore`, which registers each name's previous class above the stand-in again. A name with
 * no previous registration keeps resolving to the stand-in, which is why it can be disarmed.
 */
export function RegisterScriptedDecision(driver: ScriptedDecision, driverClasses: readonly string[], priority = 100): () => void {
    const factory = MJGlobal.Instance.ClassFactory;
    const previous = driverClasses.flatMap((name) => {
        const registration = factory.GetRegistration(BaseDecision, name);
        return registration ? [{ name, registration }] : [];
    });

    for (const name of driverClasses) {
        class ScriptedDecisionRegistrationHandle extends ScriptedDecision {
            constructor(apiKey?: string) {
                // LLMDecision needs no credential, so the runner passes an empty key; the stand-in's
                // default keeps BaseModel from warning about it.
                super(apiKey || undefined);
                return driver;
            }
        }
        // At least `priority`, and above everything registered for the name: an earlier restore
        // re-registered the real driver above its stand-in, and this registration must outrank it.
        factory.Register(BaseDecision, ScriptedDecisionRegistrationHandle, name, Math.max(priority, highestDecisionPriority(name) + 1));
    }

    return () => {
        for (const { name, registration } of previous) {
            factory.Register(BaseDecision, registration.SubClass, name, highestDecisionPriority(name) + 1);
        }
    };
}

/** The highest priority registered on BaseDecision for `name`, or 0 when it has none. */
function highestDecisionPriority(name: string): number {
    return Math.max(0, ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseDecision, name).map((r) => r.Priority));
}
