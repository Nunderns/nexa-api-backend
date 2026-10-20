import { Prisma } from '@prisma/client';

/**
 * Restricts a post query to communities the viewer may read: every public
 * community, plus private ones where the viewer is a member who isn't banned.
 * Anonymous viewers only see public communities.
 */
export function visibleCommunityWhere(
  viewerId?: number,
): Prisma.CommunityWhereInput {
  if (!viewerId) {
    return { isPrivate: false };
  }

  return {
    OR: [
      { isPrivate: false },
      { members: { some: { userId: viewerId, bannedAt: null } } },
    ],
  };
}
