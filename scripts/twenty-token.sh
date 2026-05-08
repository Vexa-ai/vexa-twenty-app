#!/bin/bash
# Mint a Twenty API key + access token from the local dev creds.
# Echoes only the token. Use as: TOK=$(scripts/twenty-token.sh)
set -euo pipefail

TWENTY_URL="${TWENTY_URL:-http://localhost:2020}"
EMAIL="${TWENTY_EMAIL:-tim@apple.dev}"
PASSWORD="${TWENTY_PASSWORD:-tim@apple.dev}"
ORIGIN="${TWENTY_ORIGIN:-http://localhost:3001}"

require() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
require curl
require python3

LT=$(curl -sS "$TWENTY_URL/metadata" -X POST -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation L(\$e:String!,\$p:String!,\$o:String!){ getLoginTokenFromCredentials(email:\$e,password:\$p,origin:\$o){ loginToken{ token } } }\",\"variables\":{\"e\":\"$EMAIL\",\"p\":\"$PASSWORD\",\"o\":\"$ORIGIN\"}}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["getLoginTokenFromCredentials"]["loginToken"]["token"])')

AT=$(curl -sS "$TWENTY_URL/metadata" -X POST -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation T(\$lt:String!,\$o:String!){ getAuthTokensFromLoginToken(loginToken:\$lt,origin:\$o){ tokens{ accessOrWorkspaceAgnosticToken{ token } } } }\",\"variables\":{\"lt\":\"$LT\",\"o\":\"$ORIGIN\"}}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["getAuthTokensFromLoginToken"]["tokens"]["accessOrWorkspaceAgnosticToken"]["token"])')

echo "$AT"
