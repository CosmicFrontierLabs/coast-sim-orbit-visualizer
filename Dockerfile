# syntax=docker/dockerfile:1.7
#
# Public image that serves the orbit-visualizer. The plan payload
# (viz_data.json) is NOT baked in — the visualizer loads it at startup from a
# path or URI (file://, http://, https://) supplied via VIZ_DATA_URI, so the
# image is plan-agnostic, needs no S3 client or credentials, and always serves
# the latest export without a rebuild.
#
# Unlike the former standalone container repo, this image is built from the
# local checkout (COPY . + pip install .), so it always reflects the exact
# commit under test — including open pull requests. coast-sim is still pulled
# from its public git remote.
#
# The image only *serves* a plan payload, so it does not run plan generation and
# needs no mission inputs (GLADE / TLEs / config).
#
# Full (non-slim) image ships git + build tooling, so no apt step is needed.
FROM python:3.12

# Node is only needed to build the orbit-visualizer frontend bundle at install time.
ARG NODE_VERSION=20.18.0

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Node.js from the official tarball (no apt); the frontend build hook runs
# `npm run build` to produce the dist/ bundle when installed from source.
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64) NODE_ARCH=x64 ;; \
      aarch64|arm64) NODE_ARCH=arm64 ;; \
      *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1; \
    node --version; npm --version

# coast-sim is public and installs over plain https. Install it first so the
# local package build below finds the dependency already satisfied.
RUN pip install "coast-sim @ git+https://github.com/CosmicFrontierLabs/coast-sim.git@main"

WORKDIR /src
COPY . /src

# Build + install the visualizer from the local checkout. setup.py's build hook
# runs `npm run build` to produce the frontend bundle packaged into the wheel.
# The source tree is not needed at runtime, so drop it after install.
RUN pip install . \
    && install -m 0755 /src/entrypoint.sh /usr/local/bin/entrypoint.sh \
    && rm -rf /src

WORKDIR /
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
