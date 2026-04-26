"""
Seed script — creates test users and KYC submissions.

Usage:
    python manage.py shell < seed.py
  OR (preferred):
    python seed.py   (if run from the backend/ directory with Django configured)
"""
import os
import sys
import django
from datetime import timedelta

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.utils import timezone
from rest_framework.authtoken.models import Token

from kyc.models import Document, KYCSubmission, NotificationEvent, User
from kyc.state_machine import transition_submission


def create_or_get(email, password, role, full_name):
    user, created = User.objects.get_or_create(
        email=email,
        defaults={"full_name": full_name, "role": role},
    )
    if created:
        user.set_password(password)
        user.save()
        print(f"  Created {role}: {email}")
    else:
        print(f"  Already exists: {email}")
    token, _ = Token.objects.get_or_create(user=user)
    return user, token


print("\n=== Playto KYC Seed Script ===\n")

# ── Merchant 1: draft state ──────────────────────────────
print("[1] Merchant in DRAFT state")
m1, t1 = create_or_get(
    email="merchant_draft@playto.test",
    password="pass1234",
    role="merchant",
    full_name="Arjun Sharma",
)
sub1, _ = KYCSubmission.objects.get_or_create(merchant=m1)
sub1.full_name = "Arjun Sharma"
sub1.email = "merchant_draft@playto.test"
sub1.phone = "+91-9876543210"
sub1.business_name = "Sharma Digital Agency"
sub1.business_type = "agency"
sub1.expected_monthly_volume = 5000.00
sub1.state = "draft"
sub1.save()
print(f"   Token: {t1.key}")
print(f"   State: {sub1.state}\n")

# ── Merchant 2: under_review, submitted 30 hours ago (SLA at_risk) ──
print("[2] Merchant in UNDER_REVIEW state (SLA at_risk — submitted 30h ago)")
m2, t2 = create_or_get(
    email="merchant_review@playto.test",
    password="pass1234",
    role="merchant",
    full_name="Priya Nair",
)
sub2, _ = KYCSubmission.objects.get_or_create(merchant=m2)
sub2.full_name = "Priya Nair"
sub2.email = "merchant_review@playto.test"
sub2.phone = "+91-9988776655"
sub2.business_name = "Nair Freelance Studio"
sub2.business_type = "freelancer"
sub2.expected_monthly_volume = 2500.00
sub2.state = "under_review"
# Backdate submitted_at so SLA flag triggers
sub2.submitted_at = timezone.now() - timedelta(hours=30)
sub2.save()
print(f"   Token: {t2.key}")
print(f"   State: {sub2.state}")
print(f"   SLA at_risk: {sub2.is_sla_at_risk}\n")

# ── Reviewer ────────────────────────────────────────────
print("[3] Reviewer account")
rev, t3 = create_or_get(
    email="reviewer@playto.test",
    password="pass1234",
    role="reviewer",
    full_name="Rahul Verma",
)
print(f"   Token: {t3.key}\n")

# ── Log a sample notification event ─────────────────────
NotificationEvent.objects.get_or_create(
    merchant=m2,
    event_type="kyc_under_review",
    defaults={
        "payload": {
            "submission_id": sub2.id,
            "old_state": "submitted",
            "new_state": "under_review",
            "note": "Auto-assigned by seed script",
            "actor_id": None,
        }
    },
)

print("=== Seed complete! ===")
print("\nLogin credentials:")
print("  Merchant (draft):        merchant_draft@playto.test  /  pass1234")
print("  Merchant (under_review): merchant_review@playto.test / pass1234")
print("  Reviewer:                reviewer@playto.test         / pass1234")
print("\nTokens are printed above. Use them in Authorization: Token <token> header.\n")
