import json
import uuid
import csv
from datetime import datetime, timezone
from pathlib import Path
from io import StringIO


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


DEFAULT_CONSENT = {
    "marketing_emails": False,
    "product_updates": True,
    "usage_analytics": True,
    "experimental_features": False
}


class GDPRService:
    def __init__(self, supabase_client=None):
        self.supabase = supabase_client
        self.state_path = Path(__file__).resolve().parent.parent / "data" / "privacy_state.json"

    def _read_state(self):
        if not self.state_path.exists():
            return {}
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def _write_state(self, state):
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    def get_consent(self, user_id: str):
        if self.supabase:
            try:
                res = self.supabase.table("consent_log").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
                if res.data and len(res.data) > 0:
                    latest = res.data[0]
                    return {
                        "consent": json.loads(latest.get("consent_json", "{}")),
                        "updated_at": latest.get("created_at"),
                        "user_id": latest.get("user_id")
                    }
            except Exception as e:
                print(f"[GDPR] Supabase consent fetch failed: {e}")
        state = self._read_state()
        user_consent = state.get(f"consent_{user_id}", {})
        return {
            "consent": user_consent.get("consent", DEFAULT_CONSENT),
            "updated_at": user_consent.get("updated_at"),
            "user_id": user_id
        }

    def update_consent(self, user_id: str, consent: dict, actor: str = "user"):
        normalized_consent = {**DEFAULT_CONSENT, **consent}
        timestamp = utc_now_iso()
        log_entry = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "consent_json": json.dumps(normalized_consent),
            "actor": actor,
            "created_at": timestamp
        }
        if self.supabase:
            try:
                self.supabase.table("consent_log").insert(log_entry).execute()
            except Exception as e:
                print(f"[GDPR] Supabase consent log failed: {e}")
        state = self._read_state()
        state[f"consent_{user_id}"] = {
            "consent": normalized_consent,
            "updated_at": timestamp,
            "user_id": user_id
        }
        self._write_state(state)
        return {"success": True, "consent": normalized_consent, "updated_at": timestamp}

    def export_data(self, user_id: str, format: str = "json"):
        user_data = {
            "profile": {},
            "tickets": [],
            "consent_history": [],
            "privacy_requests": []
        }
        if self.supabase:
            try:
                profile_res = self.supabase.table("profiles").select("*").eq("id", user_id).single().execute()
                if profile_res.data:
                    user_data["profile"] = profile_res.data
                tickets_res = self.supabase.table("tickets").select("*").eq("user_id", user_id).execute()
                if tickets_res.data:
                    user_data["tickets"] = tickets_res.data
                consent_res = self.supabase.table("consent_log").select("*").eq("user_id", user_id).execute()
                if consent_res.data:
                    user_data["consent_history"] = consent_res.data
            except Exception as e:
                print(f"[GDPR] Supabase export fetch failed: {e}")
        state = self._read_state()
        if not user_data["profile"] and state.get(f"profile_{user_id}"):
            user_data["profile"] = state[f"profile_{user_id}"]
        if not user_data["tickets"] and state.get(f"tickets_{user_id}"):
            user_data["tickets"] = state[f"tickets_{user_id}"]
        if format == "json":
            return json.dumps(user_data, indent=2)
        elif format == "csv":
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(["Section", "Key", "Value"])
            for key, value in user_data["profile"].items():
                writer.writerow(["Profile", key, str(value)])
            for ticket in user_data["tickets"]:
                for k, v in ticket.items():
                    writer.writerow([f"Ticket {ticket.get('id', 'N/A')}", k, str(v)])
            return output.getvalue()
        else:
            return json.dumps(user_data, indent=2)

    def request_deletion(self, user_id: str, reason: str = ""):
        timestamp = utc_now_iso()
        request_id = str(uuid.uuid4())
        request = {
            "id": request_id,
            "user_id": user_id,
            "type": "deletion",
            "reason": reason,
            "status": "pending",
            "requested_at": timestamp,
            "scheduled_at": None
        }
        if self.supabase:
            try:
                self.supabase.table("privacy_requests").insert(request).execute()
            except Exception as e:
                print(f"[GDPR] Supabase deletion request failed: {e}")
        state = self._read_state()
        if f"requests_{user_id}" not in state:
            state[f"requests_{user_id}"] = []
        state[f"requests_{user_id}"].append(request)
        self._write_state(state)
        return request

    def get_privacy_requests(self, user_id: str):
        requests = []
        if self.supabase:
            try:
                res = self.supabase.table("privacy_requests").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
                if res.data:
                    requests = res.data
            except Exception as e:
                print(f"[GDPR] Supabase requests fetch failed: {e}")
        if not requests:
            state = self._read_state()
            requests = state.get(f"requests_{user_id}", [])
        return requests

