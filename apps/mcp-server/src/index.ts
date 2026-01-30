/**
 * MCP Server - Main Entry Point
 * 
 * Clean architecture:
 * - tools.ts: Business logic (single source of truth)
 * - index.ts: MCP protocol + REST endpoints (thin wrappers)
 */

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import {
    getTicketContext,
    claimEvent,
    createActionProposals,
    storeMemory,
    searchMemory,
    prisma,
} from './tools';

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// MCP Server Setup
// ============================================

const mcpServer = new McpServer({
    name: 'maintain-mcp',
    version: '1.0.0',
});

// ============================================
// MCP Tools (wrap shared functions)
// ============================================

mcpServer.tool(
    'get_ticket_context',
    'Fetches ticket details and messages for a given tenant and ticket ID',
    {
        tenant_id: z.string().describe('The tenant UUID'),
        ticket_id: z.string().describe('The ticket UUID'),
    },
    async ({ tenant_id, ticket_id }) => {
        const ticket = await getTicketContext(tenant_id, ticket_id);
        if (!ticket) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Ticket not found' }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(ticket) }] };
    }
);

mcpServer.tool(
    'claim_event',
    'Claims an event for idempotent processing',
    {
        tenant_id: z.string().describe('The tenant UUID'),
        event_id: z.string().describe('The event UUID to claim'),
        consumer_name: z.string().describe('Name of the consumer'),
    },
    async ({ tenant_id, event_id, consumer_name }) => {
        const result = await claimEvent(tenant_id, event_id, consumer_name);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

mcpServer.tool(
    'create_action_proposals',
    'Creates AI action proposals for a ticket. Auto-executes APPLY_TRIAGE if confidence >= 0.90.',
    {
        tenant_id: z.string().describe('The tenant UUID'),
        ticket_id: z.string().describe('The ticket UUID'),
        correlation_id: z.string().describe('The correlation ID'),
        proposals: z.array(z.object({
            action_type: z.string(),
            confidence: z.number(),
            reasoning: z.string(),
            payload: z.object({
                status: z.string().optional(),
                priority: z.number().optional(),
                category: z.string().optional(),
            }),
        })),
    },
    async ({ tenant_id, ticket_id, correlation_id, proposals }) => {
        const result = await createActionProposals(tenant_id, ticket_id, correlation_id, proposals);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

mcpServer.tool(
    'store_memory',
    'Store a memory document with embedding for RAG retrieval',
    {
        tenant_id: z.string().describe('Tenant ID'),
        source_event_id: z.string().describe('Source event ID for idempotency'),
        ticket_id: z.string().optional().describe('Associated ticket ID'),
        content: z.string().describe('Text content to store'),
        embedding: z.array(z.number()).describe('768-dimensional embedding vector'),
        metadata: z.object({
            ticketTitle: z.string().optional(),
            resolutionNotes: z.string().optional(),
            vendorName: z.string().optional(),
            category: z.string().optional(),
            priority: z.number().optional(),
        }).optional(),
    },
    async ({ tenant_id, source_event_id, ticket_id, content, embedding, metadata }) => {
        const result = await storeMemory(tenant_id, source_event_id, content, embedding, ticket_id, metadata);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

mcpServer.tool(
    'search_memory',
    'Search memory documents using vector similarity',
    {
        tenant_id: z.string().describe('Tenant ID'),
        query_embedding: z.array(z.number()).describe('768-dimensional query embedding'),
        top_k: z.number().default(5).describe('Number of results'),
    },
    async ({ tenant_id, query_embedding, top_k }) => {
        const result = await searchMemory(tenant_id, query_embedding, top_k);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

// ============================================
// SSE Transport Endpoints
// ============================================

const transports = new Map<string, SSEServerTransport>();

app.get('/sse', async (req, res) => {
    console.log('New SSE connection');
    const transport = new SSEServerTransport('/mcp', res);
    const sessionId = Math.random().toString(36).substring(7);
    transports.set(sessionId, transport);

    res.on('close', () => {
        console.log('SSE connection closed');
        transports.delete(sessionId);
    });

    await mcpServer.connect(transport);
});

app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['x-session-id'] as string;
    const transport = transports.get(sessionId);

    if (!transport) {
        const tempTransport = new SSEServerTransport('/mcp', res);
        await mcpServer.connect(tempTransport);
        await tempTransport.handlePostMessage(req, res);
        return;
    }

    await transport.handlePostMessage(req, res);
});

// ============================================
// REST Endpoints (for HTTP-based tool access)
// ============================================

app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', db: 'connected' });
    } catch {
        res.status(500).json({ status: 'error', db: 'disconnected' });
    }
});

app.post('/tools/get_ticket_context', async (req, res) => {
    try {
        const { tenant_id, ticket_id } = req.body;
        const ticket = await getTicketContext(tenant_id, ticket_id);
        if (!ticket) {
            res.json({ error: 'Ticket not found' });
            return;
        }
        res.json(ticket);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tools/claim_event', async (req, res) => {
    try {
        const { tenant_id, event_id, consumer_name } = req.body;
        const result = await claimEvent(tenant_id, event_id, consumer_name);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tools/create_action_proposals', async (req, res) => {
    try {
        const { tenant_id, ticket_id, correlation_id, proposals } = req.body;
        const result = await createActionProposals(tenant_id, ticket_id, correlation_id, proposals);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tools/store_memory', async (req, res) => {
    try {
        const { tenant_id, source_event_id, ticket_id, content, embedding, metadata } = req.body;
        const result = await storeMemory(tenant_id, source_event_id, content, embedding, ticket_id, metadata);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tools/search_memory', async (req, res) => {
    try {
        const { tenant_id, query_embedding, top_k = 5 } = req.body;
        const result = await searchMemory(tenant_id, query_embedding, top_k);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message, results: [] });
    }
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[MCP] Server running on http://localhost:${PORT}`);
    console.log('[MCP] Tools: get_ticket_context, claim_event, create_action_proposals, store_memory, search_memory');
});
