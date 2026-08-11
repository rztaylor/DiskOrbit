#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

diskorbit_version=${DISKORBIT_VERSION:-dev}
diskorbit_commit=${DISKORBIT_COMMIT:-unknown}
diskorbit_build_date=${DISKORBIT_BUILD_DATE:-unknown}

npm --cache "$project_root/.cache/npm" --prefix frontend run build
mkdir -p "$project_root/.cache/go-build" "$project_root/build"

GOCACHE="$project_root/.cache/go-build" go build -trimpath \
  -ldflags "-X github.com/rztaylor/diskorbit/internal/buildinfo.Version=$diskorbit_version -X github.com/rztaylor/diskorbit/internal/buildinfo.Commit=$diskorbit_commit -X github.com/rztaylor/diskorbit/internal/buildinfo.BuildDate=$diskorbit_build_date" \
  -o "$project_root/build/diskorbit" ./cmd/diskorbit

