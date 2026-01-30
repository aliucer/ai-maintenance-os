"""MCP Client for calling MCP server tools."""
import httpx
import json
from typing import Any

class MCPClient:
    """Simple HTTP client for MCP server."""
    
    def __init__(self, base_url: str = "http://localhost:3001"):
        self.base_url = base_url
        self.client = httpx.Client(timeout=30.0)
    
    def health_check(self) -> dict:
        """Check MCP server health."""
        response = self.client.get(f"{self.base_url}/health")
        return response.json()
    
    async def call_tool_async(self, tool_name: str, arguments: dict) -> dict:
        """Call an MCP tool asynchronously (simplified HTTP approach)."""
        # For now, we'll use direct DB calls via the MCP server's health endpoint
        # In production, this would use proper MCP protocol
        async with httpx.AsyncClient(timeout=30.0) as client:
            # We'll implement a simple REST wrapper
            response = await client.post(
                f"{self.base_url}/tools/{tool_name}",
                json=arguments
            )
            return response.json()
    
    def call_tool_sync(self, tool_name: str, arguments: dict) -> dict:
        """Call an MCP tool synchronously via REST wrapper."""
        response = self.client.post(
            f"{self.base_url}/tools/{tool_name}",
            json=arguments
        )
        if response.status_code == 404:
            raise Exception(f"Tool {tool_name} not found or endpoint not implemented")
        return response.json()
    
    def get_ticket_context(self, tenant_id: str, ticket_id: str) -> dict:
        """Get ticket context."""
        return self.call_tool_sync("get_ticket_context", {
            "tenant_id": tenant_id,
            "ticket_id": ticket_id
        })
    
    def claim_event(self, tenant_id: str, event_id: str, consumer_name: str) -> dict:
        """Claim an event for idempotent processing."""
        return self.call_tool_sync("claim_event", {
            "tenant_id": tenant_id,
            "event_id": event_id,
            "consumer_name": consumer_name
        })
    
    def create_action_proposals(
        self, 
        tenant_id: str, 
        ticket_id: str, 
        correlation_id: str, 
        proposals: list
    ) -> dict:
        """Create action proposals."""
        return self.call_tool_sync("create_action_proposals", {
            "tenant_id": tenant_id,
            "ticket_id": ticket_id,
            "correlation_id": correlation_id,
            "proposals": proposals
        })
    
    def store_memory(
        self,
        tenant_id: str,
        source_event_id: str,
        content: str,
        embedding: list,
        ticket_id: str = None,
        metadata: dict = None
    ) -> dict:
        """Store a memory document with embedding."""
        return self.call_tool_sync("store_memory", {
            "tenant_id": tenant_id,
            "source_event_id": source_event_id,
            "ticket_id": ticket_id,
            "content": content,
            "embedding": embedding,
            "metadata": metadata or {}
        })
    
    def search_memory(
        self,
        tenant_id: str,
        query_embedding: list,
        top_k: int = 5
    ) -> dict:
        """Search memory documents by vector similarity."""
        return self.call_tool_sync("search_memory", {
            "tenant_id": tenant_id,
            "query_embedding": query_embedding,
            "top_k": top_k
        })
    
    def close(self):
        """Close the client."""
        self.client.close()

