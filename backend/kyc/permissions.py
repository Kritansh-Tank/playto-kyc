from rest_framework.permissions import BasePermission


class IsMerchant(BasePermission):
    """Allow only authenticated merchant users."""

    message = "Only merchant accounts can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "merchant"
        )


class IsReviewer(BasePermission):
    """Allow only authenticated reviewer users."""

    message = "Only reviewer accounts can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "reviewer"
        )
