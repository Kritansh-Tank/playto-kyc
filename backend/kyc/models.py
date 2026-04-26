from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, role="merchant", **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, role=role, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", "reviewer")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [("merchant", "Merchant"), ("reviewer", "Reviewer")]

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="merchant")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.email} ({self.role})"


class KYCSubmission(models.Model):
    STATE_CHOICES = [
        ("draft", "Draft"),
        ("submitted", "Submitted"),
        ("under_review", "Under Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("more_info_requested", "More Info Requested"),
    ]

    BUSINESS_TYPE_CHOICES = [
        ("freelancer", "Freelancer"),
        ("agency", "Agency"),
        ("ecommerce", "E-Commerce"),
        ("saas", "SaaS"),
        ("other", "Other"),
    ]

    merchant = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="kyc_submission"
    )
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default="draft")

    # Personal details
    full_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)

    # Business details
    business_name = models.CharField(max_length=255, blank=True)
    business_type = models.CharField(
        max_length=50, choices=BUSINESS_TYPE_CHOICES, blank=True
    )
    expected_monthly_volume = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    # Reviewer fields
    reviewer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_submissions",
        limit_choices_to={"role": "reviewer"},
    )
    reviewer_note = models.TextField(blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"KYC({self.merchant.email}) - {self.state}"

    @property
    def is_sla_at_risk(self):
        """Dynamically computed — never stored. True if waiting >24h after submission."""
        if self.state in ("submitted", "under_review") and self.submitted_at:
            delta = timezone.now() - self.submitted_at
            return delta.total_seconds() > 86400
        return False

    class Meta:
        ordering = ["submitted_at", "created_at"]


class Document(models.Model):
    DOC_TYPE_CHOICES = [
        ("pan", "PAN Card"),
        ("aadhaar", "Aadhaar Card"),
        ("bank_statement", "Bank Statement"),
    ]

    submission = models.ForeignKey(
        KYCSubmission, on_delete=models.CASCADE, related_name="documents"
    )
    doc_type = models.CharField(max_length=30, choices=DOC_TYPE_CHOICES)
    file = models.FileField(upload_to="kyc_documents/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    mime_type = models.CharField(max_length=100)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.doc_type} for {self.submission}"

    class Meta:
        unique_together = ("submission", "doc_type")


class NotificationEvent(models.Model):
    merchant = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notification_events"
    )
    event_type = models.CharField(max_length=50)
    payload = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.event_type} for {self.merchant.email} at {self.timestamp}"

    class Meta:
        ordering = ["-timestamp"]
