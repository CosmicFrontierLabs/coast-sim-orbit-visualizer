from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py as _build_py
from setuptools.command.sdist import sdist as _sdist


def _build_frontend() -> None:
    if os.environ.get("ORBIT_VISUALIZER_SKIP_FRONTEND_BUILD") == "1":
        print("Skipping frontend build (ORBIT_VISUALIZER_SKIP_FRONTEND_BUILD=1)")
        return

    repo_root = Path(__file__).resolve().parent
    dist_index = repo_root / "orbit_visualizer" / "dist" / "index.html"
    npm = shutil.which("npm")

    if npm is None:
        if dist_index.is_file():
            print("npm not found; using existing orbit_visualizer/dist assets")
            return
        raise RuntimeError(
            "npm is required to build orbit_visualizer frontend assets, "
            "and no prebuilt orbit_visualizer/dist bundle is present."
        )

    print("Building orbit_visualizer frontend bundle via npm run build")
    try:
        subprocess.run([npm, "run", "build"], cwd=repo_root, check=True)
    except subprocess.CalledProcessError as exc:
        if dist_index.is_file():
            print(
                "Frontend build failed; using existing orbit_visualizer/dist assets "
                f"(npm exit={exc.returncode})."
            )
            return
        raise RuntimeError(
            "Frontend build failed and no prebuilt orbit_visualizer/dist bundle is present."
        ) from exc


class build_py(_build_py):
    def run(self) -> None:
        _build_frontend()
        super().run()


class sdist(_sdist):
    def run(self) -> None:
        _build_frontend()
        super().run()


setup(
    cmdclass={
        "build_py": build_py,
        "sdist": sdist,
    }
)
