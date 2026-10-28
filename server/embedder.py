"""Capability-gated multilingual embedder for the memory engine.

The model is NOT bundled with EffiClaude. It is loaded from
``~/.efficlaude/models/multilingual/`` (``model.onnx`` + ``tokenizer.json``)
when those files are present, using the ``onnxruntime`` and ``tokenizers``
wheels that are already installed alongside chromadb, so it adds no heavyweight
deep-learning runtime to the footprint.

When no usable model is installed, :func:`get_embedding_function` returns
``None`` so callers keep the existing default embedding function.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import TYPE_CHECKING, Any, Sequence

from logger import warn

if TYPE_CHECKING:
    import numpy as np

MODEL_DIR = Path.home() / ".efficlaude" / "models" / "multilingual"
MODEL_FILE = "model.onnx"
TOKENIZER_FILE = "tokenizer.json"
EMBEDDING_DIM = 384
MAX_SEQUENCE_LENGTH = 512
EF_NAME = "efficlaude_multilingual_onnx"
_REQUIRED_MODULES = ("numpy", "onnxruntime", "tokenizers")
_ONNX_INT_DTYPES = {"tensor(int32)": "int32", "tensor(int64)": "int64"}


def _dependencies_present() -> bool:
    try:
        return all(importlib.util.find_spec(name) is not None for name in _REQUIRED_MODULES)
    except (ImportError, ValueError):
        return False


def available() -> bool:
    """True when a usable model is installed on this machine."""
    return (
        _dependencies_present()
        and (MODEL_DIR / MODEL_FILE).is_file()
        and (MODEL_DIR / TOKENIZER_FILE).is_file()
    )


class MultilingualOnnxEmbeddingFunction:
    """Chroma embedding function backed by a local ONNX sentence encoder.

    Implements Chroma's ``EmbeddingFunction`` protocol structurally instead of
    subclassing it: ``EmbeddingFunction.__init_subclass__`` wraps ``__call__``
    in ``normalize_embeddings``, which rejects an empty result list, and an
    empty input must yield an empty list.
    """

    def __init__(self, model_dir: str | Path = MODEL_DIR) -> None:
        import numpy
        import onnxruntime
        from tokenizers import Tokenizer

        self._np = numpy
        self._model_dir = Path(model_dir)

        self._tokenizer = Tokenizer.from_file(str(self._model_dir / TOKENIZER_FILE))
        self._tokenizer.enable_truncation(max_length=MAX_SEQUENCE_LENGTH)
        self._tokenizer.enable_padding()

        options = onnxruntime.SessionOptions()
        options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL
        self._session = onnxruntime.InferenceSession(
            str(self._model_dir / MODEL_FILE),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self._input_dtypes = {
            spec.name: _ONNX_INT_DTYPES.get(spec.type, "int64")
            for spec in self._session.get_inputs()
        }

    def __call__(self, input: Sequence[str]) -> list[np.ndarray]:
        documents = [str(document) for document in input]
        if not documents:
            return []

        np = self._np
        encodings = self._tokenizer.encode_batch(documents)
        columns = {
            "input_ids": [encoding.ids for encoding in encodings],
            "attention_mask": [encoding.attention_mask for encoding in encodings],
            "token_type_ids": [encoding.type_ids for encoding in encodings],
        }
        feed = {
            name: np.asarray(rows, dtype=self._input_dtypes[name])
            for name, rows in columns.items()
            if name in self._input_dtypes
        }

        hidden = self._session.run(None, feed)[0]
        if hidden.ndim != 3:
            raise ValueError(f"expected 3-D token embeddings, got shape {hidden.shape}")

        weights = np.asarray(columns["attention_mask"], dtype=np.float32)[:, :, None]
        pooled = (hidden * weights).sum(axis=1) / np.maximum(weights.sum(axis=1), 1e-9)
        norms = np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
        return list((pooled / norms).astype(np.float32))

    def embed_query(self, input: Sequence[str]) -> list[np.ndarray]:
        return self(input)

    def embed_with_retries(self, input: Sequence[str], **retry_kwargs: Any) -> list[np.ndarray]:
        return self(input)

    @staticmethod
    def name() -> str:
        return EF_NAME

    def get_config(self) -> dict[str, Any]:
        return {
            "model_dir": str(self._model_dir),
            "dimension": EMBEDDING_DIM,
            "max_sequence_length": MAX_SEQUENCE_LENGTH,
        }

    @staticmethod
    def build_from_config(config: dict[str, Any]) -> "MultilingualOnnxEmbeddingFunction":
        return MultilingualOnnxEmbeddingFunction(config.get("model_dir", MODEL_DIR))

    @staticmethod
    def validate_config(config: dict[str, Any]) -> None:
        return None

    def validate_config_update(
        self, old_config: dict[str, Any], new_config: dict[str, Any]
    ) -> None:
        return None

    def default_space(self) -> str:
        return "cosine"

    def supported_spaces(self) -> list[str]:
        return ["cosine", "ip", "l2"]

    def is_legacy(self) -> bool:
        return False


def get_embedding_function():
    """Return a Chroma-compatible embedding function, or None to use Chroma's default."""
    if not available():
        return None
    try:
        function = MultilingualOnnxEmbeddingFunction(MODEL_DIR)
        dimension = len(function(["efficlaude"])[0])
    except Exception as exc:
        warn("embedder", f"multilingual model at {MODEL_DIR} unusable: {exc}")
        return None
    if dimension != EMBEDDING_DIM:
        warn("embedder", f"multilingual model produced {dimension} dims, expected {EMBEDDING_DIM}")
        return None
    return function
