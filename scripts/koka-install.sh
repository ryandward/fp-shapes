#!/bin/sh
# Installs the pinned Koka compiler under .koka-prefix/ in the working
# directory, where scripts/koka-build.mjs looks for it. The version is the one
# the cores pin in their koka.json; a different compiler does not build them.
#
#   sh scripts/koka-install.sh            # installs 3.2.9
#   KOKA_VERSION=3.2.9 sh scripts/koka-install.sh
#
# The official installer fetches the release from GitHub; --minimal skips the
# editor integrations, --force reinstalls over an existing prefix. The
# compiler needs a UTF-8 locale to run, which the build script sets.
set -eu
version="${KOKA_VERSION:-3.2.9}"
prefix="$(pwd)/.koka-prefix"
curl -sSL "https://github.com/koka-lang/koka/releases/download/v${version}/install.sh" | sh -s -- --prefix="$prefix" --minimal --force
LANG=C.UTF-8 LC_ALL=C.UTF-8 "$prefix/bin/koka" --version | head -1
