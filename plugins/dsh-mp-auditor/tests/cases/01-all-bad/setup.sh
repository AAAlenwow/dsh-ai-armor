#!/usr/bin/env bash
set -euo pipefail
bash "$(dirname "$0")/../../build-fixture.sh" "$(cd "$(dirname "$0")" && pwd)/sample-app"
