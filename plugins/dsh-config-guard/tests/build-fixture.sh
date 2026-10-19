#!/usr/bin/env bash
# tests/build-fixture.sh
# Create config files at the absolute target dir passed as $1.
set -euo pipefail

ROOT="${1:?usage: build-fixture.sh <absolute-target-dir>}"
mkdir -p "${ROOT}"

cat > "${ROOT}/application.yml" <<'YAML'
server:
  port: 8080
  host: localhost
  ssl:
    enabled: true
dataSource:
  url: jdbc:mysql://localhost:3306/app
  username: app
  password: secret
logging:
  level: INFO
  appenders:
    - console
    - file
features:
  legacyMode: false
YAML

cat > "${ROOT}/application-with-dupes.yml" <<'YAML'
server:
  port: 8080
app:
  name: first
dataSource:
  url: jdbc:mysql://localhost/app
app:
  name: second
YAML

cat > "${ROOT}/application-with-tabs.yml" <<'YAML'
server:
  port: 8080
	host: localhost
dataSource:
  url: jdbc:mysql://localhost/app
YAML

cat > "${ROOT}/.env" <<'ENV'
# Sample .env file
APP_NAME=myapp
DB_HOST = localhost
1BAD_KEY=value
export DEBUG=true
LOG_LEVEL=info
ENV

cat > "${ROOT}/.env.bad-format" <<'ENV'
GOOD=value
KEY = WITH SPACES
bad name=foo
NORMAL=yes
ENV

cat > "${ROOT}/application-typo.yml" <<'YAML'
server:
  port: 8080
datasource:
  url: jdbc:mysql://localhost/app
logging:
  level: INFO
YAML

cat > "${ROOT}/application-missing.yml" <<'YAML'
server:
  port: 8080
logging:
  level: INFO
YAML
