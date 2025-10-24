/**
 * @fileoverview Type definitions for Mermaid diagram generation.
 * Mermaid is a text-based diagram tool that converts markdown-like syntax into rich visualizations.
 *
 * @module @memberjunction/actions-core/visualization
 * @since 2.109.0
 */

/**
 * Mermaid diagram themes
 */
export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral';

/**
 * Supported Mermaid diagram types (documentation only - detected from syntax)
 */
export type MermaidDiagramType =
    | 'flowchart'           // Flowcharts and process flows
    | 'sequenceDiagram'     // Sequence diagrams for interactions
    | 'classDiagram'        // UML class diagrams
    | 'stateDiagram'        // State machine diagrams
    | 'erDiagram'           // Entity-relationship diagrams
    | 'gantt'               // Gantt charts for timelines
    | 'pie'                 // Pie charts
    | 'gitGraph'            // Git branching diagrams
    | 'journey'             // User journey diagrams
    | 'requirementDiagram'  // Requirements diagrams
    | 'mindmap'             // Mind maps
    | 'timeline'            // Timeline diagrams
    | 'quadrantChart'       // Quadrant/matrix charts
    | 'c4'                  // C4 architecture diagrams
    | 'sankey';             // Sankey flow diagrams

/**
 * Mermaid configuration options
 * See: https://mermaid.js.org/config/schema-docs/config.html
 */
export interface MermaidConfig {
    /**
     * Flowchart-specific configuration
     */
    flowchart?: {
        curve?: 'basis' | 'linear' | 'step' | 'stepBefore' | 'stepAfter';
        padding?: number;
        useMaxWidth?: boolean;
        defaultRenderer?: 'dagre-d3' | 'dagre-wrapper' | 'elk';
    };

    /**
     * Sequence diagram configuration
     */
    sequence?: {
        diagramMarginX?: number;
        diagramMarginY?: number;
        boxMargin?: number;
        boxTextMargin?: number;
        noteMargin?: number;
        messageMargin?: number;
        mirrorActors?: boolean;
        showSequenceNumbers?: boolean;
    };

    /**
     * ER diagram configuration
     */
    er?: {
        layoutDirection?: 'TB' | 'BT' | 'LR' | 'RL';
        minEntityWidth?: number;
        minEntityHeight?: number;
        entityPadding?: number;
    };

    /**
     * Class diagram configuration
     */
    class?: {
        arrowMarkerAbsolute?: boolean;
    };

    /**
     * State diagram configuration
     */
    state?: {
        dividerMargin?: number;
        sizeUnit?: number;
        padding?: number;
    };

    /**
     * Gantt chart configuration
     */
    gantt?: {
        titleTopMargin?: number;
        barHeight?: number;
        barGap?: number;
        topPadding?: number;
        leftPadding?: number;
        gridLineStartPadding?: number;
        fontSize?: number;
    };

    /**
     * Font configuration (applies to all diagrams)
     */
    fontFamily?: string;
    fontSize?: number;

    /**
     * Security level
     */
    securityLevel?: 'strict' | 'loose' | 'sandbox';

    /**
     * Log level for debugging
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

/**
 * Common Mermaid syntax examples for documentation
 */
export const MERMAID_EXAMPLES = {
    flowchart: `flowchart TD
    Start[Start] --> Process[Process Data]
    Process --> Decision{Is Valid?}
    Decision -->|Yes| Success[Success]
    Decision -->|No| Error[Error]
    Success --> End[End]
    Error --> End`,

    sequence: `sequenceDiagram
    participant Client
    participant Server
    participant Database
    Client->>Server: Request Data
    Server->>Database: Query
    Database-->>Server: Results
    Server-->>Client: Response`,

    erDiagram: `erDiagram
    USER ||--o{ ORDER : places
    USER {
        string id PK
        string name
        string email
    }
    ORDER ||--|{ LINE_ITEM : contains
    ORDER {
        string id PK
        date orderDate
        string userId FK
    }
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    PRODUCT {
        string id PK
        string name
        decimal price
    }
    LINE_ITEM {
        string orderId FK
        string productId FK
        int quantity
    }`,

    classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,

    stateDiagram: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : Start
    Processing --> Success : Complete
    Processing --> Error : Fail
    Success --> [*]
    Error --> Idle : Retry`,

    gantt: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Planning
    Research           :done, des1, 2024-01-01, 2024-01-15
    Design             :active, des2, 2024-01-16, 2024-02-01
    section Development
    Backend            :des3, 2024-02-01, 2024-03-01
    Frontend           :des4, 2024-02-15, 2024-03-15
    section Testing
    QA                 :des5, 2024-03-01, 2024-03-20`
};
