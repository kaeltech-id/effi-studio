import pytest
from unittest.mock import patch, MagicMock
from docs import DocsEngine


def test_fetch_unknown_library_returns_zero(db_path, chroma_path):
    engine = DocsEngine(db_path, chroma_path)
    n = engine.fetch_and_cache("not_a_real_library_xyz")
    assert n == 0


def test_fetch_and_cache_mocked_npm(db_path, chroma_path):
    engine = DocsEngine(db_path, chroma_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "dist-tags": {"latest": "18.2.0"},
        "description": "A JavaScript library for building UIs",
        "readme": "# React\nReact makes it painless to create interactive UIs.",
    }
    with patch("requests.get", return_value=mock_resp):
        n = engine.fetch_and_cache("react")
    assert n > 0


def test_is_stale_on_fresh_db(db_path, chroma_path):
    engine = DocsEngine(db_path, chroma_path)
    assert engine._is_stale("react") is True


def test_is_stale_false_after_fetch(db_path, chroma_path):
    engine = DocsEngine(db_path, chroma_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "dist-tags": {"latest": "18.2.0"},
        "description": "React",
        "readme": "# React\nDocs here.",
    }
    with patch("requests.get", return_value=mock_resp):
        engine.register_library("react")
    assert engine._is_stale("react") is False


def test_search_empty_returns_empty_list(db_path, chroma_path):
    engine = DocsEngine(db_path, chroma_path)
    results = engine.search("proj", "hooks")
    assert results == []
