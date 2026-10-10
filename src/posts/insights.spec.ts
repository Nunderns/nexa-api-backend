import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { PrismaService } from '../prisma/prisma.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('InsightsController', () => {
  let controller: InsightsController;

  const mockInsightsService = {
    recordView: jest.fn(),
    getInsights: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InsightsController],
      providers: [
        {
          provide: InsightsService,
          useValue: mockInsightsService,
        },
      ],
    }).compile();

    controller = module.get<InsightsController>(InsightsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the insights endpoints under /posts', () => {
      expect(collectRoutes(InsightsController)).toEqual(
        ['POST /posts/:id/view', 'GET /posts/:id/insights'].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(InsightsController, 'recordView')).toBe(
        'POST /posts/:id/view',
      );
      expect(routeOf(InsightsController, 'getInsights')).toBe(
        'GET /posts/:id/insights',
      );
    });
  });

  describe('recordView', () => {
    it('should forward the visitor identity and country to the service', async () => {
      mockInsightsService.recordView.mockResolvedValue(true);

      const result = await controller.recordView(7, '203.0.113.9', 42, 'br');

      expect(mockInsightsService.recordView).toHaveBeenCalledWith(7, {
        userId: 42,
        ip: '203.0.113.9',
        countryCode: 'br',
      });
      expect(result).toEqual({ postId: 7, counted: true });
    });

    it('should report a deduplicated view as not counted', async () => {
      mockInsightsService.recordView.mockResolvedValue(false);

      const result = await controller.recordView(7, '203.0.113.9', 42, 'br');

      expect(result).toEqual({ postId: 7, counted: false });
    });

    it('should work for anonymous visitors, whose user id is undefined', async () => {
      mockInsightsService.recordView.mockResolvedValue(true);

      await controller.recordView(7, '203.0.113.9', undefined, undefined);

      expect(mockInsightsService.recordView).toHaveBeenCalledWith(7, {
        userId: undefined,
        ip: '203.0.113.9',
        countryCode: undefined,
      });
    });
  });

  describe('getInsights', () => {
    it('should forward the post id and the authenticated user id', async () => {
      mockInsightsService.getInsights.mockResolvedValue({ postId: 7 });

      const result = await controller.getInsights(7, 42);

      expect(mockInsightsService.getInsights).toHaveBeenCalledWith(7, 42);
      expect(result).toEqual({ postId: 7 });
    });
  });
});

describe('InsightsService', () => {
  let service: InsightsService;

  const mockPrismaService = {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    postView: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    postViewStat: {
      upsert: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    communityMember: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPost = {
    id: 7,
    title: 'Bonus chapters in Volume 10',
    authorId: 42,
    isDeleted: false,
    createdAt: new Date(),
    viewCount: 3110,
    upvoteCount: 30,
    downvoteCount: 0,
    commentCount: 0,
    shareCount: 10,
    repostCount: 0,
    awardCount: 0,
    community: { name: 'inbinadoukutsunos' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
    mockPrismaService.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(mockPrismaService),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordView', () => {
    it('should write the raw event, the hourly bucket and the counter together', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue(null);

      const counted = await service.recordView(7, {
        userId: 42,
        ip: '203.0.113.9',
        countryCode: 'US',
      });

      expect(counted).toBe(true);
      expect(mockPrismaService.postView.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.postViewStat.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { viewCount: { increment: 1 } },
      });

      const upsertArg = mockPrismaService.postViewStat.upsert.mock.calls[0][0];
      expect(upsertArg.create.views).toBe(1);
      expect(upsertArg.update.views).toEqual({ increment: 1 });
    });

    it('should bucket the event on the hour, with minutes and seconds zeroed', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue(null);

      await service.recordView(7, { userId: 42 });

      const upsertArg = mockPrismaService.postViewStat.upsert.mock.calls[0][0];
      const bucket: Date = upsertArg.create.bucketStart;
      expect(bucket.getMinutes()).toBe(0);
      expect(bucket.getSeconds()).toBe(0);
      expect(bucket.getMilliseconds()).toBe(0);
    });

    it('should not count a repeat visit inside the dedupe window', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue({ id: 1 });

      const counted = await service.recordView(7, { userId: 42 });

      expect(counted).toBe(false);
      expect(mockPrismaService.postView.create).not.toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should not count a view on a deleted post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: true,
      });

      const counted = await service.recordView(7, { userId: 42 });

      expect(counted).toBe(false);
      expect(mockPrismaService.postView.create).not.toHaveBeenCalled();
    });

    it('should fall back to the unknown country for an unusable header value', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue(null);

      await service.recordView(7, { userId: 42, countryCode: 'not-a-code' });

      const upsertArg = mockPrismaService.postViewStat.upsert.mock.calls[0][0];
      expect(upsertArg.create.countryCode).toBe('XX');
    });

    it('should upper-case a valid country code', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue(null);

      await service.recordView(7, { userId: 42, countryCode: 'br' });

      const upsertArg = mockPrismaService.postViewStat.upsert.mock.calls[0][0];
      expect(upsertArg.create.countryCode).toBe('BR');
    });

    it('should key anonymous visitors on the IP hash, not the raw address', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue(null);

      await service.recordView(7, { ip: '203.0.113.9' });

      const createArg = mockPrismaService.postView.create.mock.calls[0][0];
      expect(createArg.data.viewerKey).toHaveLength(64);
      expect(createArg.data.viewerKey).not.toContain('203.0.113.9');
    });

    it('should give two different anonymous visitors different keys', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 7,
        isDeleted: false,
      });
      mockPrismaService.postView.findFirst.mockResolvedValue(null);

      await service.recordView(7, { ip: '203.0.113.9' });
      await service.recordView(7, { ip: '198.51.100.4' });

      const first =
        mockPrismaService.postView.create.mock.calls[0][0].data.viewerKey;
      const second =
        mockPrismaService.postView.create.mock.calls[1][0].data.viewerKey;
      expect(first).not.toBe(second);
    });
  });

  describe('getInsights', () => {
    beforeEach(() => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPost);
      mockPrismaService.communityMember.findFirst.mockResolvedValue(null);
      mockPrismaService.postViewStat.groupBy.mockImplementation(
        (args: { by: string[] }) =>
          args.by[0] === 'bucketStart'
            ? Promise.resolve([])
            : Promise.resolve([]),
      );
      mockPrismaService.postViewStat.aggregate.mockResolvedValue({
        _sum: { views: 16 },
      });
    });

    it('should allow the post author', async () => {
      const result = await service.getInsights(7, 42);

      expect(result.postId).toBe(7);
      expect(result.reach.views).toBe(3110);
      expect(result.reach.viewsLast24h).toBe(16);
    });

    it('should refuse a reader who is neither author nor moderator', async () => {
      await expect(service.getInsights(7, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFound for a deleted post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        isDeleted: true,
      });

      await expect(service.getInsights(7, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should report a null upvote ratio when nobody has voted', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        upvoteCount: 0,
        downvoteCount: 0,
      });

      const result = await service.getInsights(7, 42);

      expect(result.engagement.upvoteRatio).toBeNull();
    });

    it('should compute the upvote ratio over all votes', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        upvoteCount: 30,
        downvoteCount: 10,
      });

      const result = await service.getInsights(7, 42);

      expect(result.engagement.upvoteRatio).toBe(75);
    });

    it('should return a dense hourly series anchored on publication time', async () => {
      const publishedAt = new Date();
      publishedAt.setMinutes(0, 0, 0);

      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        createdAt: publishedAt,
      });

      const result = await service.getInsights(7, 42);

      expect(result.hourlyViews.length).toBe(1);
      expect(result.hourlyViews[0].hour).toBe(1);
      expect(result.hourlyViews[0].views).toBe(0);
    });

    it('should fill missing hours with zeros instead of omitting them', async () => {
      const publishedAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
      publishedAt.setMinutes(0, 0, 0);

      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        createdAt: publishedAt,
      });
      mockPrismaService.postViewStat.groupBy.mockImplementation(
        (args: { by: string[] }) =>
          args.by[0] === 'bucketStart'
            ? Promise.resolve([
                {
                  bucketStart: new Date(publishedAt.getTime() + 2 * 3_600_000),
                  _sum: { views: 59 },
                },
              ])
            : Promise.resolve([]),
      );

      const result = await service.getInsights(7, 42);

      expect(result.hourlyViews.map((point) => point.views)).toEqual([
        0, 0, 59, 0, 0, 0,
      ]);
      expect(result.hourlyViews.map((point) => point.hour)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
    });

    it('should cap the chart at the first 48 hours after publication', async () => {
      const publishedAt = new Date(Date.now() - 200 * 60 * 60 * 1000);
      publishedAt.setMinutes(0, 0, 0);

      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        createdAt: publishedAt,
      });

      const result = await service.getInsights(7, 42);

      expect(result.hourlyViews).toHaveLength(48);
      expect(result.hourlyViews[47].hour).toBe(48);
    });

    it('should list the top countries and fold the rest into "other"', async () => {
      mockPrismaService.postViewStat.groupBy.mockImplementation(
        (args: { by: string[] }) =>
          args.by[0] === 'bucketStart'
            ? Promise.resolve([])
            : Promise.resolve([
                { countryCode: 'US', _sum: { views: 1020 } },
                { countryCode: 'BR', _sum: { views: 218 } },
                { countryCode: 'TH', _sum: { views: 199 } },
                { countryCode: 'DE', _sum: { views: 300 } },
                { countryCode: 'FR', _sum: { views: 100 } },
              ]),
      );

      const result = await service.getInsights(7, 42);

      expect(result.countries.top.map((row) => row.countryCode)).toEqual([
        'US',
        'DE',
        'BR',
      ]);
      expect(result.countries.other.countryCode).toBe('XX');
    });

    it('should derive "other" from the total so shares always add up to 100', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        viewCount: 1000,
      });
      mockPrismaService.postViewStat.groupBy.mockImplementation(
        (args: { by: string[] }) =>
          args.by[0] === 'bucketStart'
            ? Promise.resolve([])
            : Promise.resolve([{ countryCode: 'US', _sum: { views: 400 } }]),
      );

      const result = await service.getInsights(7, 42);

      expect(result.countries.other.views).toBe(600);
      const sum =
        result.countries.top.reduce((acc, row) => acc + row.views, 0) +
        result.countries.other.views;
      expect(sum).toBe(1000);
    });

    it('should report zeroed percentages when nothing has been viewed', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPost,
        viewCount: 0,
      });

      const result = await service.getInsights(7, 42);

      expect(result.countries.top).toEqual([]);
      expect(result.countries.other.percentage).toBe(0);
    });
  });
});
