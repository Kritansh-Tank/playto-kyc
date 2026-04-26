"""
State machine for KYC submissions.
This is the single source of truth for all legal state transitions.
"""
from django.utils import timezone
from rest_framework.exceptions import ValidationError


# All legal transitions. Anything not listed here is forbidden.
LEGAL_TRANSITIONS = {
    "draft": ["submitted"],
    "submitted": ["under_review"],
    "under_review": ["approved", "rejected", "more_info_requested"],
    "more_info_requested": ["submitted"],
}

# Human-readable state labels for notification payloads
STATE_LABELS = {
    "draft": "Draft",
    "submitted": "Submitted for Review",
    "under_review": "Under Review",
    "approved": "Approved",
    "rejected": "Rejected",
    "more_info_requested": "More Information Requested",
}

# Map new state -> event type for notifications
STATE_EVENT_MAP = {
    "submitted": "kyc_submitted",
    "under_review": "kyc_under_review",
    "approved": "kyc_approved",
    "rejected": "kyc_rejected",
    "more_info_requested": "kyc_more_info_requested",
}


def get_allowed_transitions(current_state: str) -> list:
    """Return the list of states reachable from current_state."""
    return LEGAL_TRANSITIONS.get(current_state, [])


def transition_submission(submission, new_state: str, actor=None, note: str = "") -> None:
    """
    Attempt to transition a KYCSubmission to new_state.
    Raises ValidationError for illegal transitions.
    Logs a NotificationEvent on success.
    """
    # Avoid circular import — import inside function
    from kyc.models import NotificationEvent

    allowed = get_allowed_transitions(submission.state)
    if new_state not in allowed:
        raise ValidationError(
            {
                "error": (
                    f"Cannot transition from '{submission.state}' to '{new_state}'. "
                    f"Allowed transitions: {allowed or 'none'}."
                ),
                "code": "illegal_transition",
            }
        )

    old_state = submission.state
    submission.state = new_state

    # Stamp timestamps on key transitions
    if new_state == "submitted":
        submission.submitted_at = timezone.now()
    if new_state in ("approved", "rejected"):
        submission.reviewed_at = timezone.now()
        if actor:
            submission.reviewer = actor

    if note:
        submission.reviewer_note = note

    submission.save()

    # Log notification event
    event_type = STATE_EVENT_MAP.get(new_state, f"kyc_{new_state}")
    NotificationEvent.objects.create(
        merchant=submission.merchant,
        event_type=event_type,
        payload={
            "submission_id": submission.id,
            "old_state": old_state,
            "new_state": new_state,
            "note": note,
            "actor_id": actor.id if actor else None,
            "actor_email": actor.email if actor else None,
        },
    )
