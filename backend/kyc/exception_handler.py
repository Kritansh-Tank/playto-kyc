from rest_framework.views import exception_handler
from rest_framework.response import Response


def custom_exception_handler(exc, context):
    """
    Wraps DRF's default exception handler to ensure all errors
    return a consistent { error, code } shape.
    """
    response = exception_handler(exc, context)

    if response is not None:
        data = response.data

        # If it's already our shape (has "error" key), pass through
        if isinstance(data, dict) and "error" in data:
            return response

        # DRF validation errors come as dicts of field: [messages]
        # or as lists; normalise them
        if isinstance(data, dict):
            if "detail" in data:
                response.data = {
                    "error": str(data["detail"]),
                    "code": getattr(data.get("detail"), "code", "error"),
                }
            else:
                # Validation errors — collect field messages
                messages = []
                for field, errs in data.items():
                    if isinstance(errs, list):
                        for e in errs:
                            messages.append(f"{field}: {e}")
                    else:
                        messages.append(f"{field}: {errs}")
                response.data = {
                    "error": "; ".join(messages),
                    "code": "validation_error",
                    "fields": data,
                }
        elif isinstance(data, list):
            response.data = {
                "error": "; ".join(str(e) for e in data),
                "code": "error",
            }

    return response
