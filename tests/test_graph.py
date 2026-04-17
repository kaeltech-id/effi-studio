from graph import GraphEngine


def test_index_python_file_extracts_nodes(db_path, tmp_path):
    engine = GraphEngine(db_path)
    py_file = tmp_path / "utils.py"
    py_file.write_text("def helper():\n    pass\n\nclass MyClass:\n    pass\n")
    engine.index_file("proj", str(py_file), str(tmp_path))
    summary = engine.get_summary("proj")
    assert summary["nodes"] >= 2
    assert summary["files"] == 1


def test_index_missing_file_no_exception(db_path, tmp_path):
    engine = GraphEngine(db_path)
    engine.index_file("proj", str(tmp_path / "nonexistent.py"), str(tmp_path))
    summary = engine.get_summary("proj")
    assert summary["nodes"] == 0


def test_large_file_skipped(db_path, tmp_path):
    engine = GraphEngine(db_path)
    big_file = tmp_path / "big.py"
    big_file.write_bytes(b"x = 1\n" * 100_000)  # ~600KB > 512KB limit
    engine.index_file("proj", str(big_file), str(tmp_path))
    summary = engine.get_summary("proj")
    assert summary["nodes"] == 0


def test_blast_radius_finds_dependent(db_path, tmp_path):
    engine = GraphEngine(db_path)
    b_file = tmp_path / "b.py"
    b_file.write_text("def helper():\n    pass\n")
    a_file = tmp_path / "a.py"
    a_file.write_text("from b import helper\n\ndef main():\n    helper()\n")
    engine.index_file("proj", str(a_file), str(tmp_path))
    engine.index_file("proj", str(b_file), str(tmp_path))
    result = engine.get_blast_radius("proj", ["b.py"], depth=1)
    assert "a.py" in result["affected"]


def test_isolated_file_has_no_affected(db_path, tmp_path):
    engine = GraphEngine(db_path)
    standalone = tmp_path / "standalone.py"
    standalone.write_text("def solo():\n    pass\n")
    engine.index_file("proj", str(standalone), str(tmp_path))
    result = engine.get_blast_radius("proj", ["standalone.py"], depth=2)
    assert result["affected"] == []


def test_get_summary_counts(db_path, tmp_path):
    engine = GraphEngine(db_path)
    f1 = tmp_path / "one.py"
    f1.write_text("def foo(): pass\ndef bar(): pass\n")
    f2 = tmp_path / "two.py"
    f2.write_text("import one\ndef baz(): pass\n")
    engine.index_file("proj", str(f1), str(tmp_path))
    engine.index_file("proj", str(f2), str(tmp_path))
    summary = engine.get_summary("proj")
    assert summary["files"] == 2
    assert summary["nodes"] >= 3
    assert summary["edges"] >= 1
