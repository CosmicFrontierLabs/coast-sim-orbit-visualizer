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
        # In isolated build environments, node_modules is often missing.
        # Install JS deps (including dev deps like vite) and retry once.
        install_cmd = [npm, "ci", "--include=dev"]
        if not (repo_root / "package-lock.json").is_file():
            install_cmd = [npm, "install", "--include=dev"]

        print(
            "Frontend build failed; attempting to install npm dependencies "
            f"and retry (npm exit={exc.returncode})."
        )
        try:
            subprocess.run(install_cmd, cwd=repo_root, check=True)
            subprocess.run([npm, "run", "build"], cwd=repo_root, check=True)
            return
        except subprocess.CalledProcessError as retry_exc:
            if dist_index.is_file():
                print(
                    "Frontend build failed after retry; using existing "
                    "orbit_visualizer/dist assets "
                    f"(npm exit={retry_exc.returncode})."
                )
                return

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
        # Remove previously copied frontend assets from build/lib to avoid
        # stale hashed bundles being carried across wheel builds.
        build_dist = Path(self.build_lib) / "orbit_visualizer" / "dist"
        if build_dist.is_dir():
            shutil.rmtree(build_dist)
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
