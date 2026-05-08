#!/usr/bin/env python3
"""Build an HMAC-signed Vexa webhook payload for testing.

Mirrors the contract in
/home/dima/dev/vexa/services/meeting-api/meeting_api/webhook_delivery.py:

  signed_content = f"{timestamp}.".encode() + body_bytes
  sig            = hmac.sha256(secret, signed_content).hexdigest()
  X-Webhook-Signature: sha256=<hex>
  X-Webhook-Timestamp: <unix-ts>

Usage:
  scripts/sign-webhook.py [--secret SECRET]
                         [--event meeting.completed]
                         [--meeting-id 123]
                         [--platform google_meet]
                         [--status completed]
"""

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--secret",
        default=os.environ.get("VEXA_WEBHOOK_SECRET", "dev-secret"),
    )
    p.add_argument(
        "--event",
        default="meeting.completed",
        choices=[
            "meeting.completed",
            "meeting.started",
            "bot.failed",
            "meeting.status_change",
        ],
    )
    p.add_argument("--meeting-id", type=int, default=10001)
    p.add_argument("--platform", default="google_meet")
    p.add_argument("--native-id", default="abc-defg-hij")
    p.add_argument(
        "--meeting-url", default="https://meet.google.com/abc-defg-hij"
    )
    p.add_argument(
        "--status",
        default=None,
        help="meeting.data.meeting.status (only meaningful for meeting.status_change)",
    )
    args = p.parse_args()

    body = {
        "event_id": f"evt_{uuid.uuid4().hex}",
        "event_type": args.event,
        "api_version": "2026-03-01",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data": {
            "meeting": {
                "id": args.meeting_id,
                "platform": args.platform,
                "native_meeting_id": args.native_id,
                "constructed_meeting_url": args.meeting_url,
                "status": args.status or args.event.split(".")[1],
                "start_time": None,
                "end_time": None,
                "data": {},
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        },
    }
    raw = json.dumps(body, separators=(",", ":"))
    ts = str(int(time.time()))
    signed_content = f"{ts}.".encode() + raw.encode()
    sig = hmac.new(args.secret.encode(), signed_content, hashlib.sha256).hexdigest()

    payload = {
        "headers": {
            "x-webhook-signature": f"sha256={sig}",
            "x-webhook-timestamp": ts,
            "authorization": f"Bearer {args.secret}",
            "content-type": "application/json",
        },
        "queryStringParameters": {},
        "pathParameters": {},
        "body": body,
        "rawBody": raw,
        "isBase64Encoded": False,
        "requestContext": {"http": {"method": "POST", "path": "/vexa/ingest"}},
        "userWorkspaceId": None,
    }
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
