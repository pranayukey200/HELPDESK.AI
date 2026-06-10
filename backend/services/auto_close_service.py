"""
Auto-Close Service: Scheduled background job to automatically close resolved tickets
after a company-configured inactivity period.

Features:
- Configurable per-company auto-close settings
- Respects company-specific auto_close_days setting (default: 7 days)
- Only processes tickets in "resolved" status
- Tracks auto-closed tickets separately for auditing
- Full logging and error handling
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, List

from supabase import create_client
from dotenv import load_dotenv

from backend.services import notification_routing

load_dotenv()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler()
formatter = logging.Formatter("[AutoCloseService] %(asctime)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)


class AutoCloseService:
    """Background service for automatically closing resolved tickets."""

    def __init__(self):
        """Initialize the auto-close service with Supabase client."""
        self.supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
        self.enabled = os.getenv("AUTO_CLOSE_ENABLED", "true").lower() == "true"
        self.default_auto_close_days = int(os.getenv("AUTO_CLOSE_DAYS", "7"))
        self.default_warning_before_close_hours = int(os.getenv("WARNING_BEFORE_CLOSE_HOURS", "24"))
        self.cron_schedule = os.getenv("AUTO_CLOSE_CRON_SCHEDULE", "0 2 * * *")  # 2 AM UTC daily

    def get_system_settings(self, company_id: str) -> Dict:
        """
        Fetch company's auto-close settings from database.
        
        Args:
            company_id: UUID of the company
            
        Returns:
            Dict with auto_close_days, auto_close_enabled, and warning_before_close_hours settings.
            Falls back to defaults if system_settings not found.
        """
        try:
            response = self.supabase.table("system_settings").select(
                "auto_close_days, auto_close_enabled, warning_before_close_hours"
            ).eq("company_id", company_id).single().execute()
            
            if response.data:
                return {
                    "auto_close_days": response.data.get("auto_close_days", self.default_auto_close_days),
                    "auto_close_enabled": response.data.get("auto_close_enabled", True),
                    "warning_before_close_hours": response.data.get("warning_before_close_hours", self.default_warning_before_close_hours)
                }
        except Exception as e:
            logger.warning(f"Could not fetch settings for company {company_id}: {str(e)}. Using defaults.")
        
        # Fall back to defaults
        return {
            "auto_close_days": self.default_auto_close_days,
            "auto_close_enabled": True,
            "warning_before_close_hours": self.default_warning_before_close_hours
        }

# NOTE: Method renamed to `get_system_settings` to match schema; underlying DB table is `system_settings`.

    def _close_ticket(self, ticket_id: str, company_id: str, stats: Dict) -> bool:
        """
        Update a ticket's status to closed and set auto_closed flag.
        
        Args:
            ticket_id: UUID of ticket to close
            company_id: UUID of ticket's company
            stats: Statistics dict to track success/failure
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.supabase.table("tickets").update({
                "status": "closed",
                "auto_closed": True,
                "closed_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", ticket_id).eq("company_id", company_id).execute()
            
            stats["closed_count"] += 1
            logger.info(f"Closed ticket {ticket_id} for company {company_id}")
            return True
        except Exception as e:
            stats["error_count"] += 1
            logger.error(f"Failed to close ticket {ticket_id}: {str(e)}")
            return False

    def _send_pre_closure_notification(self, ticket_id: str, company_id: str, warning_hours: int, stats: Dict) -> bool:
        """
        Send pre-closure notification to ticket requester and mark notification as sent.
        
        Args:
            ticket_id: UUID of ticket
            company_id: UUID of company
            warning_hours: Hours until auto-close
            stats: Statistics dict
            
        Returns:
            True if notification sent, False otherwise
        """
        try:
            # Check if notifications are enabled for this company
            routing = notification_routing.get_instance()
            if not routing:
                routing = notification_routing.load()
            if not routing.should_send_email_notification(company_id, notification_routing.NotificationType.PRE_CLOSURE_WARNING):
                logger.info(f"Pre-closure notification skipped for ticket {ticket_id}: notifications disabled")
                stats["skipped_count"] += 1
                return False

            # First, fetch ticket details to get requester
            ticket = self.supabase.table("tickets").select("id, title, user_id, user_email").eq("id", ticket_id).eq("company_id", company_id).single().execute()
            if not ticket.data:
                logger.warning(f"Ticket {ticket_id} not found, cannot send notification")
                stats["error_count"] +=1
                return False

            ticket_data = ticket.data

            # Now, create notification record (assuming there's a notifications table; if not, log it)
            try:
                self.supabase.table("notifications").insert({
                    "ticket_id": ticket_id,
                    "company_id": company_id,
                    "user_id": ticket_data.get("user_id"),
                    "type": "pre_closure_warning",
                    "title": "Your ticket is about to be closed",
                    "message": f"Your ticket \"{ticket_data.get('title', 'Untitled')}\" will be automatically closed in {warning_hours} hours if no action is taken. Please reply if you still need assistance.",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }).execute()
            except Exception as e:
                logger.warning(f"Could not insert into notifications table: {e}. Continuing with just marking the ticket.")

            # Mark ticket as having had pre-closure notification sent
            self.supabase.table("tickets").update({
                "pre_closure_notification_sent": True,
                "pre_closure_notification_sent_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", ticket_id).eq("company_id", company_id).execute()

            stats["notifications_sent_count"] +=1
            logger.info(f"Sent pre-closure notification for ticket {ticket_id}")
            return True
        except Exception as e:
            stats["error_count"] +=1
            logger.error(f"Failed to send pre-closure notification for ticket {ticket_id}: {str(e)}")
            return False

    def run(self) -> Dict:
        """
        Execute the auto-close job.
        
        Process:
        1. Fetch all resolved tickets
        2. Group by company_id
        3. For each company, check auto-close settings
        4. Send pre-closure warnings for tickets in warning window
        5. Close tickets older than auto_close_days
        6. Log results and return statistics
        
        Returns:
            Dict with statistics on processed/closed/error tickets
        """
        if not self.enabled:
            logger.info("Auto-close service is disabled.")
            return {"status": "disabled"}

        stats = {
            "processed_count": 0,
            "closed_count": 0,
            "error_count": 0,
            "skipped_count": 0,
            "notifications_sent_count": 0
        }

        try:
            logger.info("Starting auto-close job...")

            # Fetch all resolved tickets
            response = self.supabase.table("tickets").select(
                "id, company_id, status, updated_at, pre_closure_notification_sent"
            ).eq("status", "resolved").execute()

            resolved_tickets = response.data if response.data else []
            stats["processed_count"] = len(resolved_tickets)
            logger.info(f"Found {len(resolved_tickets)} resolved tickets")

            # Group by company
            company_tickets: Dict[str, List] = {}
            for ticket in resolved_tickets:
                company_id = ticket.get("company_id")
                if company_id not in company_tickets:
                    company_tickets[company_id] = []
                company_tickets[company_id].append(ticket)

            # Process each company's tickets
            for company_id, tickets in company_tickets.items():
                try:
                    settings = self.get_system_settings(company_id)

                    if not settings["auto_close_enabled"]:
                        logger.info(f"Auto-close disabled for company {company_id}, skipping {len(tickets)} tickets")
                        stats["skipped_count"] += len(tickets)
                        continue

                    auto_close_days = settings["auto_close_days"]
                    warning_hours = settings["warning_before_close_hours"]
                    
                    now = datetime.now(timezone.utc)
                    cutoff_date = now - timedelta(days=auto_close_days)
                    warning_start_date = now - timedelta(days=auto_close_days) + timedelta(hours=warning_hours)

                    # Process each ticket
                    for ticket in tickets:
                        try:
                            updated_at_str = ticket.get("updated_at")
                            if not updated_at_str:
                                logger.warning(f"Ticket {ticket['id']} missing updated_at, skipping")
                                stats["skipped_count"] += 1
                                continue

                            # Parse ISO format timestamp
                            updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))

                            # First check if ticket should be closed
                            if updated_at < cutoff_date:
                                self._close_ticket(ticket["id"], company_id, stats)
                            # Check if ticket is in warning window and hasn't had notification sent yet
                            elif updated_at < warning_start_date and not ticket.get("pre_closure_notification_sent", False):
                                self._send_pre_closure_notification(ticket["id"], company_id, warning_hours, stats)
                            else:
                                stats["skipped_count"] += 1

                        except ValueError as e:
                            logger.error(f"Invalid timestamp for ticket {ticket['id']}: {str(e)}")
                            stats["error_count"] += 1

                except Exception as e:
                    logger.error(f"Error processing company {company_id}: {str(e)}")
                    stats["error_count"] += len(tickets)

            logger.info(
                f"Auto-close job completed. Closed: {stats['closed_count']}, "
                f"Notifications: {stats['notifications_sent_count']}, "
                f"Skipped: {stats['skipped_count']}, Errors: {stats['error_count']}"
            )
            return stats

        except Exception as e:
            logger.error(f"Fatal error in auto-close job: {str(e)}")
            stats["error_count"] += 1
            return stats

    def test_query(self) -> List:
        """
        Debug utility: show resolved tickets that would be affected without making changes.
        
        Returns:
            List of resolved tickets with company info
        """
        try:
            response = self.supabase.table("tickets").select(
                "id, company_id, status, updated_at, title"
            ).eq("status", "resolved").limit(10).execute()

            tickets = response.data if response.data else []
            logger.info(f"Found {len(tickets)} resolved tickets (sample)")
            return tickets

        except Exception as e:
            logger.error(f"Error in test_query: {str(e)}")
            return []


# Singleton instance
_instance: Optional[AutoCloseService] = None


def load():
    """Load and return singleton instance of AutoCloseService."""
    global _instance
    if _instance is None:
        _instance = AutoCloseService()
        logger.info(f"AutoCloseService loaded. Schedule: {_instance.cron_schedule}")
    return _instance


def get_instance() -> Optional[AutoCloseService]:
    """Get the singleton instance if already loaded."""
    return _instance
