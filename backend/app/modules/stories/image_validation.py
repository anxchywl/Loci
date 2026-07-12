import warnings
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from PIL.Image import DecompressionBombError, DecompressionBombWarning
from pillow_heif import register_heif_opener

_FORMATS = {
    "image/jpeg": {"JPEG"},
    "image/png": {"PNG"},
    "image/webp": {"WEBP"},
    "image/heic": {"HEIF", "HEIC"},
}
_MAX_SOURCE_EDGE = 20_000
_MAX_SOURCE_PIXELS = 40_000_000

register_heif_opener()


class InvalidImageError(ValueError):
    pass


def decode_image(raw: bytes, content_type: str) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                width, height = image.size
                if max(width, height) > _MAX_SOURCE_EDGE or width * height > _MAX_SOURCE_PIXELS:
                    raise InvalidImageError("image dimensions are too large")
                if image.format not in _FORMATS[content_type]:
                    raise InvalidImageError("image content does not match its declared type")
                image.load()
                return image.copy()
    except InvalidImageError:
        raise
    except (
        DecompressionBombError,
        DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as error:
        raise InvalidImageError("uploaded file is not a valid supported image") from error
