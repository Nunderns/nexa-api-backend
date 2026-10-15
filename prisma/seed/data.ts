/**
 * Fictional development dataset.
 *
 * Every person, community, and piece of content below is invented. Emails use
 * the reserved `example.com` domain and media URLs point to a non-resolving
 * placeholder host, so nothing here maps to real people or services.
 *
 * Records reference each other by natural keys (username, community name, post
 * key) instead of database IDs; the seed runner resolves the IDs at runtime.
 */
import { CommunityRole, PostType } from '@prisma/client';

export const MEDIA_BASE_URL = 'https://media.nexa.example.com';

export interface SeedUser {
  username: string;
  displayName: string;
  bio?: string;
  hasAvatar?: boolean;
  isActive?: boolean;
  /** How long ago the account was created, in hours. */
  joinedHoursAgo: number;
}

export interface SeedMembership {
  username: string;
  role: CommunityRole;
  banned?: boolean;
}

export interface SeedCommunity {
  name: string;
  displayName: string;
  description: string;
  creator: string;
  isPrivate?: boolean;
  isNsfw?: boolean;
  createdHoursAgo: number;
  /** The creator is added automatically as OWNER. */
  members: SeedMembership[];
}

export interface SeedMedia {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SeedComment {
  author: string;
  content: string;
  hoursAfterPost: number;
  isDeleted?: boolean;
  media?: SeedMedia;
  replies?: SeedComment[];
}

export interface SeedPost {
  key: string;
  community: string;
  author: string;
  title: string;
  content?: string;
  postType: PostType;
  createdHoursAgo: number;
  isPinned?: boolean;
  isLocked?: boolean;
  isDeleted?: boolean;
  media?: SeedMedia[];
  comments?: SeedComment[];
}

export interface SeedRefreshToken {
  username: string;
  /** Distinguishes multiple tokens of the same user; part of the token hash. */
  label: string;
  expiresInHours: number;
  revoked?: boolean;
}

/**
 * Reach profile of a post, used to generate a plausible analytics history.
 *
 * Only posts that need an insights panel have an entry; the rest simply have
 * no views, which is a valid state the UI has to render anyway.
 */
export interface SeedPostInsights {
  /** `key` of the post this profile belongs to. */
  postKey: string;
  /**
   * Views accumulated in the first hour after publication. Later hours are
   * derived from it, so this is the knob that sets the scale of the chart.
   */
  firstHourViews: number;
  /**
   * Share of traffic that decays away over time. Values below 1 keep a long
   * tail; values above 1 would make an old post look like it is accelerating.
   */
  decay: number;
  /** ISO 3166-1 alpha-2 code and its share of the post's views. */
  countries: { code: string; share: number }[];
  shares?: number;
  reposts?: number;
  awards?: number;
}

export const users: SeedUser[] = [
  {
    username: 'lena_marlow',
    displayName: 'Lena Marlow',
    bio: 'Platform admin on the Nexa dev environment. Coffee first, then code review.',
    hasAvatar: true,
    joinedHoursAgo: 24 * 120,
  },
  {
    username: 'otto_brandt',
    displayName: 'Otto Brandt',
    bio: 'Backend engineer. Strong opinions about type systems, loosely held.',
    hasAvatar: true,
    joinedHoursAgo: 24 * 110,
  },
  {
    username: 'mira_okafor',
    displayName: 'Mira Okafor',
    bio: 'Home roaster, pour-over evangelist, occasional latte artist.',
    hasAvatar: true,
    joinedHoursAgo: 24 * 98,
  },
  {
    username: 'kenji_arai',
    displayName: 'Kenji Arai',
    bio: 'Making tiny pixel-art games on weekends.',
    hasAvatar: true,
    joinedHoursAgo: 24 * 90,
  },
  {
    username: 'sol_varga',
    displayName: 'Sol Varga',
    bio: 'Ultra runner. If there is a hill, I am probably on it.',
    joinedHoursAgo: 24 * 75,
  },
  {
    username: 'theo_quill',
    displayName: 'Theo Quill',
    bio: 'Student. Learning TypeScript one compiler error at a time.',
    joinedHoursAgo: 24 * 60,
  },
  {
    username: 'ivy_castell',
    displayName: 'Ivy Castell',
    hasAvatar: true,
    joinedHoursAgo: 24 * 45,
  },
  {
    username: 'rafa_nunes',
    displayName: 'Rafa Nunes',
    bio: 'Frontend dev by day, trail runner by dawn.',
    joinedHoursAgo: 24 * 40,
  },
  {
    username: 'juno_park',
    displayName: 'Juno Park',
    bio: 'Sound designer for indie games. Ask me about foley.',
    hasAvatar: true,
    joinedHoursAgo: 24 * 30,
  },
  {
    username: 'dormant_dan',
    displayName: 'Dormant Dan',
    bio: 'This account has been deactivated.',
    isActive: false,
    joinedHoursAgo: 24 * 200,
  },
];

export const communities: SeedCommunity[] = [
  {
    name: 'typescript_lab',
    displayName: 'TypeScript Lab',
    description:
      'Patterns, pitfalls, and questions about TypeScript and its ecosystem.',
    creator: 'otto_brandt',
    createdHoursAgo: 24 * 100,
    members: [
      { username: 'kenji_arai', role: CommunityRole.MODERATOR },
      { username: 'lena_marlow', role: CommunityRole.MEMBER },
      { username: 'theo_quill', role: CommunityRole.MEMBER },
      { username: 'juno_park', role: CommunityRole.MEMBER },
      { username: 'rafa_nunes', role: CommunityRole.MEMBER },
      { username: 'ivy_castell', role: CommunityRole.MEMBER },
      { username: 'dormant_dan', role: CommunityRole.MEMBER },
    ],
  },
  {
    name: 'homebrew_coffee',
    displayName: 'Homebrew Coffee',
    description:
      'Brewing methods, grinders, beans, and the endless quest for the perfect cup.',
    creator: 'mira_okafor',
    createdHoursAgo: 24 * 95,
    members: [
      { username: 'ivy_castell', role: CommunityRole.MODERATOR },
      { username: 'sol_varga', role: CommunityRole.MEMBER },
      { username: 'rafa_nunes', role: CommunityRole.MEMBER },
      { username: 'theo_quill', role: CommunityRole.MEMBER },
      { username: 'juno_park', role: CommunityRole.MEMBER },
      { username: 'lena_marlow', role: CommunityRole.MEMBER },
    ],
  },
  {
    name: 'trail_runners',
    displayName: 'Trail Runners',
    description:
      'Routes, gear, training plans, and race reports from the dirt.',
    creator: 'sol_varga',
    createdHoursAgo: 24 * 70,
    members: [
      { username: 'rafa_nunes', role: CommunityRole.MODERATOR },
      { username: 'mira_okafor', role: CommunityRole.MEMBER },
      { username: 'lena_marlow', role: CommunityRole.MEMBER },
      { username: 'juno_park', role: CommunityRole.MEMBER },
    ],
  },
  {
    name: 'indie_gamedev',
    displayName: 'Indie Game Dev',
    description:
      'Share your progress, get feedback, and talk shop about making games.',
    creator: 'kenji_arai',
    createdHoursAgo: 24 * 85,
    members: [
      { username: 'juno_park', role: CommunityRole.MODERATOR },
      { username: 'theo_quill', role: CommunityRole.MEMBER },
      { username: 'otto_brandt', role: CommunityRole.MEMBER },
      { username: 'ivy_castell', role: CommunityRole.MEMBER },
      { username: 'rafa_nunes', role: CommunityRole.MEMBER },
      { username: 'dormant_dan', role: CommunityRole.MEMBER, banned: true },
    ],
  },
  {
    name: 'nexa_staff',
    displayName: 'Nexa Staff',
    description: 'Private space for the fictional Nexa moderation team.',
    creator: 'lena_marlow',
    isPrivate: true,
    createdHoursAgo: 24 * 115,
    members: [
      { username: 'otto_brandt', role: CommunityRole.MODERATOR },
      { username: 'mira_okafor', role: CommunityRole.MEMBER },
    ],
  },
];

export const posts: SeedPost[] = [
  // typescript_lab
  {
    key: 'ts-welcome',
    community: 'typescript_lab',
    author: 'otto_brandt',
    title: 'Welcome to TypeScript Lab — read this before posting',
    content:
      'Be kind, include a minimal reproduction when asking for help, and use the playground link when you can. Questions of every level are welcome.',
    postType: PostType.TEXT,
    createdHoursAgo: 24 * 99,
    isPinned: true,
    isLocked: true,
  },
  {
    key: 'ts-satisfies',
    community: 'typescript_lab',
    author: 'theo_quill',
    title: 'When should I use `satisfies` instead of a type annotation?',
    content:
      'I keep seeing `satisfies` in config files. As far as I can tell it checks the shape but keeps the literal types? Is there a rule of thumb?',
    postType: PostType.TEXT,
    createdHoursAgo: 52,
    comments: [
      {
        author: 'otto_brandt',
        content:
          'Rule of thumb: annotate when you want the declared type to win, use `satisfies` when you want validation but keep the inferred (narrower) type.',
        hoursAfterPost: 1,
        replies: [
          {
            author: 'theo_quill',
            content: 'That clicked immediately, thanks!',
            hoursAfterPost: 2,
          },
          {
            author: 'kenji_arai',
            content:
              'Also great for lookup tables: you get autocomplete on the keys without widening them to `string`.',
            hoursAfterPost: 3,
          },
        ],
      },
      {
        author: 'ivy_castell',
        content:
          'I mostly use it for route maps and theme tokens. Saved me from a few typos already.',
        hoursAfterPost: 5,
      },
    ],
  },
  {
    key: 'ts-strict-migration',
    community: 'typescript_lab',
    author: 'lena_marlow',
    title: 'Migrating a 40k line codebase to strict mode, incrementally',
    content:
      'We enabled `strictNullChecks` first, fixed errors module by module behind a lint rule, then turned on `noImplicitAny`. Took six weeks of background work. Happy to answer questions.',
    postType: PostType.TEXT,
    createdHoursAgo: 20,
    comments: [
      {
        author: 'rafa_nunes',
        content: 'Did you use any codemods or was it all by hand?',
        hoursAfterPost: 2,
        replies: [
          {
            author: 'lena_marlow',
            content:
              'Mostly by hand. A codemod added `// @ts-expect-error` to existing errors so the build stayed green while we worked through them.',
            hoursAfterPost: 3,
          },
        ],
      },
      {
        author: 'juno_park',
        content: 'Saving this for when we inevitably do the same.',
        hoursAfterPost: 6,
      },
    ],
  },

  // homebrew_coffee
  {
    key: 'coffee-v60-recipe',
    community: 'homebrew_coffee',
    author: 'mira_okafor',
    title: 'My everyday V60 recipe (15g : 250g)',
    content:
      '15g medium-fine, 50g bloom for 45s, then pour to 150g by 1:15 and 250g by 2:00. Total drawdown around 3:00. Adjust grind before anything else.',
    postType: PostType.TEXT,
    createdHoursAgo: 72,
    isPinned: true,
    comments: [
      {
        author: 'sol_varga',
        content: 'Tried this with a washed Ethiopian this morning. So bright!',
        hoursAfterPost: 10,
      },
      {
        author: 'theo_quill',
        content: 'What water temperature do you use?',
        hoursAfterPost: 12,
        replies: [
          {
            author: 'mira_okafor',
            content:
              'Right off the boil for light roasts, around 90°C for anything darker.',
            hoursAfterPost: 13,
          },
        ],
      },
    ],
  },
  {
    key: 'coffee-latte-art',
    community: 'homebrew_coffee',
    author: 'ivy_castell',
    title: 'First rosetta that actually looks like a rosetta',
    postType: PostType.IMAGE,
    createdHoursAgo: 30,
    media: [
      {
        storageKey: 'posts/coffee-latte-art/rosetta.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 482_113,
      },
    ],
    comments: [
      {
        author: 'mira_okafor',
        content: 'Look at that symmetry! Months of practice paying off.',
        hoursAfterPost: 1,
      },
      {
        author: 'rafa_nunes',
        content: 'Mine still look like a sad tulip. Here is today’s attempt:',
        hoursAfterPost: 4,
        media: {
          storageKey: 'comments/coffee-latte-art/sad-tulip.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 311_904,
        },
        replies: [
          {
            author: 'ivy_castell',
            content: 'Honestly not bad. Pour a bit faster at the end.',
            hoursAfterPost: 5,
          },
        ],
      },
    ],
  },
  {
    key: 'coffee-grinder',
    community: 'homebrew_coffee',
    author: 'juno_park',
    title: 'Hand grinder recommendations under a modest budget?',
    content:
      'Mostly brewing pour-over and the occasional AeroPress. Looking for consistency over speed.',
    postType: PostType.TEXT,
    createdHoursAgo: 8,
    comments: [
      {
        author: 'lena_marlow',
        content:
          'Look for steel conical burrs and a stepped adjustment you can repeat. Everything else is a bonus.',
        hoursAfterPost: 1,
      },
      {
        author: 'theo_quill',
        content: 'This comment was removed by the author.',
        hoursAfterPost: 2,
        isDeleted: true,
      },
    ],
  },

  // trail_runners
  {
    key: 'trail-first-50k',
    community: 'trail_runners',
    author: 'sol_varga',
    title: 'Race report: my first 50k on the Ridgeback Loop',
    content:
      'Started too fast, walked every climb after km 30, and still finished smiling. Biggest lesson: eat before you are hungry.',
    postType: PostType.TEXT,
    createdHoursAgo: 96,
    comments: [
      {
        author: 'rafa_nunes',
        content: 'Congrats! What did you use for fuel?',
        hoursAfterPost: 3,
        replies: [
          {
            author: 'sol_varga',
            content:
              'Gels every 40 minutes and boiled potatoes at the aid stations.',
            hoursAfterPost: 4,
          },
        ],
      },
      {
        author: 'juno_park',
        content: 'Eat before you are hungry should be on a t-shirt.',
        hoursAfterPost: 9,
      },
    ],
  },
  {
    key: 'trail-sunrise-video',
    community: 'trail_runners',
    author: 'rafa_nunes',
    title: 'Sunrise descent on the north ridge (90 seconds)',
    postType: PostType.VIDEO,
    createdHoursAgo: 40,
    media: [
      {
        storageKey: 'posts/trail-sunrise-video/descent.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 18_734_022,
      },
    ],
    comments: [
      {
        author: 'mira_okafor',
        content: 'Those colors! Worth the 4am alarm.',
        hoursAfterPost: 2,
      },
    ],
  },
  {
    key: 'trail-shoe-guide',
    community: 'trail_runners',
    author: 'lena_marlow',
    title: 'A beginner-friendly guide to choosing trail shoes',
    content: 'https://blog.nexa.example.com/guides/choosing-trail-shoes',
    postType: PostType.LINK,
    createdHoursAgo: 14,
  },

  // indie_gamedev
  {
    key: 'gamedev-devlog-12',
    community: 'indie_gamedev',
    author: 'kenji_arai',
    title: 'Devlog #12: new lighting system for Lantern Hollow',
    content:
      'Swapped baked shadows for a simple 2D light mask. Performance is fine on low-end laptops and the caves finally feel spooky.',
    postType: PostType.IMAGE,
    createdHoursAgo: 60,
    media: [
      {
        storageKey: 'posts/gamedev-devlog-12/before.png',
        mimeType: 'image/png',
        sizeBytes: 1_204_551,
      },
      {
        storageKey: 'posts/gamedev-devlog-12/after.png',
        mimeType: 'image/png',
        sizeBytes: 1_318_207,
      },
    ],
    comments: [
      {
        author: 'juno_park',
        content:
          'The after shot is so much moodier. Want me to try an ambient drip loop for the caves?',
        hoursAfterPost: 2,
        replies: [
          {
            author: 'kenji_arai',
            content: 'Yes please! Sending you a build tonight.',
            hoursAfterPost: 3,
          },
        ],
      },
      {
        author: 'otto_brandt',
        content: 'How are you handling light occlusion with the tilemap?',
        hoursAfterPost: 6,
        replies: [
          {
            author: 'kenji_arai',
            content:
              'Raycasting against a coarse collision grid, then blurring the mask. Cheap and good enough.',
            hoursAfterPost: 8,
            replies: [
              {
                author: 'otto_brandt',
                content: 'Clever. Stealing this.',
                hoursAfterPost: 9,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'gamedev-scope-creep',
    community: 'indie_gamedev',
    author: 'theo_quill',
    title: 'How do you stop scope creep on a solo project?',
    content:
      'My "small platformer" now has crafting, a dialogue system, and a fishing minigame. Send help.',
    postType: PostType.TEXT,
    createdHoursAgo: 26,
    comments: [
      {
        author: 'ivy_castell',
        content:
          'Write the one-sentence pitch on a sticky note. If a feature does not serve it, it goes into a "sequel" file.',
        hoursAfterPost: 1,
      },
      {
        author: 'rafa_nunes',
        content:
          'Keep the fishing minigame. Everyone loves a fishing minigame.',
        hoursAfterPost: 3,
      },
    ],
  },
  {
    key: 'gamedev-jam',
    community: 'indie_gamedev',
    author: 'juno_park',
    title: 'Anyone up for a 48-hour community jam next month?',
    content:
      'Thinking theme voting the week before, small teams welcome, no prizes — just for fun and feedback.',
    postType: PostType.TEXT,
    createdHoursAgo: 5,
  },

  // nexa_staff (private)
  {
    key: 'staff-guidelines',
    community: 'nexa_staff',
    author: 'lena_marlow',
    title: 'Moderation guidelines draft v2',
    content:
      'Updated the removal reasons list and clarified when to lock a thread versus remove it. Comments welcome before Friday.',
    postType: PostType.TEXT,
    createdHoursAgo: 48,
    isPinned: true,
    comments: [
      {
        author: 'otto_brandt',
        content:
          'Looks good. Can we add a template message for duplicate posts?',
        hoursAfterPost: 4,
      },
    ],
  },
  {
    key: 'staff-old-announcement',
    community: 'nexa_staff',
    author: 'mira_okafor',
    title: 'Old announcement (superseded)',
    content: 'This announcement was replaced by the v2 guidelines.',
    postType: PostType.TEXT,
    createdHoursAgo: 24 * 30,
    isDeleted: true,
  },
];

export const refreshTokens: SeedRefreshToken[] = [
  { username: 'lena_marlow', label: 'laptop', expiresInHours: 24 * 7 },
  { username: 'otto_brandt', label: 'laptop', expiresInHours: 24 * 7 },
  {
    username: 'otto_brandt',
    label: 'old-phone',
    expiresInHours: 24 * 2,
    revoked: true,
  },
];

export const postInsights: SeedPostInsights[] = [
  {
    postKey: 'ts-satisfies',
    firstHourViews: 63,
    decay: 0.94,
    countries: [
      { code: 'US', share: 0.328 },
      { code: 'BR', share: 0.07 },
      { code: 'TH', share: 0.064 },
      { code: 'DE', share: 0.041 },
      { code: 'IN', share: 0.038 },
      { code: 'GB', share: 0.031 },
      { code: 'JP', share: 0.027 },
    ],
    shares: 18,
    reposts: 4,
  },
  {
    postKey: 'coffee-v60-recipe',
    firstHourViews: 41,
    decay: 0.9,
    countries: [
      { code: 'BR', share: 0.271 },
      { code: 'US', share: 0.184 },
      { code: 'PT', share: 0.052 },
      { code: 'AR', share: 0.034 },
    ],
    shares: 11,
    awards: 2,
  },
  {
    postKey: 'trail-sunrise-video',
    firstHourViews: 128,
    decay: 0.86,
    countries: [
      { code: 'US', share: 0.412 },
      { code: 'CA', share: 0.086 },
      { code: 'DE', share: 0.061 },
      { code: 'AU', share: 0.048 },
    ],
    shares: 64,
    reposts: 22,
    awards: 7,
  },
  {
    postKey: 'gamedev-devlog-12',
    firstHourViews: 27,
    decay: 0.92,
    countries: [
      { code: 'GB', share: 0.152 },
      { code: 'US', share: 0.144 },
      { code: 'NL', share: 0.058 },
      { code: 'PL', share: 0.041 },
    ],
    shares: 6,
  },
  {
    postKey: 'ts-welcome',
    firstHourViews: 220,
    decay: 0.96,
    countries: [
      { code: 'US', share: 0.221 },
      { code: 'IN', share: 0.163 },
      { code: 'BR', share: 0.078 },
      { code: 'ID', share: 0.052 },
    ],
  },
];
