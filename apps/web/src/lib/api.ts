// API client for the demo
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Hardcoded from seed.ts
export const TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
export const UNIT_ID = 'c0000000-0000-0000-0000-000000000002';

export interface Ticket {
    id: string;
    title: string;
    description: string;
    status: 'NEW' | 'TRIAGED' | 'ASSIGNED' | 'RESOLVED';
    priority: number;
    category?: string;
    createdAt: string;
    updatedAt: string;
    proposals?: AIProposal[];
}

export interface AIProposal {
    id: string;
    ticketId: string;
    actionType: string;
    confidence: number;
    reasoning: string;
    status: 'PROPOSED' | 'EXECUTED' | 'REJECTED';
    payload: {
        status?: string;
        priority?: number;
        category?: string;
    };
}

export interface MemoryDocument {
    id: string;
    content: string;
    similarity?: number;
    createdAt: string;
}

export interface Stats {
    totalTickets: number;
    triaged: number;
    resolved: number;
    memoryCount: number;
}

export async function createTicket(title: string, description: string, message: string): Promise<Ticket> {
    const res = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: TENANT_ID,
            unitId: UNIT_ID,
            title,
            description,
            message,
        }),
    });
    if (!res.ok) throw new Error('Failed to create ticket');
    return res.json();
}

export async function getTickets(): Promise<Ticket[]> {
    const res = await fetch(`${API_URL}/tickets?tenantId=${TENANT_ID}`);
    if (!res.ok) throw new Error('Failed to fetch tickets');
    return res.json();
}

export async function getTicket(id: string): Promise<Ticket> {
    const res = await fetch(`${API_URL}/tickets/${id}`, {
        headers: { 'x-tenant-id': TENANT_ID },
    });
    if (!res.ok) throw new Error('Failed to fetch ticket');
    return res.json();
}

export async function getTicketActions(id: string): Promise<AIProposal[]> {
    const res = await fetch(`${API_URL}/tickets/${id}/actions`, {
        headers: { 'x-tenant-id': TENANT_ID },
    });
    if (!res.ok) return [];
    return res.json();
}

export async function approveAction(actionId: string): Promise<void> {
    const res = await fetch(`${API_URL}/actions/${actionId}/approve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID,
        },
        body: JSON.stringify({ tenantId: TENANT_ID }),
    });
    if (!res.ok) throw new Error('Failed to approve action');
}

export async function rejectAction(actionId: string): Promise<void> {
    const res = await fetch(`${API_URL}/actions/${actionId}/reject`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID,
        },
        body: JSON.stringify({ tenantId: TENANT_ID }),
    });
    if (!res.ok) throw new Error('Failed to reject action');
}

export async function assignTicket(ticketId: string, vendorName: string): Promise<void> {
    const res = await fetch(`${API_URL}/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: TENANT_ID,
            vendorName,
        }),
    });
    if (!res.ok) throw new Error('Failed to assign ticket');
}

export async function getStats(): Promise<Stats> {
    const res = await fetch(`${API_URL}/stats?tenantId=${TENANT_ID}`);
    if (!res.ok) {
        // Fallback stats if endpoint doesn't exist yet
        return { totalTickets: 0, triaged: 0, resolved: 0, memoryCount: 0 };
    }
    return res.json();
}

export async function getMemories(): Promise<MemoryDocument[]> {
    const res = await fetch(`${API_URL}/memories?tenantId=${TENANT_ID}&limit=5`);
    if (!res.ok) return [];
    return res.json();
}
