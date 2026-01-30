"""AI Worker main entry point."""
import os
import logging
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from .consumer import TicketEventConsumer
from .mcp_client import MCPClient
from .triage import TriageBrain
from .embeddings import EmbeddingService

# Configure logging (keep for file logs/errors, but use Rich for demo visuals)
logging.basicConfig(
    level=logging.ERROR, # Reduce noise, let Rich handle the show
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ai-worker")

# Load environment
load_dotenv()

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
MCP_URL = os.getenv("MCP_URL", "http://localhost:3001")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Rich Console
console = Console()

def handle_ticket_created(event: dict, mcp: MCPClient, triage_brain: TriageBrain):
    """Handle a ticket.created event."""
    payload = event["value"]
    event_id = payload.get("eventId")
    tenant_id = payload.get("tenantId")
    ticket_id = payload.get("aggregateId")
    correlation_id = payload.get("correlationId")
    
    console.print(Panel(f"[bold blue]📥 Received Event: ticket.created[/]\nID: {event_id}", border_style="blue"))
    console.print(f"  [dim]Tenant: {tenant_id}[/]")
    console.print(f"  [dim]Ticket: {ticket_id}[/]")
    
    # Step 1: Claim event for idempotency
    try:
        claim_result = mcp.claim_event(tenant_id, event_id, "ai-worker")
        if not claim_result.get("claimed", False):
            console.print(f"[yellow]⚠️ Event {event_id} already processed, skipping[/]")
            return
    except Exception as e:
        logger.error(f"Failed to claim event: {e}")
        return
    
    # Step 2: Get ticket context
    try:
        console.print("[dim]🛠️  Calling Tool: get_ticket_context...[/]")
        ticket = mcp.get_ticket_context(tenant_id, ticket_id)
        if ticket.get("error"):
            console.print(f"[bold red]❌ Failed to get ticket context: {ticket['error']}[/]")
            return
        console.print(f"  📄 Ticket Title: [bold]{ticket.get('title', 'unknown')}[/]")
    except Exception as e:
        logger.error(f"Failed to get ticket context: {e}")
        return
    
    # Step 3: AI Triage using TriageBrain with RAG
    try:
        console.print("[dim]🧠 AI Analysis starting...[/]")
        triage_result = triage_brain.triage(ticket, tenant_id=tenant_id)
        
        category_color = "red" if triage_result.category == "emergency" else ("orange1" if triage_result.category == "urgent" else "green")
        
        console.print(f"\n[bold]🎯 Triage Result:[/]")
        console.print(f"  Category:   [bold {category_color}]{triage_result.category.upper()}[/]")
        console.print(f"  Priority:   [bold]{triage_result.priority}[/]")
        console.print(f"  Confidence: [bold green]{triage_result.confidence:.2f}[/]")
        console.print(f"  Reasoning:  [cyan]{triage_result.reasoning}[/]\n")
        
        if triage_result.similar_tickets:
            count = len(triage_result.similar_tickets)
            console.print(f"[bold yellow]📚 Memory Recall: Found {count} similar past incidents[/]")
            for i, similar in enumerate(triage_result.similar_tickets):
                 score = similar.get('similarity', 0)
                 content = similar.get('content', '')[:150].replace('\n', ' ')
                 console.print(f"   [yellow]• Match {i+1} ({score:.1%}):[/] [italic]{content}...[/]")
    except Exception as e:
        logger.error(f"Triage failed: {e}")
        return
    
    # Step 4: Create proposal
    try:
        console.print("\n[dim]🛠️  Calling Tool: create_action_proposals...[/]")
        proposal_result = mcp.create_action_proposals(
            tenant_id,
            ticket_id,
            correlation_id,
            proposals=[{
                "action_type": "APPLY_TRIAGE",
                "confidence": triage_result.confidence,
                "reasoning": triage_result.reasoning,
                "payload": {
                    "status": "TRIAGED",
                    "priority": triage_result.priority,
                    "category": triage_result.category
                }
            }]
        )
        
        proposals = proposal_result.get("proposals", [])
        if proposals:
            proposal = proposals[0]
            if proposal.get('autoExecuted'):
                console.print(Panel("[bold green]✅ HIGH CONFIDENCE: Ticket Auto-Triaged![/]", border_style="green"))
            else:
                console.print(Panel("[bold yellow]📋 LOW CONFIDENCE: Proposal created for Manager Review[/]", border_style="yellow"))
        else:
            console.print("[red]⚠️ No proposals returned[/]")
            
    except Exception as e:
        logger.error(f"Failed to create proposal: {e}")
        return
    
    console.print(f"[dim]✅ Event processing complete[/]\n")


def handle_ticket_resolved(event: dict, mcp: MCPClient, embedding_service):
    """Handle a ticket.resolved event - store resolution as memory."""
    payload = event["value"]
    event_id = payload.get("eventId")
    tenant_id = payload.get("tenantId")
    ticket_id = payload.get("aggregateId")
    correlation_id = payload.get("correlationId")
    
    # Extract resolution details from payload
    event_payload = payload.get("payload", {})
    resolution_notes = event_payload.get("resolutionNotes", "")
    vendor_name = event_payload.get("vendorName", "")
    
    console.print(Panel(f"[bold blue]📥 Received Event: ticket.resolved[/]\nID: {event_id}", border_style="blue"))
    console.print(f"  [dim]Ticket: {ticket_id}[/]")
    console.print(f"  [dim]Vendor: {vendor_name}[/]")
    
    # Step 1: Claim event for idempotency
    try:
        claim_result = mcp.claim_event(tenant_id, event_id, "ai-worker-memory")
        if not claim_result.get("claimed", False):
            console.print(f"[yellow]⚠️ Event {event_id} already processed, skipping[/]")
            return
    except Exception as e:
        logger.error(f"Failed to claim event: {e}")
        return
    
    # Step 2: Get ticket context for full details
    try:
        console.print("[dim]🛠️  Calling Tool: get_ticket_context...[/]")
        ticket = mcp.get_ticket_context(tenant_id, ticket_id)
        if ticket.get("error"):
            console.print(f"[bold red]❌ Failed to get ticket context: {ticket['error']}[/]")
            return
    except Exception as e:
        logger.error(f"Failed to get ticket context: {e}")
        return
    
    # Step 3: Build memory content
    title = ticket.get("title", "Unknown")
    description = ticket.get("description", "")
    messages = ticket.get("messages", [])
    message_text = "\n".join([
        f"- [{m.get('senderType', 'USER')}]: {m.get('content', '')}"
        for m in messages
    ])
    
    memory_content = f"""Ticket: {title}
Description: {description}
Messages: {message_text[:500]}
Resolution: {resolution_notes}
Vendor: {vendor_name}"""
    
    console.print(f"[italic]📝 Learning from resolution...[/]")
    
    # Step 4: Generate embedding
    try:
        embedding = embedding_service.embed(memory_content)
        console.print(f"  [dim]Generated embedding: {len(embedding)} dimensions[/]")
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        return
    
    # Step 5: Store memory
    try:
        console.print("[dim]🛠️  Calling Tool: store_memory...[/]")
        result = mcp.store_memory(
            tenant_id=tenant_id,
            source_event_id=event_id,
            ticket_id=ticket_id,
            content=memory_content,
            embedding=embedding,
            metadata={
                "ticketTitle": title,
                "vendorName": vendor_name,
                "resolutionNotes": resolution_notes[:200],
                "correlationId": correlation_id,
            }
        )
        
        if result.get("skipped"):
            console.print(f"[yellow]  Memory already stored, skipping[/]")
        elif not result.get("success", True) or result.get("error"):
            console.print(f"[bold red]  ❌ FAILED to store memory: {result.get('error', 'Unknown error')}[/]")
        else:
            memory_id = result.get('id', 'unknown')
            console.print(Panel(f"[bold gold1]💾 Institutional Memory Updated![/]\nID: {memory_id[:8]}...", border_style="gold1"))
            
    except Exception as e:
        logger.error(f"Failed to store memory: {e}")
        return
    
    console.print(f"[dim]✅ Event processing complete[/]\n")


def main():
    """Main entry point."""
    console.print(Panel.fit("[bold magenta]🤖 AI Worker Starting...[/]", border_style="magenta"))
    console.print(f"  Kafka: [cyan]{KAFKA_BOOTSTRAP_SERVERS}[/]")
    console.print(f"  MCP:   [cyan]{MCP_URL}[/]")
    
    if GOOGLE_API_KEY:
        console.print("  Gemini: [green]Configured[/]")
    else:
        console.print("  Gemini: [bold red]NOT SET (using heuristics)[/]")
    
    # Create MCP client
    mcp = MCPClient(MCP_URL)
    
    # Check MCP health
    try:
        health = mcp.health_check()
        console.print(f"  MCP Health: [green]{health}[/]\n")
    except Exception as e:
        console.print(f"[bold red]❌ MCP health check failed: {e}[/]")
        return
    
    # Create embedding service for RAG
    embedding_service = EmbeddingService(api_key=GOOGLE_API_KEY)
    
    # Create triage brain with RAG
    triage_brain = TriageBrain(
        api_key=GOOGLE_API_KEY,
        mcp_client=mcp,
        embedding_service=embedding_service
    )
    
    # Create consumer - listen to both ticket.created AND ticket.resolved
    consumer = TicketEventConsumer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        topics=["ticket.created", "ticket.resolved"]
    )
    
    # Start consuming - route to appropriate handler based on topic
    def handler(event: dict):
        topic = event.get("topic", "")
        if topic == "ticket.created":
            handle_ticket_created(event, mcp, triage_brain)
        elif topic == "ticket.resolved":
            handle_ticket_resolved(event, mcp, embedding_service)
        else:
            logger.warning(f"Unknown topic: {topic}")
    
    try:
        consumer.consume(handler)
    finally:
        mcp.close()

if __name__ == "__main__":
    main()

