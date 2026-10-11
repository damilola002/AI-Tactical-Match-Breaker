"""Private local storage primitives for future video upload endpoints.

This module performs lightweight type checks only. A matching signature does not
prove that media is safe or decodable. Reconciliation helpers are diagnostic-only
and are never run automatically during application startup.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterable, Iterable
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import stat
import uuid

DEFAULT_MAX_VIDEO_UPLOAD_BYTES = 524_288_000
CHUNK_SIZE = 1024 * 1024
STAGING_RETENTION_SECONDS = 24 * 60 * 60
ORPHAN_RETENTION_SECONDS = 7 * 24 * 60 * 60


@dataclass(frozen=True)
class VideoFormat:
    extension: str
    content_type: str


SUPPORTED_FORMATS = {
    "mp4": VideoFormat(".mp4", "video/mp4"),
    "webm": VideoFormat(".webm", "video/webm"),
}
_STORAGE_KEY_PATTERN = re.compile(r"^[0-9a-f]{32}\.(?:mp4|webm)$")
_STAGING_FILE_PATTERN = re.compile(r"^\.phase6-upload-[0-9a-f]{32}\.part$")


class VideoStorageError(Exception):
    """Base class for expected storage and validation failures."""


class InvalidVideoError(VideoStorageError):
    pass


class VideoTooLargeError(VideoStorageError):
    pass


class VideoStorageWriteError(VideoStorageError):
    pass


@dataclass(frozen=True)
class StoredVideo:
    storage_key: str
    content_type: str
    size_bytes: int
    sha256: str | None


def _safe_filename_format(filename: str, allowed_formats: frozenset[str]) -> VideoFormat:
    if (
        not filename
        or "\x00" in filename
        or "/" in filename
        or "\\" in filename
        or filename in {".", ".."}
    ):
        raise InvalidVideoError("A plain video filename is required")
    extension = Path(filename).suffix.lower().lstrip(".")
    video_format = SUPPORTED_FORMATS.get(extension)
    if video_format is None or extension not in allowed_formats:
        raise InvalidVideoError("Unsupported video extension")
    return video_format


def _matches_signature(prefix: bytes, video_format: VideoFormat) -> bool:
    if video_format.content_type == "video/mp4":
        return len(prefix) >= 12 and prefix[4:8] == b"ftyp"
    if video_format.content_type == "video/webm":
        return prefix.startswith(b"\x1a\x45\xdf\xa3")
    return False


class LocalVideoStorage:
    """Write validated streams under a private, UUID-keyed local directory.

    Promotion requires an atomic no-clobber hard link on the same filesystem.
    Cleanup is advisory-only in Phase 6A; this module never deletes by cleanup
    reconciliation because active uploads and database references are not known.
    """

    def __init__(
        self,
        root: str | Path,
        max_upload_bytes: int = DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
        allowed_formats: Iterable[str] = ("mp4", "webm"),
    ) -> None:
        if (
            isinstance(max_upload_bytes, bool)
            or not isinstance(max_upload_bytes, int)
            or max_upload_bytes <= 0
        ):
            raise ValueError("max_upload_bytes must be a positive integer")
        formats = frozenset(item.strip().lower().lstrip(".") for item in allowed_formats)
        if not formats or not formats <= SUPPORTED_FORMATS.keys():
            raise ValueError("allowed_formats must be a non-empty subset of mp4,webm")
        # abspath normalizes relative components without resolving a final symlink.
        self.root = Path(os.path.abspath(Path(root).expanduser()))
        self.max_upload_bytes = max_upload_bytes
        self.allowed_formats = formats

    @classmethod
    def from_environment(cls) -> "LocalVideoStorage":
        root = os.getenv("VIDEO_STORAGE_PATH", "./data/videos")
        raw_limit = os.getenv("MAX_VIDEO_UPLOAD_BYTES", str(DEFAULT_MAX_VIDEO_UPLOAD_BYTES))
        raw_formats = os.getenv("VIDEO_ALLOWED_FORMATS", "mp4,webm")
        try:
            limit = int(raw_limit)
        except ValueError as error:
            raise ValueError("MAX_VIDEO_UPLOAD_BYTES must be an integer") from error
        formats = [item for item in raw_formats.split(",") if item.strip()]
        return cls(root, max_upload_bytes=limit, allowed_formats=formats)

    @staticmethod
    def _directory_flags() -> int:
        required = ("O_DIRECTORY", "O_NOFOLLOW")
        if any(not hasattr(os, flag) for flag in required):
            raise VideoStorageWriteError("Secure local storage is unavailable on this platform")
        return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW

    def _open_root_fd(self) -> int:
        try:
            descriptor = os.open(self.root, self._directory_flags())
            self._validate_directory(descriptor, "Video storage root")
            self._verify_root_binding(descriptor)
            return descriptor
        except VideoStorageError:
            raise
        except OSError as error:
            raise VideoStorageWriteError("Video storage root is missing or unsafe") from error

    def _open_staging_fd(self, root_fd: int, *, create: bool) -> int:
        if create:
            try:
                os.mkdir(".staging", mode=0o700, dir_fd=root_fd)
            except FileExistsError:
                pass
        try:
            descriptor = os.open(".staging", self._directory_flags(), dir_fd=root_fd)
            self._validate_directory(descriptor, "Video staging directory", private=True)
            self._verify_staging_binding(root_fd, descriptor)
            return descriptor
        except OSError as error:
            raise VideoStorageWriteError("Video staging directory is missing or unsafe") from error

    def _validate_directory(self, descriptor: int, label: str, *, private: bool = False) -> None:
        info = os.fstat(descriptor)
        mode = stat.S_IMODE(info.st_mode)
        if not stat.S_ISDIR(info.st_mode):
            raise VideoStorageWriteError(f"{label} is not a directory")
        if mode & 0o022:
            raise VideoStorageWriteError(f"{label} must not be group- or world-writable")
        if private and mode & 0o077:
            raise VideoStorageWriteError(f"{label} must be private to the application user")
        effective_uid = os.geteuid()
        # Docker Desktop may map a host-owned bind mount to container root. Root
        # remains trusted/privileged by this MVP threat model; non-root runtimes
        # must own the storage directories themselves.
        if effective_uid != 0 and info.st_uid != effective_uid:
            raise VideoStorageWriteError(f"{label} has an unexpected owner")

    def _verify_root_binding(self, root_fd: int) -> None:
        try:
            path_info = os.stat(self.root, follow_symlinks=False)
            parent_info = os.stat(self.root.parent, follow_symlinks=False)
        except OSError as error:
            raise VideoStorageWriteError("Video storage root was replaced or removed") from error
        fd_info = os.fstat(root_fd)
        parent_mode = stat.S_IMODE(parent_info.st_mode)
        if (
            not stat.S_ISDIR(path_info.st_mode)
            or (path_info.st_dev, path_info.st_ino) != (fd_info.st_dev, fd_info.st_ino)
        ):
            raise VideoStorageWriteError("Video storage root was replaced or relocated")
        if not stat.S_ISDIR(parent_info.st_mode) or parent_mode & 0o022:
            raise VideoStorageWriteError("Video storage parent is not trusted")
        effective_uid = os.geteuid()
        if effective_uid != 0 and parent_info.st_uid != effective_uid:
            raise VideoStorageWriteError("Video storage parent has an unexpected owner")

    def _verify_staging_binding(self, root_fd: int, staging_fd: int) -> None:
        self._verify_root_binding(root_fd)
        try:
            path_info = os.stat(".staging", dir_fd=root_fd, follow_symlinks=False)
        except OSError as error:
            raise VideoStorageWriteError("Video staging directory was replaced or removed") from error
        fd_info = os.fstat(staging_fd)
        if (
            not stat.S_ISDIR(path_info.st_mode)
            or (path_info.st_dev, path_info.st_ino) != (fd_info.st_dev, fd_info.st_ino)
        ):
            raise VideoStorageWriteError("Video staging directory was replaced or relocated")

    def _ensure_root(self) -> None:
        try:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        except OSError as error:
            raise VideoStorageWriteError("Could not prepare local video storage") from error

    def resolve_storage_key(self, storage_key: str) -> Path:
        """Return a display/legacy path, not a secure handle for opening media.

        Security-sensitive readers must use :meth:`open_storage_key` so the
        final component is opened relative to the verified root descriptor.
        """
        if not isinstance(storage_key, str) or not _STORAGE_KEY_PATTERN.fullmatch(storage_key):
            raise InvalidVideoError("Invalid storage key")
        try:
            root_fd = self._open_root_fd()
        except VideoStorageWriteError as error:
            if isinstance(error.__cause__, FileNotFoundError):
                return self.root / storage_key
            raise
        try:
            try:
                target = os.stat(storage_key, dir_fd=root_fd, follow_symlinks=False)
            except FileNotFoundError:
                pass
            else:
                if not stat.S_ISREG(target.st_mode):
                    raise InvalidVideoError("Storage key is not a regular file")
        finally:
            os.close(root_fd)
        return self.root / storage_key

    def open_storage_key(self, storage_key: str) -> int:
        """Open a regular media file without following its final path component.

        The returned OS file descriptor is safe to retain if the pathname is
        subsequently replaced. The caller owns and must close the descriptor.
        """
        if not isinstance(storage_key, str) or not _STORAGE_KEY_PATTERN.fullmatch(storage_key):
            raise InvalidVideoError("Invalid storage key")
        root_fd = self._open_root_fd()
        try:
            descriptor = os.open(
                storage_key,
                os.O_RDONLY | os.O_NOFOLLOW,
                dir_fd=root_fd,
            )
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                os.close(descriptor)
                raise InvalidVideoError("Storage key is not a regular file")
            return descriptor
        except VideoStorageError:
            raise
        except OSError as error:
            raise InvalidVideoError("Storage key is missing or unsafe") from error
        finally:
            os.close(root_fd)

    async def store_stream(
        self,
        chunks: AsyncIterable[bytes],
        *,
        filename: str,
        declared_content_type: str,
        calculate_sha256: bool = True,
    ) -> StoredVideo:
        video_format = _safe_filename_format(filename, self.allowed_formats)
        if not isinstance(declared_content_type, str):
            raise InvalidVideoError("A declared media type is required")
        declared_type = declared_content_type.split(";", 1)[0].strip().lower()
        if declared_type != video_format.content_type:
            raise InvalidVideoError("Filename and declared media type do not match")

        self._ensure_root()
        root_fd = self._open_root_fd()
        staging_fd = -1
        staging_name: str | None = None
        file_handle = None
        try:
            staging_fd = self._open_staging_fd(root_fd, create=True)
            self._verify_root_binding(root_fd)
            self._verify_staging_binding(root_fd, staging_fd)
            staging_name = f".phase6-upload-{uuid.uuid4().hex}.part"
            descriptor = os.open(
                staging_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=staging_fd,
            )
            file_handle = os.fdopen(descriptor, "wb")
            total = 0
            signature_prefix = bytearray()
            digest = hashlib.sha256() if calculate_sha256 else None
            async for chunk in chunks:
                if not isinstance(chunk, bytes):
                    raise InvalidVideoError("Video stream must contain byte chunks")
                if not chunk:
                    continue
                for offset in range(0, len(chunk), CHUNK_SIZE):
                    self._verify_staging_binding(root_fd, staging_fd)
                    bounded_chunk = chunk[offset : offset + CHUNK_SIZE]
                    total += len(bounded_chunk)
                    if total > self.max_upload_bytes:
                        raise VideoTooLargeError("Video exceeds the configured upload limit")
                    if len(signature_prefix) < 12:
                        signature_prefix.extend(bounded_chunk[: 12 - len(signature_prefix)])
                    if digest is not None:
                        digest.update(bounded_chunk)
                    await asyncio.to_thread(file_handle.write, bounded_chunk)
            await asyncio.to_thread(file_handle.flush)
            await asyncio.to_thread(os.fsync, file_handle.fileno())
            await asyncio.to_thread(file_handle.close)
            if total == 0:
                raise InvalidVideoError("Video file is empty")
            if not _matches_signature(bytes(signature_prefix), video_format):
                raise InvalidVideoError("Video signature does not match its declared format")

            storage_key = f"{uuid.uuid4().hex}{video_format.extension}"
            # Revalidate directory names immediately before the descriptor-
            # relative promotion. Parent permissions and the local trust model
            # prevent an untrusted actor from racing this check with a rename.
            self._verify_staging_binding(root_fd, staging_fd)
            try:
                # linkat semantics: atomic creation fails with EEXIST and never
                # replaces a prior key. There is deliberately no unsafe fallback.
                await asyncio.to_thread(
                    os.link,
                    staging_name,
                    storage_key,
                    src_dir_fd=staging_fd,
                    dst_dir_fd=root_fd,
                    follow_symlinks=False,
                )
            except (OSError, TypeError, NotImplementedError) as error:
                raise VideoStorageWriteError(
                    "Filesystem cannot safely promote video without overwriting"
                ) from error
            try:
                self._verify_staging_binding(root_fd, staging_fd)
            except VideoStorageWriteError:
                # link() succeeded with an absent destination, so this exact
                # generated key is the link created by this operation.
                try:
                    os.unlink(storage_key, dir_fd=root_fd)
                except OSError:
                    pass
                raise
            try:
                os.unlink(staging_name, dir_fd=staging_fd)
                staging_name = None
            except OSError:
                # The final hard link is valid. Leave the recognized staging
                # alias for diagnostic-only reconciliation rather than fail ambiguously.
                pass
            return StoredVideo(
                storage_key=storage_key,
                content_type=video_format.content_type,
                size_bytes=total,
                sha256=digest.hexdigest() if digest is not None else None,
            )
        except (InvalidVideoError, VideoTooLargeError, VideoStorageWriteError):
            raise
        except OSError as error:
            raise VideoStorageWriteError("Could not store video in local storage") from error
        finally:
            if file_handle is not None and not file_handle.closed:
                await asyncio.to_thread(file_handle.close)
            if staging_fd >= 0 and staging_name is not None:
                try:
                    self._verify_staging_binding(root_fd, staging_fd)
                    os.unlink(staging_name, dir_fd=staging_fd)
                except FileNotFoundError:
                    pass
                except VideoStorageWriteError:
                    # A relocated directory is outside the cleanup trust boundary.
                    pass
                except OSError:
                    pass
            if staging_fd >= 0:
                os.close(staging_fd)
            os.close(root_fd)

    def find_stale_staging_candidates(
        self,
        *,
        now_seconds: float,
        retention_seconds: int = STAGING_RETENTION_SECONDS,
    ) -> list[str]:
        """List old managed staging names for review; never deletes or proves inactivity."""
        return self._find_candidates(
            directory=".staging",
            pattern=_STAGING_FILE_PATTERN,
            now_seconds=now_seconds,
            retention_seconds=retention_seconds,
        )

    def find_possible_orphan_candidates(
        self,
        referenced_storage_keys: set[str],
        *,
        now_seconds: float,
        retention_seconds: int = ORPHAN_RETENTION_SECONDS,
    ) -> list[str]:
        """Advisory list only; an absent key does not prove a file is safe to remove."""
        return self._find_candidates(
            directory=None,
            pattern=_STORAGE_KEY_PATTERN,
            now_seconds=now_seconds,
            retention_seconds=retention_seconds,
            excluded_names=referenced_storage_keys,
        )

    def _find_candidates(
        self,
        *,
        directory: str | None,
        pattern: re.Pattern[str],
        now_seconds: float,
        retention_seconds: int,
        excluded_names: set[str] | None = None,
    ) -> list[str]:
        if retention_seconds < 0:
            raise ValueError("retention_seconds must not be negative")
        try:
            root_fd = self._open_root_fd()
        except VideoStorageWriteError as error:
            if isinstance(error.__cause__, FileNotFoundError):
                return []
            raise
        directory_fd = root_fd
        try:
            if directory is not None:
                try:
                    if directory == ".staging":
                        directory_fd = self._open_staging_fd(root_fd, create=False)
                    else:
                        raise VideoStorageWriteError("Unsupported cleanup directory")
                except VideoStorageWriteError as error:
                    if isinstance(error.__cause__, FileNotFoundError):
                        return []
                    raise
                except FileNotFoundError:
                    return []
                except OSError as error:
                    raise VideoStorageWriteError("Cleanup directory is missing or unsafe") from error
            candidates: list[str] = []
            for name in os.listdir(directory_fd):
                if not pattern.fullmatch(name) or name in (excluded_names or set()):
                    continue
                try:
                    info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                except FileNotFoundError:
                    continue
                if not stat.S_ISREG(info.st_mode):
                    continue
                if now_seconds - info.st_mtime >= retention_seconds:
                    candidates.append(name)
            return sorted(candidates)
        finally:
            if directory_fd != root_fd:
                os.close(directory_fd)
            os.close(root_fd)

    def missing_storage_keys(self, referenced_storage_keys: set[str]) -> list[str]:
        """Report missing/unsafe metadata keys without modifying metadata or files."""
        missing: list[str] = []
        try:
            root_fd = self._open_root_fd()
        except VideoStorageWriteError as error:
            if isinstance(error.__cause__, FileNotFoundError):
                return sorted(referenced_storage_keys)
            raise
        try:
            for key in sorted(referenced_storage_keys):
                if not isinstance(key, str) or not _STORAGE_KEY_PATTERN.fullmatch(key):
                    missing.append(key)
                    continue
                try:
                    info = os.stat(key, dir_fd=root_fd, follow_symlinks=False)
                except FileNotFoundError:
                    missing.append(key)
                else:
                    if not stat.S_ISREG(info.st_mode):
                        missing.append(key)
            return missing
        finally:
            os.close(root_fd)
