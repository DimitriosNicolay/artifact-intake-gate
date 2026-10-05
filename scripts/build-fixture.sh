#!/usr/bin/env bash
set -euo pipefail

# This script generates a test fixture for the artifact verification tests.
# Usage: ./scripts/build-fixture.sh <valid|invalid> <output-dir>
# Example: ./scripts/build-fixture.sh valid fixtures/valid-artifact

MODE="$1"
OUT_DIR="$2"

mkdir -p "$OUT_DIR"

PAYLOAD_FILE="$OUT_DIR/payload.txt"
MANIFEST_FILE="$OUT_DIR/manifest.json"

echo "payload content for $MODE test $(date -u +%s)" > "$PAYLOAD_FILE"

CHECKSUM=$(sha256sum "$PAYLOAD_FILE" | awk '{print $1}')

if [ "$MODE" = "invalid" ]; then
  CHECKSUM="${CHECKSUM}tampered"
fi

cat > "$MANIFEST_FILE" <<EOF
{
  "version": "1.0.0",
  "commitSha": "$(openssl rand -hex 6)",
  "checksum": "$CHECKSUM",
  "buildTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Fixture erzeugt in $OUT_DIR:"
echo "  Payload:  $PAYLOAD_FILE"
echo "  Manifest: $MANIFEST_FILE"
echo "  Checksum: $CHECKSUM"