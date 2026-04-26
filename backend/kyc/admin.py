from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from kyc.models import Document, KYCSubmission, NotificationEvent, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "full_name", "role", "is_active", "created_at"]
    list_filter = ["role", "is_active"]
    search_fields = ["email", "full_name"]
    ordering = ["-created_at"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("full_name", "role")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "full_name", "role", "password1", "password2"),
        }),
    )


@admin.register(KYCSubmission)
class KYCSubmissionAdmin(admin.ModelAdmin):
    list_display = ["merchant", "state", "submitted_at", "reviewed_at"]
    list_filter = ["state"]
    search_fields = ["merchant__email", "business_name"]


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ["submission", "doc_type", "original_filename", "file_size", "uploaded_at"]


@admin.register(NotificationEvent)
class NotificationEventAdmin(admin.ModelAdmin):
    list_display = ["merchant", "event_type", "timestamp"]
    list_filter = ["event_type"]
