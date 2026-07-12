import logging
from datetime import timedelta
from io import BytesIO
from typing import BinaryIO
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: Minio | None = None
_signing_client: Minio | None = None


def get_client() -> Minio:
    global _client
    if _client is None:
        settings = get_settings()
        _client = Minio(
            endpoint=settings.s3_endpoint,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            secure=settings.s3_secure,
        )
    return _client


def _get_signing_client() -> Minio:
    # urls must be signed for the endpoint the browser reaches, not the internal one
    global _signing_client
    if _signing_client is None:
        settings = get_settings()
        public_endpoint = urlparse(settings.s3_public_endpoint)
        _signing_client = Minio(
            endpoint=public_endpoint.netloc,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            secure=public_endpoint.scheme == "https",
            region="us-east-1",
        )
    return _signing_client


def ensure_bucket(bucket: str) -> None:
    client = get_client()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def configure_bucket_cors(origins: list[str]) -> None:
    """Best-effort: allow the given browser origins to PUT directly to the bucket.

    Direct-to-storage uploads are the primary path in production, so the bucket
    must return CORS headers for the app's origin(s). Not every backend supports
    setting CORS over the S3 API from the client we use (Cloudflare R2 is
    configured out of band via the dashboard/wrangler; the pinned minio client
    has no CORS method), so this is advisory only — never raises, and uploads
    still work via the backend proxy path when CORS isn't set.
    """
    if not origins:
        return
    client = get_client()
    set_cors = getattr(client, "set_bucket_cors", None)
    if set_cors is None:
        logger.info(
            "storage client cannot set CORS over the API; ensure the bucket allows "
            "PUT/GET from %s out of band (see deploy/r2-cors.json) so direct browser "
            "uploads work — the proxy fallback covers it until then",
            ", ".join(origins),
        )
        return
    try:
        from minio.cors import CORSConfig, Rule  # type: ignore

        ensure_bucket(get_settings().s3_media_bucket)
        rule = Rule(
            allowed_origins=origins,
            allowed_methods=["PUT", "GET", "HEAD"],
            allowed_headers=["*"],
            expose_headers=["ETag"],
            max_age_seconds=3600,
        )
        set_cors(get_settings().s3_media_bucket, CORSConfig([rule]))
        logger.info("configured bucket CORS for origins: %s", ", ".join(origins))
    except Exception:
        logger.warning("automatic bucket CORS configuration failed; configure it out of band", exc_info=True)


def presigned_put_url(object_key: str, expires_seconds: int) -> str:
    # avoid a blocking bucket check on every upload request
    return _get_signing_client().presigned_put_object(
        bucket_name=get_settings().s3_media_bucket,
        object_name=object_key,
        expires=timedelta(seconds=expires_seconds),
    )


def presigned_get_url(object_key: str, expires_seconds: int) -> str:
    return _get_signing_client().presigned_get_object(
        bucket_name=get_settings().s3_media_bucket,
        object_name=object_key,
        expires=timedelta(seconds=expires_seconds),
    )


async def presigned_get_url_cached(object_key: str, expires_seconds: int) -> str:
    """cache scoped urls while retaining an expiry safety margin"""
    from redis.exceptions import RedisError

    from app.integrations.redis import get_redis_client

    cache_key = f"photo-url:{object_key}"
    redis = get_redis_client()
    try:
        cached = await redis.get(cache_key)
        if cached:
            return cached
    except RedisError:
        return presigned_get_url(object_key, expires_seconds)

    url = presigned_get_url(object_key, expires_seconds)
    try:
        await redis.set(cache_key, url, ex=max(int(expires_seconds * 0.8), 1))
    except RedisError:
        pass
    return url


def get_object_bytes(object_key: str) -> bytes:
    response = get_client().get_object(get_settings().s3_media_bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def get_object_size(object_key: str) -> int | None:
    try:
        stat = get_client().stat_object(get_settings().s3_media_bucket, object_key)
    except S3Error as error:
        if error.code in {"NoSuchKey", "NoSuchObject"}:
            return None
        raise
    return stat.size


def put_object_bytes(object_key: str, content: bytes, content_type: str) -> None:
    settings = get_settings()
    get_client().put_object(
        bucket_name=settings.s3_media_bucket,
        object_name=object_key,
        data=BytesIO(content),
        length=len(content),
        content_type=content_type,
    )


def put_object_file(
    object_key: str,
    content: BinaryIO,
    length: int,
    content_type: str,
) -> None:
    get_client().put_object(
        bucket_name=get_settings().s3_media_bucket,
        object_name=object_key,
        data=content,
        length=length,
        content_type=content_type,
    )


def delete_object(object_key: str) -> None:
    get_client().remove_object(get_settings().s3_media_bucket, object_key)
