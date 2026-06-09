import os
import json
import re
from pathlib import Path
from sentence_transformers import SentenceTransformer, util
from supabase import create_client, Client
from dotenv import load_dotenv

class RagService:
    def __init__(self):
        self.model = None
        self._loaded = False
        self._load_failed = False
        self.curated_knowledge_base = []
        self.curated_embeddings = []
        
        load_dotenv()
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if url and key:
            self.supabase: Client = create_client(url, key)
        else:
            self.supabase = None
        
        # Load curated knowledge base from local file
        self._load_curated_kb()

    def is_available(self) -> bool:
        """Check if the model is available for RAG queries."""
        return self._loaded and not self._load_failed
    
    def _load_curated_kb(self):
        """Load curated knowledge base from local JSON file."""
        kb_path = Path(__file__).parent.parent / "data" / "curated_knowledge_base.json"
        if kb_path.exists():
            try:
                with open(kb_path, "r", encoding="utf-8") as f:
                    self.curated_knowledge_base = json.load(f)
                print(f"[RAG] Loaded {len(self.curated_knowledge_base)} curated knowledge base articles")
            except Exception as e:
                print(f"[RAG] Failed to load curated knowledge base: {e}")

    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for better matching."""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text.lower()

    def _calculate_keyword_overlap(self, query_text: str, article_text: str) -> float:
        """Calculate keyword overlap between query and article."""
        query_words = set(self._preprocess_text(query_text).split())
        article_words = set(self._preprocess_text(article_text).split())
        
        if not query_words:
            return 0.0
        
        intersection = query_words & article_words
        return len(intersection) / len(query_words)

    def load(self):
        """Load the SentenceTransformer model for knowledge base queries."""
        if self._loaded or self._load_failed:
            return
        
        print("[RAG] Loading SentenceTransformer for Knowledge Base...")
        try:
            # Check if a local model path is provided
            model_path = os.environ.get("SENTENCE_TRANSFORMER_MODEL_PATH")
            if model_path and os.path.exists(model_path):
                print(f"[RAG] Loading from local path: {model_path}")
                self.model = SentenceTransformer(model_path)
            else:
                # Download from HuggingFace
                self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self._loaded = True
            print("[RAG] Model loaded successfully.")
            
            # Precompute embeddings for curated knowledge base
            if self.curated_knowledge_base:
                print(f"[RAG] Precomputing embeddings for curated KB articles...")
                article_texts = [f"{article['title']} {article['content']}" for article in self.curated_knowledge_base]
                self.curated_embeddings = self.model.encode(article_texts, convert_to_tensor=True)
                print(f"[RAG] Precomputed {len(self.curated_embeddings)} embeddings")
            
        except Exception as e:
            allow_degraded = os.environ.get("ALLOW_DEGRADED_STARTUP", "0") == "1"
            self._load_failed = True
            print(f"[RAG] Failed to load model: {e}")
            if allow_degraded:
                print("[RAG] DEGRADED: Continuing without model (ALLOW_DEGRADED_STARTUP=1)")
                self.model = None
                self._loaded = False
            else:
                raise

    def search_knowledge_base(self, text: str, threshold: float = 0.6, match_count: int = 1, min_keyword_overlap: float = 0.1):
        """
        Search knowledge base with improved relevancy checks.
        First tries Supabase, falls back to curated local KB if needed.
        Returns best match or None.
        """
        if not self._loaded:
            if self._load_failed:
                print("[RAG] DEGRADED: Knowledge base search skipped (model not available)")
            return None
        
        # Preprocess query text
        processed_query = self._preprocess_text(text)
        
        # Skip very short queries (greetings, etc.)
        if len(processed_query.split()) < 2:
            print("[RAG] Query too short, skipping knowledge base search")
            return None

        # First try Supabase if available
        if self.supabase:
            try:
                # Generate Embedding vector (list of 384 floats)
                vector = self.model.encode(text).tolist()

                # Call the Supabase RPC function
                response = self.supabase.rpc(
                    'match_articles',
                    {
                        'query_embedding': vector,
                        'match_threshold': threshold,
                        'match_count': match_count * 2  # Get extra results to filter
                    }
                ).execute()

                if response.data and len(response.data) > 0:
                    # Filter results by keyword overlap
                    valid_matches = []
                    for article in response.data:
                        full_text = f"{article['title']} {article['content']}"
                        overlap = self._calculate_keyword_overlap(processed_query, full_text)
                        if overlap >= min_keyword_overlap:
                            valid_matches.append(article)
                    
                    if valid_matches:
                        best_match = valid_matches[0]
                        print(f"[RAG] Found matching article in Supabase: {best_match['title']}")
                        return {
                            "id": best_match["id"],
                            "title": best_match["title"],
                            "content": best_match["content"],
                            "similarity": best_match["similarity"]
                        }
                
            except Exception as e:
                print(f"[RAG] Supabase query failed: {e}, falling back to curated KB")
        
        # Fall back to curated knowledge base
        if self.curated_knowledge_base and len(self.curated_embeddings) > 0:
            try:
                query_embedding = self.model.encode(text, convert_to_tensor=True)
                
                # Calculate cosine similarities
                cosine_scores = util.cos_sim(query_embedding, self.curated_embeddings)[0]
                
                # Get top results
                top_results = []
                for i, score in enumerate(cosine_scores):
                    if score >= threshold:
                        article = self.curated_knowledge_base[i]
                        full_text = f"{article['title']} {article['content']}"
                        overlap = self._calculate_keyword_overlap(processed_query, full_text)
                        if overlap >= min_keyword_overlap:
                            top_results.append((score, article))
                
                # Sort by similarity
                top_results.sort(reverse=True, key=lambda x: x[0])
                
                if top_results:
                    best_score, best_article = top_results[0]
                    print(f"[RAG] Found matching article in curated KB: {best_article['title']} (similarity: {best_score:.2f})")
                    return {
                        "id": f"curated-{i}",
                        "title": best_article["title"],
                        "content": best_article["content"],
                        "similarity": float(best_score)
                    }
                
            except Exception as e:
                print(f"[RAG] Curated KB search failed: {e}")
        
        print("[RAG] No relevant knowledge base articles found")
        return None
