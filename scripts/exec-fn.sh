#!/bin/bash
# Manually invoke a logic function via Twenty's metadata GraphQL.
# Usage: scripts/exec-fn.sh <function-name> <payload-json>
# Examples:
#   scripts/exec-fn.sh vexa-cron-dispatch '{}'
#   scripts/exec-fn.sh vexa-webhook "$(cat fixtures/webhook.json)"
set -euo pipefail

TWENTY_URL="${TWENTY_URL:-http://localhost:2020}"
NAME="${1:?function name required}"
PAYLOAD="${2:-{}}"

DIR="$(cd "$(dirname "$0")" && pwd)"
TOK=$(bash "$DIR/twenty-token.sh")

ID=$(curl -sS "$TWENTY_URL/metadata" -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK" \
  -d '{"query":"{ findManyLogicFunctions{ id name } }"}' \
  | python3 -c "import sys,json
d=json.load(sys.stdin)['data']['findManyLogicFunctions']
m=[f for f in d if f['name']=='$NAME']
print(m[0]['id'] if m else '')")

if [ -z "$ID" ]; then
  echo "function not found: $NAME" >&2
  echo "available:" >&2
  curl -sS "$TWENTY_URL/metadata" -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOK" \
    -d '{"query":"{ findManyLogicFunctions{ name } }"}' \
    | python3 -c 'import sys,json
for f in json.load(sys.stdin)["data"]["findManyLogicFunctions"]: print("  "+f["name"])' >&2
  exit 2
fi

curl -sS "$TWENTY_URL/metadata" -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK" \
  -d "$(python3 -c "
import json,sys
print(json.dumps({
  'query':'mutation E(\$i:ExecuteOneLogicFunctionInput!){ executeOneLogicFunction(input:\$i){ status duration data error logs } }',
  'variables':{'i':{'id':'$ID','payload':json.loads(r'''$PAYLOAD''')}},
}))")" | python3 -m json.tool
