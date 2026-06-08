"""
Duplicate Detection Service
Uses sentence-transformers all-MiniLM-L6-v2 to detect similar tickets.

Architecture Fix (#2373):
- Replaced in-memory list + local JSON file with Supabase-backed persistence.
- Embeddings are stored in the `ticket_embeddings` table in Supabase so that
  all Uvicorn workers and container restarts share a single consistent index.
- Graceful fallback: if Supabase is not configured (local dev / ALLOW_DEGRADED_STARTUP=1),
  the service falls back to an in-memory store with a clear warning, preserving
  existing behaviour without breaking local development.

Supabase table required (run once via Supabase SQL editor):
    CREATE TABLE IF NOT EXISTS ticket_embeddings (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id     text NOT NULL UNIQUE,
        text          text NOT NULL,
        embedding     jsonb NOT NULL,          -- float[] stored as JSON array
        created_at    timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_embeddings_ticket_id
        ON ticket_embeddings(ticket_id);
"""

import os
import json
import logging
from typing import Optional

import torch
from sentence_transformers import SentenceTransformer, util

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.70

# ---------------------------------------------------------------------------
# Optional Supabase import — gracefully degrade if not installed / configured
# ---------------------------------------------------------------------------
try:
    from supabase import create_client, Client as SupabaseClient
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    SupabaseClient = None


def _build_supabase_client() -> Optional["SupabaseClient"]:
    """Return a Supabase service-role client, or None if not configured."""
    if not _SUPABASE_AVAILABLE:
        return None
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as exc:
        logger.warning("[DuplicateService] Could not build Supabase client: %s", exc)
        return None


class DuplicateService:
    """
    Stateless-friendly duplicate-ticket detector.

    In production (Supabase configured):
        - Embeddings are read from / written to the `ticket_embeddings` table.
        - No local state is kept between requests; every worker queries the same DB.

    In development (no Supabase / ALLOW_DEGRADED_STARTUP=1):
        - Falls back to the previous in-memory list behaviour so local dev still works.
    """

    def __init__(self):
        self.model: Optional[SentenceTransformer] = None
        self._loaded: bool = False
        self._load_failed: bool = False
        self._supabase: Optional[SupabaseClient] = None

        # ------------------------------------------------------------------
        # Fallback in-memory store (dev / degraded mode only)
        # Kept intentionally so the service degrades gracefully without changes
        # to call-sites in main.py.
        # ------------------------------------------------------------------
        self._fallback_tickets: list[tuple[str, object, str]] = []
        self._use_supabase: bool = False

        # Legacy path kept so existing code that references storage_file
        # doesn't break, but it is NOT used when Supabase is active.
        self.storage_file = os.path.join(
            os.path.dirname(__file__), "..", "data", "case_history_cache.json"
        )

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True when the model is loaded and ready."""
        return self._loaded and not self._load_failed

    def load(self):
        """Load the sentence-transformer model and initialise the storage backend."""
        if self._loaded or self._load_failed:
            return

        logger.info("[DuplicateService] Loading model...")
        try:
            model_path = os.environ.get("SENTENCE_TRANSFORMER_MODEL_PATH", "").strip()
            if model_path and os.path.exists(model_path):
                logger.info("[DuplicateService] Loading from local path: %s", model_path)
                self.model = SentenceTransformer(model_path)
            else:
                self.model = SentenceTransformer("all-MiniLM-L6-v2")

            self._loaded = True
            logger.info("[DuplicateService] Model loaded.")

            # Try to connect to Supabase as the persistence backend.
            self._supabase = _build_supabase_client()
            if self._supabase:
                self._use_supabase = True
                logger.info(
                    "[DuplicateService] Supabase backend active — "
                    "duplicate index is shared across all workers."
                )
            else:
                self._use_supabase = False
                logger.warning(
                    "[DuplicateService] Supabase not configured — "
                    "falling back to in-memory store (NOT suitable for multi-worker production)."
                )
                self._load_fallback_from_disk()

        except Exception as exc:
            allow_degraded = os.environ.get("ALLOW_DEGRADED_STARTUP", "0") == "1"
            self._load_failed = True
            logger.error("[DuplicateService] Failed to load model: %s", exc)
            if allow_degraded:
                logger.warning(
                    "[DuplicateService] DEGRADED: Continuing without model (ALLOW_DEGRADED_STARTUP=1)"
                )
                self.model = None
                self._loaded = False
            else:
                raise

    # ------------------------------------------------------------------
    # Core API — add & check
    # ------------------------------------------------------------------

    def add_ticket(self, ticket_id: str, text: str):
        """Compute and persist the embedding for a newly saved ticket."""
        self.load()
        if not self.is_available():
            logger.warning(
                "[DuplicateService] DEGRADED: Skipping embedding for ticket %s (model not available)",
                ticket_id,
            )
            return

        embedding = self.model.encode(text, convert_to_tensor=True)

        if self._use_supabase:
            self._supabase_upsert(ticket_id, text, embedding)
        else:
            # Fallback: keep in memory and persist to local JSON
            self._fallback_tickets.append((ticket_id, embedding, text))
            self._save_fallback_to_disk(ticket_id, text)

    def check_duplicate(self, text: str, threshold: Optional[float] = None) -> dict:
        """
        Check if *text* is a duplicate of any previously stored ticket.

        Returns:
            {
                "is_duplicate": bool,
                "duplicate_ticket_id": str | None,
                "similarity": float,
            }
        """
        self.load()

        _no_dup = {"is_duplicate": False, "duplicate_ticket_id": None, "similarity": 0.0}

        if not self.is_available():
            logger.warning("[DuplicateService] DEGRADED: Duplicate check skipped (model not available).")
            return _no_dup

        active_threshold = threshold if threshold is not None else SIMILARITY_THRESHOLD

        if self._use_supabase:
            return self._check_duplicate_supabase(text, active_threshold)
        else:
            return self._check_duplicate_fallback(text, active_threshold)

    # ------------------------------------------------------------------
    # Supabase backend
    # ------------------------------------------------------------------

    def _supabase_upsert(self, ticket_id: str, text: str, embedding: torch.Tensor):
        """Store a ticket embedding in the `ticket_embeddings` Supabase table."""
        try:
            embedding_list: list[float] = embedding.cpu().tolist()
            self._supabase.table("ticket_embeddings").upsert(
                {
                    "ticket_id": ticket_id,
                    "text": text,
                    "embedding": json.dumps(embedding_list),
                },
                on_conflict="ticket_id",
            ).execute()
            logger.info("[DuplicateService] Indexed ticket %s in Supabase.", ticket_id)
        except Exception as exc:
            logger.error(
                "[DuplicateService] Failed to upsert embedding for ticket %s: %s",
                ticket_id,
                exc,
            )

    def _check_duplicate_supabase(self, text: str, threshold: float) -> dict:
        """
        Fetch all stored embeddings from Supabase and perform cosine-similarity
        comparison against the query embedding.

        Note: For very large deployments (100k+ tickets) this should be replaced
        with a pgvector ANN query. For typical helpdesk volumes this is fast enough.
        """
        try:
            response = (
                self._supabase.table("ticket_embeddings")
                .select("ticket_id, embedding")
                .execute()
            )
            rows = response.data or []
        except Exception as exc:
            logger.error("[DuplicateService] Failed to fetch embeddings from Supabase: %s", exc)
            return {"is_duplicate": False, "duplicate_ticket_id": None, "similarity": 0.0}

        if not rows:
            return {"is_duplicate": False, "duplicate_ticket_id": None, "similarity": 0.0}

        query_embedding = self.model.encode(text, convert_to_tensor=True)

        best_score = 0.0
        best_id: Optional[str] = None

        for row in rows:
            try:
                raw = row["embedding"]
                # Supabase may return the jsonb column as a string or a list
                emb_list: list[float] = json.loads(raw) if isinstance(raw, str) else raw
                stored_emb = torch.tensor(emb_list, dtype=torch.float32)
                score: float = util.cos_sim(query_embedding, stored_emb).item()
                if score > best_score:
                    best_score = score
                    best_id = row["ticket_id"]
            except Exception as row_exc:
                logger.warning(
                    "[DuplicateService] Skipping malformed embedding row (ticket_id=%s): %s",
                    row.get("ticket_id"),
                    row_exc,
                )

        is_dup = best_score >= threshold
        return {
            "is_duplicate": is_dup,
            "duplicate_ticket_id": best_id if is_dup else None,
            "similarity": round(best_score, 4),
        }

    # ------------------------------------------------------------------
    # Fallback (in-memory + local JSON) — dev / degraded mode only
    # ------------------------------------------------------------------

    def _load_fallback_from_disk(self):
        """Populate the in-memory fallback store from the legacy local JSON file."""
        if not os.path.exists(self.storage_file):
            return
        logger.info(
            "[DuplicateService] Fallback mode: loading ticket history from %s …",
            self.storage_file,
        )
        try:
            with open(self.storage_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            for item in data:
                t_text = item["text"]
                emb = self.model.encode(t_text, convert_to_tensor=True)
                self._fallback_tickets.append((item["ticket_id"], emb, t_text))
            logger.info(
                "[DuplicateService] Fallback: loaded %d tickets.", len(self._fallback_tickets)
            )
        except Exception as exc:
            logger.error("[DuplicateService] Error loading fallback storage: %s", exc)

    def _save_fallback_to_disk(self, ticket_id: str, text: str):
        """Append a ticket entry to the local JSON cache (fallback mode only)."""
        data: list[dict] = []
        try:
            os.makedirs(os.path.dirname(self.storage_file), exist_ok=True)
            if os.path.exists(self.storage_file):
                with open(self.storage_file, "r", encoding="utf-8") as fh:
                    try:
                        data = json.load(fh)
                        if not isinstance(data, list):
                            data = []
                    except json.JSONDecodeError:
                        data = []
            data.append({"ticket_id": ticket_id, "text": text})
            with open(self.storage_file, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
            logger.info("[DuplicateService] Fallback: indexed ticket %s to local cache.", ticket_id)
        except Exception as exc:
            logger.error("[DuplicateService] Failed to save fallback to disk: %s", exc)

    def _check_duplicate_fallback(self, text: str, threshold: float) -> dict:
        """In-memory cosine-similarity check (fallback / dev mode)."""
        if not self._fallback_tickets:
            return {"is_duplicate": False, "duplicate_ticket_id": None, "similarity": 0.0}

        query_embedding = self.model.encode(text, convert_to_tensor=True)
        best_score = 0.0
        best_id: Optional[str] = None

        for ticket_id, stored_emb, _ in self._fallback_tickets:
            score: float = util.cos_sim(query_embedding, stored_emb).item()
            if score > best_score:
                best_score = score
                best_id = ticket_id

        is_dup = best_score >= threshold
        return {
            "is_duplicate": is_dup,
            "duplicate_ticket_id": best_id if is_dup else None,
            "similarity": round(best_score, 4),
        }

    # ------------------------------------------------------------------
    # Legacy shim — kept so any external caller of save_to_disk() still works
    # ------------------------------------------------------------------

    def save_to_disk(self, ticket_id: str, text: str):
        """
        Legacy method — previously used to persist to local JSON.
        Now a no-op when Supabase is active; delegates to fallback disk save otherwise.
        Kept for backwards compatibility.
        """
        if not self._use_supabase:
            self._save_fallback_to_disk(ticket_id, text)
