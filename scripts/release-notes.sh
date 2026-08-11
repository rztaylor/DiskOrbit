#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/release-notes.sh <version-or-tag>" >&2
  exit 2
fi

version=${1#v}

awk -v heading="## [$version]" '
  $0 == heading || index($0, heading " - ") == 1 {
    found = 1
    print
    next
  }
  found && /^## \[/ { exit }
  found { print }
  END {
    if (!found) {
      print "CHANGELOG.md has no section for " heading > "/dev/stderr"
      exit 1
    }
  }
' CHANGELOG.md
