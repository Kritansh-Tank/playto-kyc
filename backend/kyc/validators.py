"""
File upload validators for KYC documents.
We use `filetype` to sniff MIME from actual file bytes — not from the
client-supplied Content-Type header, which is trivially spoofable.
"""
import filetype
from rest_framework.exceptions import ValidationError

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB in bytes

ALLOWED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}

MIME_EXTENSIONS = {
    "application/pdf": "PDF",
    "image/jpeg": "JPG/JPEG",
    "image/png": "PNG",
}


def validate_kyc_document(file) -> str:
    """
    Validate a KYC document file.
    Returns the detected MIME type on success.
    Raises ValidationError on failure.
    """
    # 1. Check file size first (cheap check before reading bytes)
    if file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise ValidationError(
            {
                "error": (
                    f"File '{file.name}' is {size_mb:.1f} MB. "
                    f"Maximum allowed size is 5 MB."
                ),
                "code": "file_too_large",
            }
        )

    # 2. Read a chunk of bytes to detect the real MIME type
    chunk = file.read(261)  # filetype needs ≥261 bytes for most formats
    file.seek(0)  # rewind so Django can still save it

    kind = filetype.guess(chunk)
    if kind is None:
        raise ValidationError(
            {
                "error": (
                    f"Could not determine the file type of '{file.name}'. "
                    f"Accepted formats: PDF, JPG, PNG."
                ),
                "code": "unknown_file_type",
            }
        )

    detected_mime = kind.mime
    if detected_mime not in ALLOWED_MIMES:
        raise ValidationError(
            {
                "error": (
                    f"File type '{detected_mime}' is not accepted. "
                    f"Accepted formats: PDF, JPG, PNG."
                ),
                "code": "invalid_file_type",
            }
        )

    return detected_mime
