"""Root entry point for a launcher that starts the app from the package root.

The application lives in ``backend/main.py``. This module loads it and
re-exports ``app``, so ``uvicorn main:app`` works from the package root as well
as from ``backend/``. There is no second copy of anything: the module below is
the same one, loaded from its real location.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"

# So the backend's own imports resolve exactly as they do when it is started
# from inside backend/.
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Loaded under its own name rather than "main", which this module already
# occupies when the launcher imports it as main:app.
_spec = importlib.util.spec_from_file_location("he_diy_backend", BACKEND_DIR / "main.py")
if _spec is None or _spec.loader is None:  # pragma: no cover - packaging error
    raise ImportError(f"Could not load the backend from {BACKEND_DIR / 'main.py'}")
_backend = importlib.util.module_from_spec(_spec)
sys.modules["he_diy_backend"] = _backend
_spec.loader.exec_module(_backend)

app = _backend.app

__all__ = ["app"]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=_backend.env_int("PORT", 8000, 1, 65535),
    )
