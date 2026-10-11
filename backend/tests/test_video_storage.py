import asyncio
import errno
import hashlib
import os
import time
import uuid

import pytest

from app.video_storage import (
    InvalidVideoError,
    LocalVideoStorage,
    VideoStorageWriteError,
    VideoTooLargeError,
)

MP4 = b"\x00\x00\x00\x18ftypisom" + b"demo-media-bytes"
WEBM = b"\x1a\x45\xdf\xa3" + b"demo-media-bytes"


async def _chunks(*values: bytes):
    for value in values:
        yield value


def _store(storage, data=MP4, filename="game.mp4", content_type="video/mp4"):
    return asyncio.run(
        storage.store_stream(
            _chunks(data[:3], data[3:]), filename=filename, declared_content_type=content_type
        )
    )


def test_storage_generates_uuid_key_confines_paths_and_hashes_chunks(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    stored = _store(storage)
    parsed = uuid.UUID(hex=stored.storage_key.removesuffix(".mp4"))
    assert parsed.version == 4
    assert storage.resolve_storage_key(stored.storage_key).read_bytes() == MP4
    assert stored.size_bytes == len(MP4)
    assert stored.sha256 == hashlib.sha256(MP4).hexdigest()


def test_open_storage_key_returns_safe_descriptor_and_rejects_symlink_replacement(tmp_path):
    storage = LocalVideoStorage(tmp_path / "root")
    stored = _store(storage)
    media_path = storage.resolve_storage_key(stored.storage_key)
    descriptor = storage.open_storage_key(stored.storage_key)
    external = tmp_path / "external.mp4"
    external.write_bytes(b"outside bytes")

    media_path.unlink()
    media_path.symlink_to(external)
    try:
        assert os.read(descriptor, len(MP4)) == MP4
        with pytest.raises(InvalidVideoError):
            storage.open_storage_key(stored.storage_key)
        with pytest.raises(InvalidVideoError):
            storage.resolve_storage_key(stored.storage_key)
    finally:
        os.close(descriptor)
    assert external.read_bytes() == b"outside bytes"


@pytest.mark.parametrize("key", ["../../outside.mp4", "/tmp/out.mp4", "nested/file.mp4", "bad.txt"])
def test_storage_rejects_path_traversal_and_non_generated_keys(tmp_path, key):
    storage = LocalVideoStorage(tmp_path)
    with pytest.raises(InvalidVideoError):
        storage.resolve_storage_key(key)


def test_storage_rejects_traversal_filename_and_unsupported_extension(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    for filename in ("../game.mp4", "..\\game.mp4", "game.avi"):
        with pytest.raises(InvalidVideoError):
            _store(storage, filename=filename)


def test_storage_accepts_supported_mp4_and_webm_signatures(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    mp4 = _store(storage)
    webm = _store(storage, WEBM, "clip.webm", "video/webm")
    assert mp4.content_type == "video/mp4"
    assert webm.content_type == "video/webm"
    assert storage.resolve_storage_key(webm.storage_key).read_bytes() == WEBM


def test_storage_can_skip_optional_checksum_calculation(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    stored = asyncio.run(
        storage.store_stream(
            _chunks(MP4),
            filename="game.mp4",
            declared_content_type="video/mp4",
            calculate_sha256=False,
        )
    )
    assert stored.sha256 is None


@pytest.mark.parametrize(
    ("data", "filename", "content_type"),
    [
        (WEBM, "video.mp4", "video/mp4"),
        (MP4, "video.webm", "video/webm"),
        (MP4, "video.mp4", "video/webm"),
        (b"not a video", "video.mp4", "video/mp4"),
    ],
)
def test_storage_rejects_extension_mime_or_signature_mismatches(
    tmp_path, data, filename, content_type
):
    storage = LocalVideoStorage(tmp_path)
    with pytest.raises(InvalidVideoError):
        _store(storage, data, filename, content_type)
    staging = tmp_path / ".staging"
    assert not staging.exists() or list(staging.iterdir()) == []
    assert list(tmp_path.glob("*.mp4")) + list(tmp_path.glob("*.webm")) == []


def test_storage_enforces_limit_during_stream_and_cleans_partial_file(tmp_path):
    storage = LocalVideoStorage(tmp_path, max_upload_bytes=len(MP4) - 1)
    with pytest.raises(VideoTooLargeError):
        _store(storage)
    assert list((tmp_path / ".staging").iterdir()) == []
    assert list(tmp_path.glob("*.mp4")) == []


def test_storage_cleans_partial_file_when_stream_fails(tmp_path):
    async def broken_stream():
        yield MP4[:10]
        raise OSError("simulated input failure")

    storage = LocalVideoStorage(tmp_path)
    with pytest.raises(VideoStorageWriteError, match="Could not store video"):
        asyncio.run(
            storage.store_stream(
                broken_stream(), filename="game.mp4", declared_content_type="video/mp4"
            )
        )
    assert list((tmp_path / ".staging").iterdir()) == []
    assert list(tmp_path.glob("*.mp4")) == []


def test_unsupported_no_clobber_promotion_fails_closed_and_cleans_staging(tmp_path, monkeypatch):
    import app.video_storage as storage_module

    storage = LocalVideoStorage(tmp_path)

    def unsupported_link(*_args, **_kwargs):
        raise OSError(errno.EOPNOTSUPP, "hard links unavailable")

    monkeypatch.setattr(storage_module.os, "link", unsupported_link)
    with pytest.raises(VideoStorageWriteError, match="cannot safely promote"):
        _store(storage)
    assert list((tmp_path / ".staging").iterdir()) == []
    assert list(tmp_path.glob("*.mp4")) == []


def test_existing_destination_collision_preserves_existing_bytes(tmp_path, monkeypatch):
    import app.video_storage as storage_module

    storage = LocalVideoStorage(tmp_path)
    expected_key = "a" * 32 + ".mp4"
    existing_bytes = b"pre-existing media must survive"
    (tmp_path / expected_key).write_bytes(existing_bytes)
    real_uuid4 = storage_module.uuid.uuid4
    call_count = 0

    def fixed_final_uuid():
        nonlocal call_count
        call_count += 1
        return real_uuid4() if call_count == 1 else uuid.UUID(hex="a" * 32)

    monkeypatch.setattr(storage_module.uuid, "uuid4", fixed_final_uuid)
    with pytest.raises(VideoStorageWriteError):
        _store(storage)
    assert (tmp_path / expected_key).read_bytes() == existing_bytes
    assert list((tmp_path / ".staging").iterdir()) == []


def test_destination_created_during_promotion_is_not_overwritten(tmp_path, monkeypatch):
    import app.video_storage as storage_module

    storage = LocalVideoStorage(tmp_path)
    expected_key = "b" * 32 + ".mp4"
    existing_bytes = b"created by competing writer"
    real_link = storage_module.os.link
    real_uuid4 = storage_module.uuid.uuid4
    call_count = 0

    def fixed_final_uuid():
        nonlocal call_count
        call_count += 1
        return real_uuid4() if call_count == 1 else uuid.UUID(hex="b" * 32)

    def competing_link(source, destination, **kwargs):
        if destination == expected_key:
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600,
                         dir_fd=kwargs["dst_dir_fd"])
            with os.fdopen(fd, "wb") as target:
                target.write(existing_bytes)
        return real_link(source, destination, **kwargs)

    monkeypatch.setattr(storage_module.uuid, "uuid4", fixed_final_uuid)
    monkeypatch.setattr(storage_module.os, "link", competing_link)
    with pytest.raises(VideoStorageWriteError):
        _store(storage)
    assert (tmp_path / expected_key).read_bytes() == existing_bytes
    assert list((tmp_path / ".staging").iterdir()) == []


def test_concurrent_promotions_to_same_key_have_one_winner_and_no_overwrite(
    tmp_path, monkeypatch
):
    import app.video_storage as storage_module

    storage = LocalVideoStorage(tmp_path)
    expected_key = "c" * 32 + ".mp4"
    real_uuid4 = storage_module.uuid.uuid4
    call_count = 0

    def repeated_final_uuid():
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            return real_uuid4()
        return uuid.UUID(hex="c" * 32)

    monkeypatch.setattr(storage_module.uuid, "uuid4", repeated_final_uuid)
    alternate_mp4 = b"\x00\x00\x00\x18ftypisom" + b"second-media-content"

    async def run_both():
        return await asyncio.gather(
            storage.store_stream(
                _chunks(MP4), filename="one.mp4", declared_content_type="video/mp4"
            ),
            storage.store_stream(
                _chunks(alternate_mp4), filename="two.mp4", declared_content_type="video/mp4"
            ),
            return_exceptions=True,
        )

    results = asyncio.run(run_both())
    successes = [result for result in results if not isinstance(result, Exception)]
    failures = [result for result in results if isinstance(result, Exception)]
    assert len(successes) == 1
    assert len(failures) == 1 and isinstance(failures[0], VideoStorageWriteError)
    assert (tmp_path / expected_key).read_bytes() in (MP4, alternate_mp4)
    assert list((tmp_path / ".staging").iterdir()) == []


def test_storage_reports_failed_write_and_cleans_staging(tmp_path, monkeypatch):
    import app.video_storage as storage_module

    def fail(*_args, **_kwargs):
        raise OSError("simulated disk error")

    monkeypatch.setattr(storage_module.os, "link", fail)
    storage = LocalVideoStorage(tmp_path)
    with pytest.raises(VideoStorageWriteError):
        _store(storage)
    assert list((tmp_path / ".staging").iterdir()) == []
    assert list(tmp_path.glob("*.mp4")) == []


def test_duplicate_content_has_same_checksum_but_distinct_storage_keys(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    first = _store(storage)
    second = _store(storage)
    assert first.sha256 == second.sha256
    assert first.storage_key != second.storage_key
    assert storage.resolve_storage_key(first.storage_key).is_file()
    assert storage.resolve_storage_key(second.storage_key).is_file()
    # Phase 6B will use this digest to reject or return an existing match upload;
    # Phase 6A does not silently deduplicate or overwrite stored files.


def test_reconciliation_is_diagnostic_only_for_empty_or_incomplete_reference_sets(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    now = time.time()
    staging = tmp_path / ".staging"
    staging.mkdir(mode=0o700)
    stale_stage = staging / f".phase6-upload-{uuid.uuid4().hex}.part"
    recent_stage = staging / f".phase6-upload-{uuid.uuid4().hex}.part"
    unknown_stage = staging / "keep-this.part"
    for path in (stale_stage, recent_stage, unknown_stage):
        path.write_bytes(b"partial")
    os.utime(stale_stage, (now - 2 * 24 * 60 * 60, now - 2 * 24 * 60 * 60))

    referenced = _store(storage)
    orphan = _store(storage, WEBM, "orphan.webm", "video/webm")
    referenced_path = storage.resolve_storage_key(referenced.storage_key)
    orphan_path = storage.resolve_storage_key(orphan.storage_key)
    os.utime(orphan_path, (now - 8 * 24 * 60 * 60, now - 8 * 24 * 60 * 60))
    os.utime(referenced_path, (now - 8 * 24 * 60 * 60, now - 8 * 24 * 60 * 60))
    unfamiliar = tmp_path / "keep-me.txt"
    unfamiliar.write_text("not managed by this service")
    os.utime(unfamiliar, (now - 8 * 24 * 60 * 60, now - 8 * 24 * 60 * 60))

    before = {path: path.read_bytes() for path in (stale_stage, recent_stage, unknown_stage,
                                                    orphan_path, unfamiliar)}
    stale_candidates = storage.find_stale_staging_candidates(now_seconds=now)
    empty_reference_candidates = storage.find_possible_orphan_candidates(
        set(), now_seconds=now
    )
    incomplete_reference_candidates = storage.find_possible_orphan_candidates(
        {referenced.storage_key}, now_seconds=now
    )

    assert stale_candidates == [stale_stage.name]
    assert recent_stage.exists() and unknown_stage.exists()
    assert empty_reference_candidates == sorted([orphan.storage_key, referenced.storage_key])
    assert incomplete_reference_candidates == [orphan.storage_key]
    assert storage.resolve_storage_key(referenced.storage_key).exists()
    assert unfamiliar.exists()
    assert {path: path.read_bytes() for path in before} == before


def test_reconciliation_excludes_unknown_and_referenced_files_without_deleting(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    now = time.time()
    stored = _store(storage)
    unknown = tmp_path / "unknown.mp4"
    unknown.write_bytes(b"unknown")
    old_time = now - 8 * 24 * 60 * 60
    os.utime(storage.resolve_storage_key(stored.storage_key), (old_time, old_time))
    os.utime(unknown, (old_time, old_time))
    before = {stored.storage_key: storage.resolve_storage_key(stored.storage_key).read_bytes(),
              unknown.name: unknown.read_bytes()}
    candidates = storage.find_possible_orphan_candidates(
        {stored.storage_key}, now_seconds=now
    )
    assert candidates == []
    assert storage.resolve_storage_key(stored.storage_key).read_bytes() == before[stored.storage_key]
    assert unknown.read_bytes() == before[unknown.name]


def test_empty_upload_and_split_container_signatures(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    with pytest.raises(InvalidVideoError, match="empty"):
        _store(storage, b"")
    split_mp4 = asyncio.run(
        storage.store_stream(
            _chunks(b"\x00\x00", b"\x00\x18", b"ft", b"yp", b"isompayload"),
            filename="split.mp4",
            declared_content_type="video/mp4",
        )
    )
    split_webm = asyncio.run(
        storage.store_stream(
            _chunks(b"\x1a\x45", b"\xdf", b"\xa3payload"),
            filename="split.webm",
            declared_content_type="video/webm",
        )
    )
    assert storage.resolve_storage_key(split_mp4.storage_key).is_file()
    assert storage.resolve_storage_key(split_webm.storage_key).is_file()


@pytest.mark.parametrize("root_kind", ["root", "staging"])
def test_symlinked_storage_directories_fail_closed_without_external_changes(tmp_path, root_kind):
    configured = tmp_path / "configured"
    outside = tmp_path / "outside"
    outside.mkdir()
    if root_kind == "root":
        configured.symlink_to(outside, target_is_directory=True)
    else:
        configured.mkdir()
        (configured / ".staging").symlink_to(outside, target_is_directory=True)
    storage = LocalVideoStorage(configured)
    with pytest.raises(VideoStorageWriteError):
        _store(storage)
    assert list(outside.iterdir()) == []
    if root_kind == "staging":
        with pytest.raises(VideoStorageWriteError):
            storage.find_stale_staging_candidates(now_seconds=time.time() + 10**9)
        assert list(outside.iterdir()) == []


def test_symlink_candidate_is_ignored_and_directory_replacement_cannot_escape(tmp_path, monkeypatch):
    storage = LocalVideoStorage(tmp_path / "root")
    storage.root.mkdir()
    now = time.time()
    managed_key = uuid.uuid4().hex + ".mp4"
    outside = tmp_path / "outside"
    outside.mkdir()
    external_media = outside / "external.mp4"
    external_media.write_bytes(b"external video bytes")
    (storage.root / managed_key).symlink_to(external_media)
    assert storage.find_possible_orphan_candidates(set(), now_seconds=now + 10**9) == []

    staging = storage.root / ".staging"
    staging.mkdir(mode=0o700)
    candidate_name = f".phase6-upload-{uuid.uuid4().hex}.part"
    (staging / candidate_name).symlink_to(outside / "keep", target_is_directory=False)
    external_file = outside / "keep"
    external_file.write_bytes(b"external")

    real_listdir = os.listdir
    replaced = False

    def replace_staging_after_open(directory_fd):
        nonlocal replaced
        entries = real_listdir(directory_fd)
        if not replaced:
            moved = storage.root / ".staging-old"
            os.rename(staging, moved)
            staging.symlink_to(outside, target_is_directory=True)
            replaced = True
        return entries

    monkeypatch.setattr(os, "listdir", replace_staging_after_open)
    assert storage.find_stale_staging_candidates(now_seconds=time.time() + 10**9) == []
    assert external_file.read_bytes() == b"external"
    assert external_media.read_bytes() == b"external video bytes"
    assert staging.is_symlink()


def test_writable_root_or_non_private_staging_directory_is_rejected(tmp_path):
    writable_root = tmp_path / "writable-root"
    writable_root.mkdir()
    writable_root.chmod(0o777)
    with pytest.raises(VideoStorageWriteError, match="group- or world-writable"):
        _store(LocalVideoStorage(writable_root))

    private_root = tmp_path / "private-root"
    private_root.mkdir()
    staging = private_root / ".staging"
    staging.mkdir(mode=0o755)
    storage = LocalVideoStorage(private_root)
    with pytest.raises(VideoStorageWriteError, match="must be private"):
        _store(storage)


def test_storage_root_replacement_during_upload_fails_closed(tmp_path):
    storage = LocalVideoStorage(tmp_path / "root")
    storage.root.mkdir()
    moved_root = tmp_path / "relocated-root"
    symlink_target = tmp_path / "root-target"
    symlink_target.mkdir()

    async def replacing_stream():
        yield MP4[:12]
        os.rename(storage.root, moved_root)
        storage.root.symlink_to(symlink_target, target_is_directory=True)
        yield MP4[12:]

    with pytest.raises(VideoStorageWriteError, match="replaced|relocated"):
        asyncio.run(
            storage.store_stream(
                replacing_stream(), filename="game.mp4", declared_content_type="video/mp4"
            )
        )
    assert list(symlink_target.iterdir()) == []
    assert not list(moved_root.glob("*.mp4"))


def test_staging_replacement_during_upload_fails_closed(tmp_path):
    storage = LocalVideoStorage(tmp_path / "root")
    storage.root.mkdir()
    staging = storage.root / ".staging"
    staging.mkdir(mode=0o700)
    moved_staging = storage.root / ".staging-moved"
    outside = tmp_path / "outside"
    outside.mkdir()

    async def replacing_stream():
        yield MP4[:12]
        os.rename(staging, moved_staging)
        staging.symlink_to(outside, target_is_directory=True)
        yield MP4[12:]

    with pytest.raises(VideoStorageWriteError, match="staging directory was replaced"):
        asyncio.run(
            storage.store_stream(
                replacing_stream(), filename="game.mp4", declared_content_type="video/mp4"
            )
        )
    assert list(outside.iterdir()) == []
    assert not list(storage.root.glob("*.mp4"))
    assert staging.is_symlink()


def test_root_relocation_during_promotion_fails_closed_and_removes_own_link(
    tmp_path, monkeypatch
):
    import app.video_storage as storage_module

    storage = LocalVideoStorage(tmp_path / "root")
    storage.root.mkdir()
    moved_root = tmp_path / "relocated-root"
    symlink_target = tmp_path / "root-target"
    symlink_target.mkdir()
    real_link = storage_module.os.link

    def relocate_root_then_link(source, destination, **kwargs):
        os.rename(storage.root, moved_root)
        storage.root.symlink_to(symlink_target, target_is_directory=True)
        return real_link(source, destination, **kwargs)

    monkeypatch.setattr(storage_module.os, "link", relocate_root_then_link)
    with pytest.raises(VideoStorageWriteError, match="root was replaced|relocated"):
        _store(storage)
    assert list(moved_root.glob("*.mp4")) == []
    assert list(symlink_target.iterdir()) == []


def test_staging_relocation_during_promotion_fails_closed_and_removes_own_link(
    tmp_path, monkeypatch
):
    import app.video_storage as storage_module

    storage = LocalVideoStorage(tmp_path / "root")
    storage.root.mkdir()
    staging = storage.root / ".staging"
    staging.mkdir(mode=0o700)
    moved_staging = storage.root / ".staging-moved"
    outside = tmp_path / "outside"
    outside.mkdir()
    real_link = storage_module.os.link

    def relocate_staging_then_link(source, destination, **kwargs):
        os.rename(staging, moved_staging)
        staging.symlink_to(outside, target_is_directory=True)
        return real_link(source, destination, **kwargs)

    monkeypatch.setattr(storage_module.os, "link", relocate_staging_then_link)
    with pytest.raises(VideoStorageWriteError, match="staging directory was replaced"):
        _store(storage)
    assert list(storage.root.glob("*.mp4")) == []
    assert list(outside.iterdir()) == []


def test_missing_file_check_reports_without_deleting_metadata_or_files(tmp_path):
    storage = LocalVideoStorage(tmp_path)
    missing = uuid.uuid4().hex + ".mp4"
    assert storage.missing_storage_keys({missing}) == [missing]
