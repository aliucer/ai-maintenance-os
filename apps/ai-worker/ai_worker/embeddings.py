"""Embedding module for generating text embeddings using Gemini on AI Studio."""
import os
import json
import logging
import httpx
from typing import List, Optional

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generate embeddings using Gemini Embedding 001."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        self.model = "gemini-embedding-001"
        # AI Studio Endpoint
        self.base_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:embedContent"
        
    def embed(self, text: str) -> List[float]:
        """Generate 3072-dimensional embedding for text."""
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not set")
            
        url = f"{self.base_url}?key={self.api_key}"
        
        # AI Studio Payload Format
        payload = {
            "model": f"models/{self.model}",
            "content": {
                "parts": [{"text": text}]
            },
            "outputDimensionality": 3072
        }
        
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                
            result = response.json()
            # AI Studio Response Format
            # { "embedding": { "values": [...] } }
            embedding = result["embedding"]["values"]
            logger.info(f"Generated embedding: {len(embedding)} dimensions")
            return embedding
            
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            raise
    
    def embed_resolution(self, ticket_title: str, description: str, 
                         resolution_notes: str, messages: str = "") -> List[float]:
        """Generate embedding for a ticket resolution."""
        combined = f"""Ticket: {ticket_title}
Description: {description}
Messages: {messages}
Resolution: {resolution_notes}"""
        
        return self.embed(combined)
