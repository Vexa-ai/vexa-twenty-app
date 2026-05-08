#!/usr/bin/env python3
"""Build an HMAC-signed Vexa webhook payload for testing.

Usage:
  scripts/sign-webhook.py [--secret SECRET] [--event meeting.completed]
                         [--meeting-id MID] [--platform google_meet]
"""

import argparse
import hashlib
import hmac
import json
import os
import sys
import uuid
from datetime import datetime, timezone


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--secret", default=os.environ.get("VEXA_WEBHOOK_SECRET", "dev-secret"))
    p.add_argument("--event", default="meeting.completed",
                   choices=["meeting.scheduled", "meeting.started",
                            "meeting.completed", "meeting.failed",
                            "meeting.cancelled"])
    p.add_argument("--meeting-id", default=f"google_meet:test-{uuid.uuid4().hex[:8]}")
    p.add_argument("--platform", default="google_meet")
    p.add_argument("--native-id", default="abc-defg-hij")
    p.add_argument("--meeting-url", default="https://meet.google.com/abc-defg-hij")
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
                "status": args.event.split(".")[1],
            },
        },
    }
    raw = json.dumps(body, separators=(",", ":"))
    sig = hmac.new(args.secret.encode(), raw.encode(), hashlib.sha256).hexdigest()

    # The shape executeOneLogicFunction expects for an HTTP-route handler:
    payload = {
        "headers": {"x-webhook-signature": sig, "content-type": "application/json"},
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
