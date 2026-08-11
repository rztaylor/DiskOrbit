#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: scripts/package-artifacts.sh <version-or-tag> <binary-directory> <output-directory>" >&2
  exit 2
fi

version=${1#v}
binary_directory=$2
output_directory=$3

if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'; then
  echo "invalid semantic version: $version" >&2
  exit 2
fi

mkdir -p "$output_directory"
binary_directory=$(CDPATH= cd -- "$binary_directory" && pwd)
output_directory=$(CDPATH= cd -- "$output_directory" && pwd)
package_workspace=$(mktemp -d "${TMPDIR:-/tmp}/diskorbit-release.XXXXXX")
trap 'rm -rf "$package_workspace"' EXIT HUP INT TERM

for target in windows-amd64 windows-arm64 darwin-amd64 darwin-arm64 linux-amd64 linux-arm64; do
  platform=${target%-*}
  architecture=${target#*-}
  artifact_directory="$binary_directory/binary-$platform-$architecture"
  archive_name="diskorbit_${version}_${platform}_${architecture}"

  if [ "$platform" = windows ]; then
    source_binary="$artifact_directory/diskorbit.exe"
    [ -f "$source_binary" ] || { echo "missing release binary: $source_binary" >&2; exit 1; }
    cp "$source_binary" "$package_workspace/diskorbit.exe"
    (cd "$package_workspace" && zip -q -9 "$output_directory/$archive_name.zip" diskorbit.exe)
    rm "$package_workspace/diskorbit.exe"
  else
    source_binary="$artifact_directory/diskorbit"
    [ -f "$source_binary" ] || { echo "missing release binary: $source_binary" >&2; exit 1; }
    cp "$source_binary" "$package_workspace/diskorbit"
    chmod 0755 "$package_workspace/diskorbit"
    tar -czf "$output_directory/$archive_name.tar.gz" -C "$package_workspace" diskorbit
    rm "$package_workspace/diskorbit"
  fi
done

(cd "$output_directory" && LC_ALL=C find . -maxdepth 1 -type f ! -name SHA256SUMS -print | sed 's|^./||' | sort | xargs sha256sum > SHA256SUMS)
(cd "$output_directory" && sha256sum -c SHA256SUMS)
