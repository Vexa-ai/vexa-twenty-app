// Privacy gates. Run BEFORE we POST to Vexa. The line between a useful
// product and a creepy one is whether these primitives lead the
// recording or trail it. They lead.

export type PolicyInput = {
  attendeeEmails: string[];
  ownerEmail: string | null;
  blocklist: string[];
  skipInternalOnly: boolean;
};

export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: 'BLOCKLISTED_DOMAIN' | 'INTERNAL_ONLY' | 'NO_EXTERNAL_ATTENDEE' };

const domainOf = (email: string): string =>
  email.toLowerCase().split('@')[1] ?? '';

export const evaluatePolicy = ({
  attendeeEmails,
  ownerEmail,
  blocklist,
  skipInternalOnly,
}: PolicyInput): PolicyDecision => {
  const normalizedBlocklist = blocklist
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const ownerDomain = ownerEmail ? domainOf(ownerEmail) : null;

  const attendeeDomains = attendeeEmails
    .map(domainOf)
    .filter(Boolean);

  if (attendeeDomains.some((d) => normalizedBlocklist.includes(d))) {
    return { allow: false, reason: 'BLOCKLISTED_DOMAIN' };
  }

  const externalAttendees = ownerDomain
    ? attendeeDomains.filter((d) => d !== ownerDomain)
    : attendeeDomains;

  if (externalAttendees.length === 0) {
    return {
      allow: false,
      reason: skipInternalOnly ? 'INTERNAL_ONLY' : 'NO_EXTERNAL_ATTENDEE',
    };
  }

  return { allow: true };
};

export const parseBlocklist = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map((d) => d.trim()).filter(Boolean);

export const truthy = (v: string | undefined): boolean =>
  v !== undefined && ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
