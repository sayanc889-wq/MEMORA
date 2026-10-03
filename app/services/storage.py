import logging
import re
import uuid
from pathlib import Path
import httpx

from app.core.config import settings

logger = logging.getLogger("memora.storage")

SAFE_EXTENSION = re.compile(r"\.[A-Za-z0-9]{1,10}$")


def safe_original_filename(filename: str | None) -> str:
    if not filename or not filename.strip():
        return "document.bin"
    original_name = Path(filename).name
    if not original_name or original_name in {".", ".."}:
        return "document.bin"
    return original_name


def generate_unique_filename(original_name: str) -> str:
    extension = Path(original_name).suffix.lower()
    if extension and not SAFE_EXTENSION.fullmatch(extension):
        extension = ""
    return f"{uuid.uuid4().hex}{extension}"


def is_cloud_url(file_path: str | None) -> bool:
    if not file_path:
        return False
    return file_path.startswith("http://") or file_path.startswith("https://")


async def ensure_supabase_bucket(client: httpx.AsyncClient) -> bool:
    """Ensures the Supabase Storage bucket exists and is public."""
    if not settings.supabase_url or not settings.supabase_key:
        return False

    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/bucket"
    headers = {
        "Authorization": f"Bearer {settings.supabase_key}",
        "apikey": settings.supabase_key,
        "Content-Type": "application/json",
    }
    payload = {
        "id": settings.supabase_bucket,
        "name": settings.supabase_bucket,
        "public": True,
    }
    try:
        res = await client.post(url, headers=headers, json=payload, timeout=5.0)
        if res.status_code in [200, 201, 400, 409]:
            # 200/201 created, 400/409 already exists
            return True
    except Exception as e:
        logger.warning("Could not verify/create Supabase bucket: %s", e)
    return False


async def upload_file(
    contents: bytes,
    original_filename: str,
    content_type: str | None,
    user_id: int | None = None,
) -> str:
    """Uploads file to Supabase Cloud Storage if configured, or falls back to local disk.

    Returns the permanent public URL (Cloud) or relative path (Local).
    """
    clean_original = safe_original_filename(original_filename)
    stored_name = generate_unique_filename(clean_original)
    prefix = f"user_{user_id}" if user_id else "general"
    cloud_path = f"{prefix}/{stored_name}"

    # 1. Supabase Cloud Storage
    if settings.supabase_url and settings.supabase_key:
        try:
            async with httpx.AsyncClient() as client:
                await ensure_supabase_bucket(client)

                upload_url = (
                    f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
                    f"{settings.supabase_bucket}/{cloud_path}"
                )
                headers = {
                    "Authorization": f"Bearer {settings.supabase_key}",
                    "apikey": settings.supabase_key,
                    "Content-Type": content_type or "application/octet-stream",
                    "x-upsert": "true",
                }
                res = await client.post(upload_url, headers=headers, content=contents, timeout=30.0)
                if res.status_code in [200, 201]:
                    public_url = (
                        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
                        f"{settings.supabase_bucket}/{cloud_path}"
                    )
                    logger.info("File uploaded to Supabase Storage: %s", public_url)
                    return public_url
                else:
                    logger.error("Supabase Storage upload failed (%d): %s", res.status_code, res.text)
        except Exception as e:
            logger.error("Failed uploading to Supabase Storage, falling back to local: %s", e)

    # 2. Local Filesystem Fallback
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    destination = (settings.uploads_dir / stored_name).resolve()
    destination.write_bytes(contents)
    logger.info("File saved to local filesystem: %s", destination)
    return f"uploads/{stored_name}"


async def delete_file(file_path: str) -> None:
    """Deletes file from Supabase Cloud Storage or local disk."""
    if not file_path:
        return

    # 1. Cloud URL
    if is_cloud_url(file_path):
        if settings.supabase_url and settings.supabase_key and settings.supabase_bucket in file_path:
            try:
                # Extract relative path inside bucket
                marker = f"/storage/v1/object/public/{settings.supabase_bucket}/"
                if marker in file_path:
                    relative_path = file_path.split(marker)[-1]
                    async with httpx.AsyncClient() as client:
                        del_url = (
                            f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
                            f"{settings.supabase_bucket}/{relative_path}"
                        )
                        headers = {
                            "Authorization": f"Bearer {settings.supabase_key}",
                            "apikey": settings.supabase_key,
                        }
                        await client.delete(del_url, headers=headers, timeout=10.0)
                        logger.info("Deleted from Supabase Storage: %s", relative_path)
            except Exception as e:
                logger.warning("Could not delete from Supabase: %s", e)
        return

    # 2. Local file
    try:
        uploads_dir = settings.uploads_dir.resolve()
        stored_path = (settings.data_dir / file_path).resolve()
        if uploads_dir in stored_path.parents or stored_path == uploads_dir:
            if stored_path.is_file():
                stored_path.unlink()
                logger.info("Deleted local file: %s", stored_path)
    except Exception as e:
        logger.warning("Could not delete local file: %s", e)
