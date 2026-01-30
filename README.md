# Property Maintenance AI Triage System

An event-driven property maintenance system. It uses **AI (Gemini)** to triage tickets, **RAG** to recall past resolutions, and **Human-in-the-Loop** workflows to ensure safety.

Built to demonstrate a pragmatic "Agentic" architecture: events, tools (MCP), and memory.

## Architecture

```mermaid
graph TD
    %% Clients
    User([Tenant/Manager]) -->|HTTP| Frontend[Next.js Frontend]
    Frontend -->|REST| API[NestJS API]

    %% Core Infrastructure
    API -->|Read/Write| DB[(Postgres DB)]
    API -->|Publish Events| Kafka{Kafka/Redpanda}

    %% The AI Brain Loop
    Kafka -->|Consume Events| AI[Python AI Worker]
    AI -->|Generate| Gemini[Gemini 2.5 Flash]
    
    %% Tool Use & Memory
    AI -->|Tool Calls| MCP[MCP Server]
    MCP -->|Store/Search| Vector[(pgvector Memory)]
    
    %% Feedback Loop
    MCP -->|Create Proposal| DB
    API -->|SSE Updates| Frontend
    
    %% Styling
    style Gemini fill:#f9f,stroke:#333
    style Kafka fill:#ff9,stroke:#333
    style AI fill:#bbf,stroke:#333
    style Vector fill:#dfd,stroke:#333
```

## How It Works (The Demo Story)

This system isn't just a CRUD app. It learns.

### 🎬 Scene 1: The Incident (AI Triage)
A tenant reports **"Boiler making weird clicking noise"**.
1.  **Ingestion**: The system accepts the ticket and publishes an event (`ticket.created`).
2.  **Analysis**: The AI Worker wakes up, analyzes the text using Gemini.
3.  **Triage**: It classifies the issue as **URGENT** (Priority 4) instantly.
4.  **Action**: If confidence is high (>90%), it auto-triages in milliseconds.

### 🎬 Scene 2: The Resolution (Institutional Memory)
The manager sends "Mike's Heating". Mike fixes it: *"Replaced faulty thermocouple."*
*   **The Magic**: When the ticket is marked resolved, the system **embeds** the problem and solution into its Vector Memory (pgvector).
*   It now "knows" what a clicking boiler usually means.

### 🎬 Scene 3: The Recall (RAG)
Two weeks later, a different unit reports **"No heat, clicking sound"**.
1.  **Recall**: Before answering, the AI searches its memory.
2.  **Context**: It finds the previous "thermocouple" incident.
3.  **Result**: The AI suggests: *"Likely thermocouple issue, similar to Unit 101."*
4.  **Outcome**: The right vendor is sent immediately with the right part.

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Setup Database & Memory
cd apps/api && pnpm prisma migrate deploy && cd ..
./scripts/setup-memory.sh

# 3. Start Services (3 Terminals)
cd apps/api && pnpm run start:dev          # API
cd apps/mcp-server && npx ts-node src/index.ts  # MCP Tools
cd apps/ai-worker && python -m ai_worker.main   # AI Brain

# 4. Run the Full Demo
./scripts/demo-full.sh
```

## License

MIT
