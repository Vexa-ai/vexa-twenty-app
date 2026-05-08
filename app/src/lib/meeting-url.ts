import { CallPlatform } from 'src/objects/call.object';
import type { VexaPlatform } from 'src/lib/vexa-client';

const GOOGLE_MEET_RE = /https?:\/\/meet\.google\.com\/([a-z0-9-]+)/i;
const ZOOM_RE = /https?:\/\/[a-z0-9.-]*zoom\.us\/j\/(\d+)/i;
const TEAMS_RE = /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/([^"\s>]+)/i;

export type ParsedMeeting = {
  platform: CallPlatform;
  vexaPlatform: VexaPlatform | null;
  nativeId: string;
  url: string;
};

// Identify the conference platform + native id from a calendar event's
// conference URL. Returns null when the URL is not a recognized
// platform — those events are not eligible for autopilot.
export const parseMeetingUrl = (rawUrl: string): ParsedMeeting | null => {
  if (!rawUrl) return null;

  const meet = rawUrl.match(GOOGLE_MEET_RE);
  if (meet) {
    return {
      platform: CallPlatform.GOOGLE_MEET,
      vexaPlatform: 'google_meet',
      nativeId: meet[1],
      url: meet[0],
    };
  }

  const zoom = rawUrl.match(ZOOM_RE);
  if (zoom) {
    return {
      platform: CallPlatform.ZOOM,
      vexaPlatform: 'zoom',
      nativeId: zoom[1],
      url: zoom[0],
    };
  }

  const teams = rawUrl.match(TEAMS_RE);
  if (teams) {
    return {
      platform: CallPlatform.TEAMS,
      vexaPlatform: 'teams',
      nativeId: decodeURIComponent(teams[1]),
      url: teams[0],
    };
  }

  return null;
};
