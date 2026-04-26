# EXPLAINER.md — Playto KYC Pipeline

---

## 1. The State Machine

**Where it lives:** [`backend/kyc/state_machine.py`](backend/kyc/state_machine.py) — one file, one dict, one function.

```python
# backend/kyc/state_machine.py

LEGAL_TRANSITIONS = {
    "draft":                ["submitted"],
    "submitted":            ["under_review"],
    "under_review":         ["approved", "rejected", "more_info_requested"],
    "more_info_requested":  ["submitted"],
}

def transition_submission(submission, new_state: str, actor=None, note: str = "") -> None:
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
    # ... stamp timestamps, save, log notification
```

**How illegal transitions are prevented:** `transition_submission()` is the only entry point for any state change. Every view that changes state calls this function. The function looks up the current state in `LEGAL_TRANSITIONS` and raises a `ValidationError` (→ HTTP 400) if the target isn't in the list. There's no `if state == X: do thing` logic scattered in views. Terminal states (`approved`, `rejected`) have no entry in `LEGAL_TRANSITIONS`, so `get_allowed_transitions()` returns `[]` and any transition out of them is rejected.

---

## 2. The Upload

**Validation code:** [`backend/kyc/validators.py`](backend/kyc/validators.py)

```python
import filetype

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

ALLOWED_MIMES = {"application/pdf", "image/jpeg", "image/png"}

def validate_kyc_document(file) -> str:
    # 1. Size check (cheap — before reading bytes)
    if file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise ValidationError({
            "error": f"File '{file.name}' is {size_mb:.1f} MB. Maximum allowed size is 5 MB.",
            "code": "file_too_large",
        })

    # 2. Read first 261 bytes to sniff real MIME type
    chunk = file.read(261)
    file.seek(0)  # rewind so Django can still save it

    kind = filetype.guess(chunk)
    if kind is None:
        raise ValidationError({"error": "Could not determine file type.", "code": "unknown_file_type"})

    if kind.mime not in ALLOWED_MIMES:
        raise ValidationError({"error": f"File type '{kind.mime}' is not accepted.", "code": "invalid_file_type"})

    return kind.mime
```

**What happens with a 50 MB file:** The size check fires first (`file.size > MAX_FILE_SIZE`). Django reads `file.size` from the multipart headers before processing the body, so this check is cheap. The response is: `{"error": "File '...' is 50.0 MB. Maximum allowed size is 5 MB.", "code": "file_too_large"}` with HTTP 400. The file bytes are never saved to disk.

**Why `filetype` instead of checking Content-Type or file extension:** A client can trivially send `Content-Type: image/jpeg` with a PHP shell inside. `filetype` reads the actual magic bytes of the file — the byte signatures that file formats use to identify themselves — which can't be faked without corrupting the file.

**Where files are stored:** Django's `FileField` writes validated files to `backend/media/kyc_documents/YYYY/MM/` on the local filesystem (`MEDIA_ROOT = BASE_DIR / "media"`). The path, original filename, file size, and detected MIME type are all stored in the `Document` model row — the DB holds metadata, the filesystem holds the bytes. For the challenge this is fine. In production on Render (ephemeral filesystem), the correct upgrade is one settings change using `django-storages` + an S3-compatible bucket (e.g. Cloudflare R2): `DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"`. No view or validator code changes required.

---

## 3. The Queue

**Query powering the reviewer queue** (in `ReviewerQueueView`):

```python
queue_states = ["submitted", "under_review", "more_info_requested"]
submissions = KYCSubmission.objects.filter(state__in=queue_states).order_by("submitted_at")
```

**Why this query:** Queue items are all submissions that are actively awaiting reviewer action. `draft` is excluded (merchant hasn't finished yet). `approved` and `rejected` are excluded (terminal states, done). `order_by("submitted_at")` puts oldest-first — FIFO processing prevents starvation of early submissions.

**The SLA flag is computed dynamically, never stored:**

```python
# In KYCSubmission.is_sla_at_risk (property on the model)
@property
def is_sla_at_risk(self):
    if self.state in ("submitted", "under_review") and self.submitted_at:
        delta = timezone.now() - self.submitted_at
        return delta.total_seconds() > 86400
    return False
```

And in the serializer:
```python
def get_sla_status(self, obj):
    return "at_risk" if obj.is_sla_at_risk else "ok"
```

**Why not store it:** A stored boolean flag goes stale. The moment you write `sla_at_risk = True` you need a cron job to set it. A computed property is always accurate. The downside is N queries on the Python side (one per submission) — acceptable for an internal dashboard. If this list scaled to thousands, I'd add a database index on `submitted_at` and push the comparison into a Django `ExpressionWrapper` annotation.

**Average time metric:**

```python
total_seconds = sum(
    (now - s.submitted_at).total_seconds()
    for s in queue_qs if s.submitted_at
)
avg_hours = round(total_seconds / in_queue_count / 3600, 2)
```

Simple and accurate. Django's `Avg` aggregate doesn't natively subtract datetimes from `now()` in SQLite in a portable way, so I computed it in Python.

---

## 4. The Auth

**How Merchant A is stopped from seeing Merchant B's submission:**

The merchant's KYC endpoint scopes the queryset to the requesting user:

```python
# In MerchantKYCView
def _get_submission(self, user):
    sub, _ = KYCSubmission.objects.get_or_create(merchant=user)
    return sub
```

There's no `?id=` parameter for the merchant. The only KYC a merchant can ever retrieve or modify is `merchant=request.user` — their own. There's no endpoint where a merchant can supply an arbitrary KYC ID. The reviewer endpoints (`/reviewer/submissions/:id/`) are guarded by `IsReviewer`:

```python
# In permissions.py
class IsReviewer(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "reviewer"
        )
```

So even if a merchant discovered the reviewer URL and tried to call it with their token, they'd get a 403.

The `role` field is set server-side at registration (`role="merchant"` always). There's no API endpoint that lets a merchant promote themselves to reviewer.

---

## 5. The AI Audit

**What the AI generated:**

When I asked Claude to write the dashboard metrics view, it generated this for the average time calculation using Django ORM:

```python
# AI-generated — BUGGY
from django.db.models import Avg, DurationField, ExpressionWrapper, F

avg_duration = KYCSubmission.objects.filter(
    state__in=queue_states
).annotate(
    time_in_queue=ExpressionWrapper(
        timezone.now() - F('submitted_at'),
        output_field=DurationField()
    )
).aggregate(avg=Avg('time_in_queue'))['avg']
```

**What was wrong:** `timezone.now()` is a Python datetime, not a Django database expression. SQLite doesn't support subtracting a Python datetime from a `DateTimeField` via `F()` expressions inside `ExpressionWrapper` — it would throw `django.db.utils.OperationalError: near "-": syntax error` at runtime. This works on PostgreSQL but not SQLite. Since the spec said SQLite is acceptable and the code would silently fail only in production, this is a real bug.

**What I replaced it with:**

```python
# My fix — computed in Python, works on any database
total_seconds = sum(
    (now - s.submitted_at).total_seconds()
    for s in queue_qs
    if s.submitted_at
)
avg_hours = round(total_seconds / in_queue_count / 3600, 2) if total_seconds else None
```

Python-level computation avoids database dialect issues entirely. The queryset is already fetched for the `in_queue_count` and `at_risk_count` calculations, so there's no extra database hit. At the scale of an internal reviewer dashboard this is completely fine.
