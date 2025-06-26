/**
 * Marketing Agent Output Type Definition
 * This type defines the structure for data passed between marketing sub-agents
 */

export interface MarketingAgentOutput {
  /**
   * Metadata about the content creation process
   */
  metadata: {
    /** Unique identifier for this content creation session */
    sessionId: string;
    /** ISO timestamp when content creation started */
    createdAt: string;
    /** ISO timestamp of last modification */
    updatedAt: string;
    /** Current status of the content */
    status: 'draft' | 'in_review' | 'approved' | 'published';
    /** Version number for tracking iterations */
    version?: number;
    /** The agent who last modified the content */
    lastModifiedBy?: string;
    /** Original requirements/brief provided */
    originalBrief: string;
    /** Target audience for the content */
    targetAudience?: string;
    /** Content type being created */
    contentType?: 'email' | 'blog_post' | 'social_media' | 'landing_page' | 'ad_copy' | 'press_release' | 'other';
    /** Target platforms for distribution */
    targetPlatforms?: string[];
  };

  /**
   * Core content created and refined through the pipeline
   */
  content: {
    /** Primary headline or subject line */
    headline?: string;
    /** Alternative headlines for A/B testing */
    alternativeHeadlines?: string[];
    /** Subheadline or preview text */
    subheadline?: string;
    /** Main body content (HTML or markdown supported) */
    body?: string;
    /** Call-to-action text */
    callToAction?: string;
    /** Executive summary or abstract */
    summary?: string;
    /** Key points or bullet points */
    keyPoints?: string[];
    /** Platform-specific variations */
    platformVariations?: {
      platform: string;
      headline?: string;
      body?: string;
      characterCount?: number;
      [key: string]: any; // Allow additional platform-specific fields
    }[];
  };

  /**
   * Copywriter agent section
   */
  copywriter?: {
    /** Initial draft version */
    initialDraft?: string;
    /** Creative approach used */
    creativeApproach?: string;
    /** Tone of voice applied */
    toneOfVoice?: string;
    /** Persuasion techniques used */
    persuasionTechniques?: string[];
    /** Emotional hooks incorporated */
    emotionalHooks?: string[];
    /** Story elements if applicable */
    storyElements?: {
      hook?: string;
      conflict?: string;
      resolution?: string;
      [key: string]: any; // Allow additional story elements
    };
    /** Research insights used */
    researchInsights?: string[];
    /** Word count */
    wordCount?: number;
    /** Readability score */
    readabilityScore?: number;
    /** Additional copywriter-specific fields */
    [key: string]: any;
  };

  /**
   * SEO/AIEO Specialist agent section
   */
  seo?: {
    /** Primary keyword */
    primaryKeyword?: string;
    /** Secondary keywords */
    secondaryKeywords?: string[];
    /** Long-tail keywords */
    longTailKeywords?: string[];
    /** Meta title */
    metaTitle?: string;
    /** Meta description */
    metaDescription?: string;
    /** URL slug suggestion */
    urlSlug?: string;
    /** Header structure (H1, H2, H3, etc.) */
    headerStructure?: {
      h1?: string;
      h2?: string[];
      h3?: string[];
      [key: string]: any; // Allow h4, h5, etc.
    };
    /** AI optimization elements */
    aieoOptimization?: {
      /** Structured data markup suggestions */
      structuredData?: any;
      /** Natural language optimization */
      nlpOptimization?: string[];
      /** Voice search optimization */
      voiceSearchPhrases?: string[];
      /** FAQ schema if applicable */
      faqSchema?: {
        question: string;
        answer: string;
      }[];
      /** Additional AIEO fields */
      [key: string]: any;
    };
    /** Keyword density analysis */
    keywordDensity?: {
      keyword: string;
      density: number;
      occurrences: number;
    }[];
    /** Content optimization score */
    optimizationScore?: number;
    /** Additional SEO-specific fields */
    [key: string]: any;
  };

  /**
   * Editor agent section
   */
  editor?: {
    /** Grammar and style corrections made */
    corrections?: {
      type: 'grammar' | 'style' | 'clarity' | 'consistency';
      original: string;
      corrected: string;
      explanation?: string;
    }[];
    /** Fact-checking results */
    factChecking?: {
      claim: string;
      verified: boolean;
      source?: string;
      notes?: string;
    }[];
    /** Readability improvements */
    readabilityImprovements?: string[];
    /** Message clarity score */
    clarityScore?: number;
    /** Consistency checks passed */
    consistencyChecks?: {
      check: string;
      passed: boolean;
      notes?: string;
    }[];
    /** Editorial feedback */
    feedback?: string[];
    /** Suggested improvements */
    suggestions?: string[];
    /** Additional editor-specific fields */
    [key: string]: any;
  };

  /**
   * Brand Guardian agent section
   */
  brand?: {
    /** Brand alignment score */
    alignmentScore?: number;
    /** Brand voice consistency check */
    voiceConsistency?: {
      aligned: boolean;
      deviations?: string[];
      suggestions?: string[];
    };
    /** Brand values alignment */
    valuesAlignment?: {
      value: string;
      reflected: boolean;
      evidence?: string;
    }[];
    /** Visual identity compliance */
    visualCompliance?: {
      element: string;
      compliant: boolean;
      notes?: string;
    }[];
    /** Legal compliance checks */
    legalCompliance?: {
      check: string;
      passed: boolean;
      concerns?: string[];
    }[];
    /** Brand messaging pillars addressed */
    messagingPillars?: {
      pillar: string;
      addressed: boolean;
      implementation?: string;
    }[];
    /** Brand dos and don'ts adherence */
    brandGuidelines?: {
      guideline: string;
      followed: boolean;
      notes?: string;
    }[];
    /** Final approval status */
    approvalStatus?: 'approved' | 'conditional' | 'rejected';
    /** Approval notes */
    approvalNotes?: string;
    /** Additional brand-specific fields */
    [key: string]: any;
  };

  /**
   * Publisher agent section (for future implementation)
   */
  publisher?: {
    /** Publishing schedule */
    schedule?: {
      platform: string;
      scheduledTime: string;
      timezone: string;
    }[];
    /** Distribution channels */
    channels: {
      channel: string;
      status: 'pending' | 'scheduled' | 'published' | 'failed';
      url?: string;
      metrics?: any;
    }[];
    /** Tracking parameters */
    tracking?: {
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      customParameters?: Record<string, string>;
    };
    /** Publishing recommendations */
    recommendations: string[];
  };

  /**
   * Performance metrics and analytics
   */
  metrics?: {
    /** Estimated engagement score */
    estimatedEngagement?: number;
    /** Predicted click-through rate */
    predictedCTR?: number;
    /** Content quality score */
    qualityScore?: number;
    /** Time spent in each stage */
    processingTime?: {
      stage: string;
      duration: number; // in seconds
    }[];
  };

  /**
   * Iteration history
   */
  iterations?: {
    /** Iteration number */
    iteration: number;
    /** Agent who made changes */
    agent: string;
    /** Summary of changes */
    changes: string;
    /** Timestamp */
    timestamp: string;
  }[];
}