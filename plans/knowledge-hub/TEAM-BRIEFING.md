# Knowledge Hub — Team Briefing

## Why We're Building This

MemberJunction has strong individual capabilities for vector search, duplicate detection, and content autotagging — but they exist as separate tools with separate UIs, separate indexes, and no awareness of each other. A user who wants to "find everything related to this customer" today would need to manually search entity records, check for duplicates, browse tagged content, and mentally stitch the results together. That's exactly the kind of work software should eliminate.

**Knowledge Hub** unifies all of this into a single application with one shared vector index, one search bar, and one AI assistant that can guide users through the entire workflow.

## What It Does

**Unified Semantic Search** — The headline feature. A single search bar that simultaneously queries three sources: vector embeddings (semantic similarity across entity records and content), full-text indexes (precise keyword matching via SQL Server FTS / PostgreSQL tsvector), and structured metadata filters. Results are fused using Reciprocal Rank Fusion (RRF) and presented in a single ranked list annotated by source type. This means typing "cheese safety regulations" finds related Members (food safety specialists), Content Items (compliance documents), Organizations (FDA, USDA), and tagged resources — all in one query. We're also rebuilding the MJ Explorer global search (Cmd+K) to use this same engine, so unified search becomes available everywhere, not just in Knowledge Hub.

**Shared Vector Index** — Instead of per-entity vector indexes, all embeddings live in one index with rich metadata (entity name, source type, content type, tags, record ID). This enables cross-entity discovery — finding that a Member record is semantically similar to a PDF document or a support ticket. Metadata filtering lets you narrow results to specific entities or content types when needed, while the default is "search everything."

**Knowledge Pipeline** — A unified processing flow that takes any input (entity records, files, web content, RSS feeds) and produces two outputs in one pass: human-readable tags (for browsing and filtering) and vector embeddings (for AI-powered similarity and search). Tags remain valuable for human navigation — they make data browsable and filterable in ways that pure vector search doesn't address.

**Duplicate Detection Workflow** — The existing Kanban-based review system enhanced with entity filtering, pagination for large duplicate sets, and a new purpose-built record merge panel for side-by-side field comparison and resolution. Users can review AI-detected duplicates, compare records field-by-field, and merge with full audit logging.

## Agent Architecture Extensions

**MJ Agent Client SDK** — A new framework-agnostic TypeScript package (`@memberjunction/ai-agent-client`) that introduces **client-side tools** to the MJ agent architecture. Today, agents can invoke server-side Actions but have no way to interact with the user's UI. With client tools, an agent can programmatically navigate the user to a specific screen, open a configuration panel, apply search filters, or highlight a result — all while maintaining the conversation. The server agent publishes a tool request via PubSub, the client executes the registered handler, and sends the result back. The agent pauses during execution (30-second timeout) then continues with the result. This pattern is inspired by ElevenLabs' conversational AI SDK and is designed to be extensible to voice interfaces in the future.

**Floating Chat Overlay** — A persistent chat bubble (bottom-right) that lets users talk to Sage (or any configured agent) from anywhere in the application. The conversation continues seamlessly across navigation — start a chat in Knowledge Hub, navigate to a different app, and the overlay follows with full context. Click "expand" to jump into the full Conversations workspace with the same conversation. The overlay auto-minimizes when the full workspace is active to avoid duplicate UI. This is built generically: the base chat component (`mj-chat`) is framework-reusable, the overlay (`mj-chat-agents-overlay`) handles agent lifecycle and persistence, and a thin MJ Explorer wrapper handles routing events. Any Angular application can embed this pattern.

**Knowledge Agent** — A Sage sub-agent with deep Knowledge Hub integration. It has server tools (create entity documents, trigger vectorization, execute searches, run duplicate detection) and client tools (navigate to dashboards, open configuration panels, apply filters). A user can say "set up duplicate detection for our Members entity" and the agent will analyze the schema, suggest a template, create the entity document, trigger vectorization, and navigate the user to the results — all through natural conversation.

## UX Mockups

Interactive HTML prototypes are available for each major surface. Open the [mockup index](mockups/index.html) to browse all options, or jump directly to the selected designs:

- **[Search Dashboard](mockups/search-option-a.html)** — Google-style clean layout with centered search bar, grouped results, and faceted sidebar filters. This is the default tab and the hero experience.
- **[Global Search (Cmd+K)](mockups/search-option-b.html)** — Command palette / Spotlight overlay for MJ Explorer's global search, with instant grouped results and keyboard navigation.
- **[Floating Chat Overlay](mockups/chat-overlay-option-b.html)** — Persistent bottom-right bubble that expands to a chat panel. Stays visible across navigation, auto-minimizes in full Conversations workspace.
- **[Vector Management](mockups/vectors-option-a.html)** — Index-centric view with the shared index as hero and entity documents as children. Alternates with an [operations center view](mockups/vectors-option-c.html) for monitoring.
- **[Configuration](mockups/config-option-b.html)** — Settings page with left nav and collapsible sections covering Pipeline, Vector DB, Full-Text Indexes, Embedding Models, and Thresholds.
- **[Duplicate Detection](mockups/dupes-option-b.html)** — Enhanced Kanban with inline record previews, entity filtering, and paging for large sets. Click-through to side-by-side merge panel.
- **[Search Results Detail](mockups/results-detail-option-b.html)** — Full page with breadcrumb, score breakdown, and related items sidebar. Supports side-by-side mode toggle (blended with [panel preview](mockups/results-detail-option-a.html)).

## Why This Matters

This isn't incremental improvement — it's a new category of capability for MemberJunction. The combination of structured data search, semantic vector search, automated content tagging, and AI-guided configuration means organizations can make their entire data landscape searchable and interconnected without manual effort. The client-side tool architecture opens the door for agents that don't just answer questions but actively help users accomplish complex tasks by driving the UI. And because everything is built on MJ's metadata-driven foundation, it works across any entity, any content source, and any deployment.
