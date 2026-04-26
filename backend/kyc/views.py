from datetime import timedelta

from django.db.models import Avg, ExpressionWrapper, F, FloatField, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from kyc.models import Document, KYCSubmission, User
from kyc.permissions import IsMerchant, IsReviewer
from kyc.serializers import (
    DashboardMetricsSerializer,
    DocumentSerializer,
    KYCSubmissionSerializer,
    KYCSubmissionUpdateSerializer,
    RegisterSerializer,
    TransitionSerializer,
    UserSerializer,
)
from kyc.state_machine import transition_submission
from kyc.validators import validate_kyc_document


# ──────────────────────────────────────────────────────────
# Auth views
# ──────────────────────────────────────────────────────────


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        # Create an empty KYC submission (draft) for the new merchant
        KYCSubmission.objects.get_or_create(merchant=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


# ──────────────────────────────────────────────────────────
# Merchant KYC views
# ──────────────────────────────────────────────────────────


class MerchantKYCView(APIView):
    permission_classes = [IsMerchant]

    def _get_submission(self, user):
        sub, _ = KYCSubmission.objects.get_or_create(merchant=user)
        return sub

    def get(self, request):
        sub = self._get_submission(request.user)
        return Response(KYCSubmissionSerializer(sub).data)

    def patch(self, request):
        sub = self._get_submission(request.user)
        if sub.state not in ("draft", "more_info_requested"):
            return Response(
                {
                    "error": "You can only edit your submission while it is in draft or more_info_requested state.",
                    "code": "edit_not_allowed",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = KYCSubmissionUpdateSerializer(sub, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(KYCSubmissionSerializer(sub).data)


class MerchantSubmitView(APIView):
    permission_classes = [IsMerchant]

    def post(self, request):
        sub, _ = KYCSubmission.objects.get_or_create(merchant=request.user)
        transition_submission(sub, "submitted", actor=request.user)
        return Response(KYCSubmissionSerializer(sub).data)


class MerchantDocumentUploadView(APIView):
    permission_classes = [IsMerchant]
    parser_classes = [MultiPartParser]

    def post(self, request):
        sub, _ = KYCSubmission.objects.get_or_create(merchant=request.user)
        if sub.state not in ("draft", "more_info_requested"):
            return Response(
                {
                    "error": "Documents can only be uploaded in draft or more_info_requested state.",
                    "code": "upload_not_allowed",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        doc_type = request.data.get("doc_type")
        file = request.FILES.get("file")

        if not doc_type:
            return Response(
                {"error": "doc_type is required.", "code": "missing_field"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not file:
            return Response(
                {"error": "file is required.", "code": "missing_field"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_types = [c[0] for c in Document.DOC_TYPE_CHOICES]
        if doc_type not in allowed_types:
            return Response(
                {
                    "error": f"doc_type must be one of: {allowed_types}",
                    "code": "invalid_doc_type",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Real MIME + size validation
        detected_mime = validate_kyc_document(file)

        doc, _ = Document.objects.update_or_create(
            submission=sub,
            doc_type=doc_type,
            defaults={
                "file": file,
                "original_filename": file.name,
                "file_size": file.size,
                "mime_type": detected_mime,
            },
        )
        return Response(DocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────────────────
# Reviewer views
# ──────────────────────────────────────────────────────────


class ReviewerQueueView(APIView):
    permission_classes = [IsReviewer]

    def get(self, request):
        """
        Returns all submissions ordered oldest-first.
        Excludes drafts — only show submitted/under_review/more_info_requested.
        """
        queue_states = ["submitted", "under_review", "more_info_requested"]
        submissions = KYCSubmission.objects.filter(state__in=queue_states).order_by(
            "submitted_at"
        )
        serializer = KYCSubmissionSerializer(submissions, many=True)
        return Response(serializer.data)


class ReviewerSubmissionDetailView(APIView):
    permission_classes = [IsReviewer]

    def get(self, request, pk):
        sub = get_object_or_404(KYCSubmission, pk=pk)
        return Response(KYCSubmissionSerializer(sub).data)


class ReviewerTransitionView(APIView):
    permission_classes = [IsReviewer]

    def post(self, request, pk):
        sub = get_object_or_404(KYCSubmission, pk=pk)
        serializer = TransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_state = serializer.validated_data["new_state"]
        note = serializer.validated_data.get("note", "")

        # Enforce that only reviewers can trigger reviewer-side transitions
        reviewer_transitions = ["under_review", "approved", "rejected", "more_info_requested"]
        if new_state in reviewer_transitions and request.user.role != "reviewer":
            return Response(
                {"error": "Only reviewers can perform this action.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        transition_submission(sub, new_state, actor=request.user, note=note)
        return Response(KYCSubmissionSerializer(sub).data)


class ReviewerDashboardView(APIView):
    permission_classes = [IsReviewer]

    def get(self, request):
        queue_states = ["submitted", "under_review", "more_info_requested"]
        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)

        queue_qs = KYCSubmission.objects.filter(state__in=queue_states)
        in_queue_count = queue_qs.count()

        # Dynamically compute how many are at_risk (>24h since submission)
        at_risk_count = sum(1 for s in queue_qs if s.is_sla_at_risk)

        # Average time in queue for currently queued items
        avg_hours = None
        if in_queue_count:
            total_seconds = sum(
                (now - s.submitted_at).total_seconds()
                for s in queue_qs
                if s.submitted_at
            )
            if total_seconds:
                avg_hours = round(total_seconds / in_queue_count / 3600, 2)

        # 7-day approval rate
        decided_qs = KYCSubmission.objects.filter(
            state__in=["approved", "rejected"],
            reviewed_at__gte=seven_days_ago,
        )
        total_decided = decided_qs.count()
        total_approved = decided_qs.filter(state="approved").count()
        approval_rate = (
            round((total_approved / total_decided) * 100, 1) if total_decided > 0 else None
        )

        data = {
            "submissions_in_queue": in_queue_count,
            "at_risk_count": at_risk_count,
            "average_time_in_queue_hours": avg_hours,
            "approval_rate_7d": approval_rate,
            "total_approved_7d": total_approved,
            "total_decided_7d": total_decided,
        }
        return Response(DashboardMetricsSerializer(data).data)


class ReviewerAllSubmissionsView(APIView):
    """Let reviewers browse ALL submissions (including draft/approved/rejected)."""
    permission_classes = [IsReviewer]

    def get(self, request):
        state_filter = request.query_params.get("state")
        qs = KYCSubmission.objects.all()
        if state_filter:
            qs = qs.filter(state=state_filter)
        qs = qs.order_by("-created_at")
        return Response(KYCSubmissionSerializer(qs, many=True).data)
