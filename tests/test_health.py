import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))


def test_health_reports_degraded_above_threshold(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    import worker
    monkeypatch.setattr(worker, "_HEALTH_ERROR_THRESHOLD", 3)
    monkeypatch.setattr(worker, "get_counts", lambda: {"memory": 5})
    with worker.app.test_client() as client:
        assert client.get("/health").get_json()["status"] == "degraded"
    monkeypatch.setattr(worker, "get_counts", lambda: {"memory": 1})
    with worker.app.test_client() as client:
        assert client.get("/health").get_json()["status"] == "ok"
