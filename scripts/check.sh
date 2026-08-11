#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

npm --cache "$project_root/.cache/npm" --prefix frontend ci
npm --cache "$project_root/.cache/npm" --prefix frontend run lint
npm --cache "$project_root/.cache/npm" --prefix frontend test
npm --cache "$project_root/.cache/npm" --prefix frontend run build

unformatted=$(gofmt -l cmd internal)
if [ -n "$unformatted" ]; then
  echo "Go files need formatting:" >&2
  echo "$unformatted" >&2
  exit 1
fi

mkdir -p "$project_root/.cache/go-build" "$project_root/build"
GOCACHE="$project_root/.cache/go-build" go test ./...
GOCACHE="$project_root/.cache/go-build" go test -race ./...
GOCACHE="$project_root/.cache/go-build" go vet ./...
GOCACHE="$project_root/.cache/go-build" go build -o "$project_root/build/diskorbit" ./cmd/diskorbit
