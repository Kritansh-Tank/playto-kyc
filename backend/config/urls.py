from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.urls import path, include

urlpatterns = [
    path("api/v1/", include("kyc.urls")),
    path("api/health/", lambda r: JsonResponse({"status": "ok"})),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
