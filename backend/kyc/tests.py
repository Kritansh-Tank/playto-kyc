"""
Tests for the KYC state machine.
Run with: python manage.py test kyc.tests
"""
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from kyc.models import KYCSubmission, User
from kyc.state_machine import transition_submission, LEGAL_TRANSITIONS
from rest_framework.exceptions import ValidationError


class StateMachineUnitTests(TestCase):
    """Unit tests for the state machine logic (no HTTP layer)."""

    def setUp(self):
        self.merchant = User.objects.create_user(
            email="merchant@test.com", password="pass1234", role="merchant"
        )
        self.reviewer = User.objects.create_user(
            email="reviewer@test.com", password="pass1234", role="reviewer"
        )
        self.submission = KYCSubmission.objects.create(merchant=self.merchant)

    def test_legal_transition_draft_to_submitted(self):
        """draft → submitted is legal."""
        transition_submission(self.submission, "submitted")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "submitted")

    def test_illegal_transition_approved_to_draft(self):
        """approved → draft must raise ValidationError."""
        self.submission.state = "approved"
        self.submission.save()
        with self.assertRaises(ValidationError) as ctx:
            transition_submission(self.submission, "draft")
        self.assertIn("illegal_transition", str(ctx.exception.detail))

    def test_illegal_transition_draft_to_approved(self):
        """draft → approved must raise ValidationError (must go through submitted → under_review first)."""
        with self.assertRaises(ValidationError):
            transition_submission(self.submission, "approved")

    def test_illegal_transition_submitted_to_rejected(self):
        """submitted → rejected is illegal. Must go through under_review first."""
        transition_submission(self.submission, "submitted")
        self.submission.refresh_from_db()
        with self.assertRaises(ValidationError):
            transition_submission(self.submission, "rejected")

    def test_legal_full_happy_path(self):
        """draft → submitted → under_review → approved"""
        transition_submission(self.submission, "submitted")
        self.submission.refresh_from_db()
        transition_submission(self.submission, "under_review", actor=self.reviewer)
        self.submission.refresh_from_db()
        transition_submission(self.submission, "approved", actor=self.reviewer)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "approved")
        self.assertIsNotNone(self.submission.reviewed_at)

    def test_more_info_loop(self):
        """under_review → more_info_requested → submitted."""
        self.submission.state = "under_review"
        self.submission.save()
        transition_submission(self.submission, "more_info_requested", actor=self.reviewer)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "more_info_requested")
        transition_submission(self.submission, "submitted")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "submitted")

    def test_notification_event_created_on_transition(self):
        """A NotificationEvent must be logged for every transition."""
        from kyc.models import NotificationEvent
        count_before = NotificationEvent.objects.count()
        transition_submission(self.submission, "submitted")
        self.assertEqual(NotificationEvent.objects.count(), count_before + 1)

    def test_all_legal_transitions_defined(self):
        """Sanity check that LEGAL_TRANSITIONS covers all states."""
        all_states = {"draft", "submitted", "under_review", "approved", "rejected", "more_info_requested"}
        states_with_outgoing = set(LEGAL_TRANSITIONS.keys())
        # approved and rejected are terminal — they have no outgoing transitions
        self.assertTrue(states_with_outgoing.issubset(all_states))


class APIIllegalTransitionTests(TestCase):
    """API-level tests for illegal transition enforcement."""

    def setUp(self):
        self.merchant = User.objects.create_user(
            email="m@test.com", password="pass1234", role="merchant"
        )
        self.reviewer = User.objects.create_user(
            email="r@test.com", password="pass1234", role="reviewer"
        )
        self.submission = KYCSubmission.objects.create(merchant=self.merchant, state="approved")
        self.reviewer_token, _ = Token.objects.get_or_create(user=self.reviewer)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.reviewer_token.key}")

    def test_api_rejects_illegal_transition_with_400(self):
        """POST /api/v1/reviewer/submissions/:id/transition/ with illegal transition returns 400.
        
        The submission is in 'approved' state. Attempting to move it to 'submitted'
        is a valid serializer choice but an illegal state machine transition.
        The state machine should reject it with a 400 and an 'illegal_transition' error code.
        """
        resp = self.client.post(
            f"/api/v1/reviewer/submissions/{self.submission.id}/transition/",
            {"new_state": "submitted"},  # valid choice, but illegal from 'approved'
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.data)
        self.assertIn("illegal_transition", str(resp.data))

    def test_merchant_cannot_see_other_merchant_submission(self):
        """Merchant A must not be able to reach Merchant B's submission via /kyc/me/."""
        merchant_b = User.objects.create_user(
            email="b@test.com", password="pass1234", role="merchant"
        )
        KYCSubmission.objects.create(merchant=merchant_b)

        token_a, _ = Token.objects.get_or_create(user=self.merchant)
        client_a = APIClient()
        client_a.credentials(HTTP_AUTHORIZATION=f"Token {token_a.key}")

        # merchant A's /kyc/me/ always returns THEIR submission (isolation enforced)
        resp = client_a.get("/api/v1/kyc/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["merchant_email"], self.merchant.email)
