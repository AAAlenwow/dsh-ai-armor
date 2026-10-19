#!/usr/bin/env bash
# Per-case setup: build the shared fixture then copy to this case's dir.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/../../build-fixture.sh" "$SCRIPT_DIR/sample-app" >/dev/null
