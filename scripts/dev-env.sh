#!/usr/bin/env bash
# Usage: source scripts/dev-env.sh

if ! floci status &> /dev/null; then
  floci start
  sleep 3
fi

eval "$(floci env)"
echo "AWS_ENDPOINT_URL: $AWS_ENDPOINT_URL"

if ! aws cloudformation describe-stacks --stack-name CDKToolkit &> /dev/null; then
  npx cdk bootstrap
else
  echo "CDK already bootstrapped."
fi