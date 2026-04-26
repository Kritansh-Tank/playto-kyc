from django.urls import path
from kyc import views

urlpatterns = [
    # ── Auth ──
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/me/", views.MeView.as_view(), name="me"),

    # ── Merchant KYC ──
    path("kyc/me/", views.MerchantKYCView.as_view(), name="merchant-kyc"),
    path("kyc/me/submit/", views.MerchantSubmitView.as_view(), name="merchant-kyc-submit"),
    path("kyc/me/documents/", views.MerchantDocumentUploadView.as_view(), name="merchant-kyc-documents"),

    # ── Reviewer ──
    path("reviewer/queue/", views.ReviewerQueueView.as_view(), name="reviewer-queue"),
    path("reviewer/submissions/", views.ReviewerAllSubmissionsView.as_view(), name="reviewer-all"),
    path("reviewer/submissions/<int:pk>/", views.ReviewerSubmissionDetailView.as_view(), name="reviewer-detail"),
    path("reviewer/submissions/<int:pk>/transition/", views.ReviewerTransitionView.as_view(), name="reviewer-transition"),
    path("reviewer/dashboard/", views.ReviewerDashboardView.as_view(), name="reviewer-dashboard"),
]
