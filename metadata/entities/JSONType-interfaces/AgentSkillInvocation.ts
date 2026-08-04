/**
 * One skill's involvement in an agent run step — the observability contract for skills.
 * `AIAgentRunStep.Skills` holds a JSON array of these (or NULL when no skills are in play),
 * so every step touched by a skill records WHICH skill, HOW it entered the run, and the
 * PROVENANCE OF AUTHORITY that admitted it.
 *
 * Population rules (implemented in BaseAgent):
 * - Skill steps record the activation(s) they performed (with Reason when agent-initiated).
 * - Prompt steps record the full set of skills in effect for that turn.
 * - Actions / Sub-Agent steps record the skill(s) through which the executed tool became
 *   available; NULL means the tool was a native agent grant.
 *
 * Runtime twin: `AgentSkillInvocation` in @memberjunction/ai-core-plus (agent-types.ts) —
 * keep the two in sync.
 */
export interface AgentSkillInvocation {
    /** ID of the activated skill (MJ: AI Skills.ID). */
    SkillID: string;
    /** Name of the activated skill at activation time. */
    SkillName: string;
    /** How the skill entered the run: explicit user request (/skill mention) or agent self-activation. */
    ActivationType: 'requested' | 'auto';
    /** The gate values that admitted this skill — recorded so auditors see the configuration that allowed it. */
    Provenance: AgentSkillInvocationProvenance;
    /** Agent-stated rationale (only for ActivationType='auto'). */
    Reason?: string;
}

/**
 * The gate values in effect when a skill was admitted to a run.
 */
export interface AgentSkillInvocationProvenance {
    /** The agent's AcceptsSkills value at activation ('All' or 'Limited' — 'None' can never activate). */
    AgentAcceptsSkills: string;
    /** The skill's ActivationMode at activation ('Auto' | 'RequestedOnly'). */
    SkillActivationMode: string;
    /** The agent's SkillActivationMode at activation ('Auto' | 'RequestedOnly'). */
    AgentSkillActivationMode: string;
    /** Who pulled the trigger: the user's /skill request or the agent's own decision. */
    RequestedBy: 'user-request' | 'agent-decision';
}
