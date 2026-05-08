// Attendee → Person → Company → Opportunity resolution.
//
// "Mapping is the value." A Call without these links is just metadata;
// with them, every later release (viewer, skills, agent) is a single
// GraphQL query away.
//
// Heuristic: tight + cheap, deliberately conservative. Ambiguous
// cases (>1 candidate) leave fields null rather than guess wrong.

import type { CoreApiClient } from 'twenty-client-sdk/core';

// Stages we treat as "still in flight." CUSTOMER = won; everything
// else is open. Twenty doesn't have a closed-lost stage.
const ACTIVE_OPP_STAGES = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL'];

export type Linkage = {
  companyId: string | null;
  opportunityId: string | null;
  matchedPersonIds: string[];
};

export const resolveLinkage = async (
  client: CoreApiClient,
  attendeeEmails: string[],
): Promise<Linkage> => {
  if (attendeeEmails.length === 0) {
    return { companyId: null, opportunityId: null, matchedPersonIds: [] };
  }

  // Look up People by primaryEmail. We accept a per-email miss
  // silently — the right behavior is "link what we can" rather than
  // "fail the whole resolution."
  const peoplePerEmail = await Promise.all(
    attendeeEmails.map((email) =>
      (client.query({
        people: {
          __args: {
            filter: { emails: { primaryEmail: { eq: email } } } as any,
            first: 1,
          } as any,
          edges: { node: { id: true, companyId: true } as any },
        },
      } as any) as Promise<any>).catch(() => null),
    ),
  );

  const matched = peoplePerEmail
    .map((r) => r?.people?.edges?.[0]?.node)
    .filter((p) => p && p.id) as { id: string; companyId: string | null }[];

  if (matched.length === 0) {
    return { companyId: null, opportunityId: null, matchedPersonIds: [] };
  }

  // Majority vote on companyId across matched attendees.
  const companyVotes = new Map<string, number>();
  for (const p of matched) {
    if (!p.companyId) continue;
    companyVotes.set(p.companyId, (companyVotes.get(p.companyId) ?? 0) + 1);
  }
  const companyId = pickMajority(companyVotes);

  if (!companyId) {
    return {
      companyId: null,
      opportunityId: null,
      matchedPersonIds: matched.map((p) => p.id),
    };
  }

  // Find an open Opportunity for that company. Set the link only if
  // there's exactly one — ambiguity is a feature, not a bug.
  const opps = (await (client.query({
    opportunities: {
      __args: {
        filter: {
          companyId: { eq: companyId },
          stage: { in: ACTIVE_OPP_STAGES },
        } as any,
        first: 5,
      } as any,
      edges: { node: { id: true, stage: true } as any },
    },
  } as any) as Promise<any>).catch(() => null)) as any;

  const oppEdges: { node: { id: string } }[] =
    opps?.opportunities?.edges ?? [];
  const opportunityId = oppEdges.length === 1 ? oppEdges[0].node.id : null;

  return {
    companyId,
    opportunityId,
    matchedPersonIds: matched.map((p) => p.id),
  };
};

const pickMajority = (votes: Map<string, number>): string | null => {
  let bestKey: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [k, n] of votes) {
    if (n > bestCount) {
      bestKey = k;
      bestCount = n;
      tied = false;
    } else if (n === bestCount) {
      tied = true;
    }
  }
  // Tie → no winner. Conservative default.
  return tied ? null : bestKey;
};
