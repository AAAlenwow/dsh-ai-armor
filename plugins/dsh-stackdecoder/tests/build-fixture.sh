#!/usr/bin/env bash
# Build a tiny fixture project for dsh-stackdecoder tests.
# Produces a project with several throw points in different files so the
# tests can paste real stack traces that the decoder can resolve.

set -euo pipefail
TARGET="${1:?Usage: build-fixture.sh <target-dir>}"

rm -rf "$TARGET"
mkdir -p "$TARGET/src"
cd "$TARGET"

# A real Node.js file that throws — the test will paste its stack trace.
cat > src/server.js <<'EOF'
// src/server.js — fixture for dsh-stackdecoder
const { handleRequest } = require('./handler.js');

function start() {
  try {
    handleRequest('/api/users');
  } catch (e) {
    console.error('Crashed:', e);
    process.exit(1);
  }
}

start();
EOF

# The handler that actually throws — this is the file the trace should point to.
cat > src/handler.js <<'EOF'
// src/handler.js — fixture for dsh-stackdecoder
function getUserById(id) {
  if (id == null) {
    throw new TypeError('id is required');  // <-- bug location
  }
  return { id, name: 'mock' };
}

function handleRequest(path) {
  const id = null;  // intentionally null to trigger the throw
  return getUserById(id);
}

module.exports = { handleRequest, getUserById };
EOF

# Python file (not run, just there for the python-trace test to reference).
cat > src/auth.py <<'PYEOF'
# src/auth.py — fixture for dsh-stackdecoder (Python trace)

def validate_token(token):
    if not token:
        raise ValueError("token is empty")
    return token

def login(username, password):
    validate_token(None)  # triggers the throw
    return None
PYEOF

# Java file (also just for reference; we won't run it).
cat > src/PaymentService.java <<'JEOF'
// src/PaymentService.java — fixture for dsh-stackdecoder (Java trace)
package com.example;
public class PaymentService {
    public void charge(String cardNumber) {
        if (cardNumber == null) {
            throw new IllegalArgumentException("cardNumber is null");
        }
    }
}
JEOF

echo "Built fixture in $TARGET"
ls -la src/
