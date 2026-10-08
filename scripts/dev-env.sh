#!/usr/bin/env bash
# Usage: source scripts/dev-env.sh

if [ "$(docker inspect --format '{{.State.Running}}' floci 2>/dev/null)" != "true" ]; then
  floci start || return 1
fi

eval "$(floci env)"
export AWS_ENDPOINT_URL="http://127.0.0.1:4566"

echo "Checking connection to floci..."
aws sts get-caller-identity \
  --cli-connect-timeout 3 \
  --cli-read-timeout 3 || return 1
