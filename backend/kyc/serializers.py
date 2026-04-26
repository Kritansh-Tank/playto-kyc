from rest_framework import serializers
from kyc.models import Document, KYCSubmission, NotificationEvent, User
from kyc.state_machine import LEGAL_TRANSITIONS, STATE_LABELS


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["email", "full_name", "password"]

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data.get("full_name", ""),
            role="merchant",
        )


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "created_at"]


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = [
            "id",
            "doc_type",
            "original_filename",
            "file_size",
            "mime_type",
            "uploaded_at",
            "file",
        ]
        read_only_fields = ["original_filename", "file_size", "mime_type", "uploaded_at"]


class KYCSubmissionSerializer(serializers.ModelSerializer):
    documents = DocumentSerializer(many=True, read_only=True)
    merchant_email = serializers.EmailField(source="merchant.email", read_only=True)
    sla_status = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    state_label = serializers.SerializerMethodField()

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "merchant_email",
            "state",
            "state_label",
            "sla_status",
            "allowed_transitions",
            # Personal
            "full_name",
            "email",
            "phone",
            # Business
            "business_name",
            "business_type",
            "expected_monthly_volume",
            # Reviewer fields
            "reviewer_note",
            # Timestamps
            "created_at",
            "updated_at",
            "submitted_at",
            "reviewed_at",
            # Documents
            "documents",
        ]
        read_only_fields = [
            "state",
            "merchant_email",
            "sla_status",
            "allowed_transitions",
            "state_label",
            "created_at",
            "updated_at",
            "submitted_at",
            "reviewed_at",
        ]

    def get_sla_status(self, obj):
        return "at_risk" if obj.is_sla_at_risk else "ok"

    def get_allowed_transitions(self, obj):
        return LEGAL_TRANSITIONS.get(obj.state, [])

    def get_state_label(self, obj):
        return STATE_LABELS.get(obj.state, obj.state)


class KYCSubmissionUpdateSerializer(serializers.ModelSerializer):
    """Used by merchant to update their draft."""

    class Meta:
        model = KYCSubmission
        fields = [
            "full_name",
            "email",
            "phone",
            "business_name",
            "business_type",
            "expected_monthly_volume",
        ]


class TransitionSerializer(serializers.Serializer):
    new_state = serializers.ChoiceField(
        choices=[
            "submitted",
            "under_review",
            "approved",
            "rejected",
            "more_info_requested",
        ]
    )
    note = serializers.CharField(required=False, allow_blank=True, default="")


class NotificationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationEvent
        fields = ["id", "event_type", "payload", "timestamp"]


class DashboardMetricsSerializer(serializers.Serializer):
    submissions_in_queue = serializers.IntegerField()
    at_risk_count = serializers.IntegerField()
    average_time_in_queue_hours = serializers.FloatField(allow_null=True)
    approval_rate_7d = serializers.FloatField(allow_null=True)
    total_approved_7d = serializers.IntegerField()
    total_decided_7d = serializers.IntegerField()
