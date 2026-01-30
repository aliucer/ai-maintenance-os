"""Triage Brain - Gemini LLM integration for ticket classification with RAG."""
import os
import json
import logging
from typing import Optional, List
from pydantic import BaseModel
import httpx

logger = logging.getLogger(__name__)


class TriageResult(BaseModel):
    """Result of ticket triage."""
    category: str
    priority: int
    confidence: float
    reasoning: str
    similar_tickets: List[dict] = []


TRIAGE_PROMPT = """You are a property maintenance triage AI. Analyze the following maintenance ticket and classify it.

TICKET DETAILS:
Title: {title}
Description: {description}

MESSAGES:
{messages}

{similar_section}

Respond with a JSON object containing:
- category: One of "emergency", "urgent", "routine", "cosmetic", "inquiry"
- priority: Integer 1-5 (5 = highest, life safety or major property damage)
- confidence: Float 0.0-1.0 indicating how confident you are
- reasoning: Brief explanation of your classification (include reference to similar tickets if relevant)

CLASSIFICATION GUIDELINES:
- Emergency (priority 5): Fire, flooding, gas leak, no heat in winter, security breach
- Urgent (priority 4): Major appliance failure, significant water leak, electrical issues
- Routine (priority 3): Standard repairs, minor appliance issues
- Cosmetic (priority 2): Paint, minor scratches, aesthetic improvements
- Inquiry (priority 1): Questions about property, lease, or general information

Respond ONLY with valid JSON, no markdown."""

SIMILAR_SECTION_TEMPLATE = """
SIMILAR PAST INCIDENTS:
{incidents}

Use these past resolutions to inform your classification. If a past incident is highly similar, reference it in your reasoning."""


class TriageBrain:
    """AI-powered ticket triage using Gemini with RAG."""
    
    def __init__(self, api_key: Optional[str] = None, mcp_client=None, embedding_service=None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        # Use AI Studio endpoint which works with standard API keys
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        self.mcp_client = mcp_client
        self.embedding_service = embedding_service
        
        if self.api_key:
            logger.info("Gemini API key configured")
        else:
            logger.warning("No Gemini API key, using heuristics")
    
    def triage(self, ticket: dict, tenant_id: str = None) -> TriageResult:
        """Triage a ticket using LLM with RAG or fallback to heuristics."""
        title = ticket.get("title", "")
        description = ticket.get("description", "")
        messages = ticket.get("messages", [])
        
        message_text = "\n".join([
            f"- [{m.get('senderType', 'USER')}]: {m.get('content', '')}"
            for m in messages
        ])
        
        # Search for similar past incidents (RAG)
        similar_tickets = []
        if self.mcp_client and self.embedding_service and tenant_id:
            try:
                similar_tickets = self._search_similar(tenant_id, title, description)
                if similar_tickets:
                    logger.info(f"Found {len(similar_tickets)} similar past incidents")
            except Exception as e:
                logger.warning(f"Memory search failed: {e}")
        
        if self.api_key:
            try:
                result = self._triage_with_gemini(title, description, message_text, similar_tickets)
                result.similar_tickets = similar_tickets
                return result
            except Exception as e:
                logger.error(f"Gemini triage failed: {e}, falling back to heuristics")
        
        return self._triage_with_heuristics(title, description, message_text)
    
    def _search_similar(self, tenant_id: str, title: str, description: str, top_k: int = 3) -> List[dict]:
        """Search for similar past incidents."""
        query = f"{title} {description}"
        query_embedding = self.embedding_service.embed(query)
        
        result = self.mcp_client.search_memory(
            tenant_id=tenant_id,
            query_embedding=query_embedding,
            top_k=top_k
        )
        
        similar = []
        for r in result.get("results", []):
            score = r.get("similarity", 0)
            logger.info(f"   - Match candidate: {score:.4f} | {r.get('content', '')[:30]}...")
            if score > 0.3:  # Lowered threshold to 0.3
                similar.append({
                    "content": r.get("content", ""),
                    "similarity": r.get("similarity", 0),
                    "metadata": r.get("metadata", {})
                })
        
        return similar
    
    def _triage_with_gemini(self, title: str, description: str, messages: str, 
                           similar_tickets: List[dict] = None) -> TriageResult:
        """Use Gemini API for triage with RAG context."""
        # Build similar section if we have matches
        similar_section = ""
        if similar_tickets:
            incidents = "\n".join([
                f"- [Similarity: {t['similarity']:.0%}] {t['content'][:200]}..."
                for t in similar_tickets
            ])
            similar_section = SIMILAR_SECTION_TEMPLATE.format(incidents=incidents)
        
        prompt = TRIAGE_PROMPT.format(
            title=title,
            description=description,
            messages=messages or "(no messages)",
            similar_section=similar_section
        )
        
        url = f"{self.base_url}?key={self.api_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 4096,
            }
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            
        result = response.json()
        content = result["candidates"][0]["content"]["parts"][0]["text"]
        logger.info(f"Gemini response: {content}")
        
        # Parse JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        data = json.loads(content.strip())
        return TriageResult(
            category=data.get("category", "routine"),
            priority=max(1, min(5, int(data.get("priority", 3)))),
            confidence=max(0.0, min(1.0, float(data.get("confidence", 0.7)))),
            reasoning=data.get("reasoning", "LLM classification")
        )
    
    def _triage_with_heuristics(self, title: str, description: str, messages: str) -> TriageResult:
        """Fallback heuristic-based triage."""
        combined = f"{title} {description} {messages}".lower()
        
        if any(kw in combined for kw in ["fire", "flood", "gas leak", "burst", "emergency", "smoke", "burning"]):
            return TriageResult(category="emergency", priority=5, confidence=0.85, 
                              reasoning="Contains emergency keywords")
        
        if any(kw in combined for kw in ["broken", "leak", "electrical", "urgent"]):
            return TriageResult(category="urgent", priority=4, confidence=0.75,
                              reasoning="Contains urgent maintenance keywords")
        
        if any(kw in combined for kw in ["question", "wondering", "how do i"]):
            return TriageResult(category="inquiry", priority=1, confidence=0.70,
                              reasoning="Appears to be an inquiry")
        
        return TriageResult(category="routine", priority=3, confidence=0.60,
                          reasoning="Standard maintenance request")
