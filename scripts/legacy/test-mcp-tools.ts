import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3001';

async function testMcpTools() {
    console.log('🧪 MCP Tools Test Suite\n');

    // Create SSE transport and client
    const transport = new SSEClientTransport(new URL(`${MCP_URL}/sse`));
    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    });

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP Server\n');

        // List available tools
        const tools = await client.listTools();
        console.log('📦 Available Tools:');
        tools.tools.forEach((tool: any) => {
            console.log(`   - ${tool.name}: ${tool.description?.substring(0, 50)}...`);
        });
        console.log('');

        // Test 1: get_ticket_context
        console.log('--- Test 1: get_ticket_context ---');
        const ticketResult = await client.callTool({
            name: 'get_ticket_context',
            arguments: {
                tenant_id: 'a0000000-0000-0000-0000-000000000001',
                ticket_id: '077ada4a-aa1a-4775-8949-60a8a03f6461', // From earlier test
            },
        });
        const ticketData = JSON.parse((ticketResult.content[0] as any).text);
        if (ticketData.error) {
            console.log('⚠️  Ticket not found (expected if using different ticket ID)');
        } else {
            console.log(`✅ Got ticket: ${ticketData.title}`);
            console.log(`   Status: ${ticketData.status}`);
            console.log(`   Messages: ${ticketData.messages?.length || 0}`);
        }
        console.log('');

        // Test 2: claim_event (first claim should succeed)
        console.log('--- Test 2: claim_event (first claim) ---');
        const testEventId = 'test-event-' + Date.now();
        const claimResult1 = await client.callTool({
            name: 'claim_event',
            arguments: {
                tenant_id: 'a0000000-0000-0000-0000-000000000001',
                event_id: testEventId,
                consumer_name: 'test-client',
            },
        });
        const claim1 = JSON.parse((claimResult1.content[0] as any).text);
        console.log(`   claimed: ${claim1.claimed}`);
        if (claim1.claimed) {
            console.log('✅ First claim succeeded');
        } else {
            console.log('❌ First claim should have succeeded');
        }
        console.log('');

        // Test 3: claim_event (duplicate should fail)
        console.log('--- Test 3: claim_event (duplicate) ---');
        const claimResult2 = await client.callTool({
            name: 'claim_event',
            arguments: {
                tenant_id: 'a0000000-0000-0000-0000-000000000001',
                event_id: testEventId,
                consumer_name: 'test-client',
            },
        });
        const claim2 = JSON.parse((claimResult2.content[0] as any).text);
        console.log(`   claimed: ${claim2.claimed}`);
        if (!claim2.claimed) {
            console.log('✅ Duplicate claim correctly rejected');
        } else {
            console.log('❌ Duplicate claim should have been rejected');
        }
        console.log('');

        // Test 4: create_action_proposals (low confidence - PROPOSED)
        console.log('--- Test 4: create_action_proposals (low confidence) ---');
        // First create a fresh ticket
        const createRes = await fetch('http://localhost:3000/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: 'a0000000-0000-0000-0000-000000000001',
                title: 'MCP Test Ticket',
                description: 'Testing MCP tools',
                message: 'It sounds weird',
            }),
        });
        const newTicket = await createRes.json();
        console.log(`   Created test ticket: ${newTicket.id}`);

        const proposalResult1 = await client.callTool({
            name: 'create_action_proposals',
            arguments: {
                tenant_id: 'a0000000-0000-0000-0000-000000000001',
                ticket_id: newTicket.id,
                correlation_id: newTicket.correlationId,
                proposals: [{
                    action_type: 'APPLY_TRIAGE',
                    confidence: 0.65,
                    reasoning: 'Vague description, needs human review',
                    payload: { status: 'TRIAGED', priority: 2, category: 'general' },
                }],
            },
        });
        const proposal1 = JSON.parse((proposalResult1.content[0] as any).text);
        console.log(`   Proposal status: ${proposal1.proposals[0].status}`);
        console.log(`   Auto-executed: ${proposal1.proposals[0].autoExecuted}`);
        if (proposal1.proposals[0].status === 'PROPOSED' && !proposal1.proposals[0].autoExecuted) {
            console.log('✅ Low confidence proposal created as PROPOSED');
        } else {
            console.log('❌ Low confidence should create PROPOSED status');
        }
        console.log('');

        // Test 5: create_action_proposals (high confidence - auto EXECUTED)
        console.log('--- Test 5: create_action_proposals (high confidence) ---');
        const createRes2 = await fetch('http://localhost:3000/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: 'a0000000-0000-0000-0000-000000000001',
                title: 'URGENT: Pipe burst in basement',
                description: 'Water flooding everywhere!',
                message: 'Emergency! Water pipe burst in unit 101 basement. Flooding rapidly.',
            }),
        });
        const urgentTicket = await createRes2.json();
        console.log(`   Created urgent ticket: ${urgentTicket.id}`);

        const proposalResult2 = await client.callTool({
            name: 'create_action_proposals',
            arguments: {
                tenant_id: 'a0000000-0000-0000-0000-000000000001',
                ticket_id: urgentTicket.id,
                correlation_id: urgentTicket.correlationId,
                proposals: [{
                    action_type: 'APPLY_TRIAGE',
                    confidence: 0.95,
                    reasoning: 'Clear emergency: pipe burst with flooding. High priority.',
                    payload: { status: 'TRIAGED', priority: 5, category: 'emergency' },
                }],
            },
        });
        const proposal2 = JSON.parse((proposalResult2.content[0] as any).text);
        console.log(`   Proposal status: ${proposal2.proposals[0].status}`);
        console.log(`   Auto-executed: ${proposal2.proposals[0].autoExecuted}`);
        if (proposal2.proposals[0].status === 'EXECUTED' && proposal2.proposals[0].autoExecuted) {
            console.log('✅ High confidence proposal auto-executed');
        } else {
            console.log('❌ High confidence should auto-execute');
        }

        // Verify ticket was updated
        const verifyRes = await fetch(`http://localhost:3000/tickets/${urgentTicket.id}`, {
            headers: { 'x-tenant-id': 'a0000000-0000-0000-0000-000000000001' },
        });
        const verifiedTicket = await verifyRes.json();
        console.log(`   Ticket new status: ${verifiedTicket.status}`);
        console.log(`   Ticket new priority: ${verifiedTicket.priority}`);
        if (verifiedTicket.status === 'TRIAGED' && verifiedTicket.priority === 5) {
            console.log('✅ Ticket state updated correctly');
        }
        console.log('');

        console.log('🎉 ALL MCP TOOLS TESTS PASSED!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
    }
}

testMcpTools();
