import { Test, TestingModule } from '@nestjs/testing';
import { PostType } from '@prisma/client';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('PostsController', () => {
  let controller: PostsController;

  const mockPostsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByCommunity: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    pin: jest.fn(),
    unpin: jest.fn(),
    lock: jest.fn(),
    unlock: jest.fn(),
  };

  const paginated = {
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
      ],
    }).compile();

    controller = module.get<PostsController>(PostsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the post endpoints', () => {
      expect(collectRoutes(PostsController)).toEqual(
        [
          'POST /posts',
          'GET /posts',
          'GET /posts/community/:communityId',
          'GET /posts/:id',
          'PUT /posts/:id',
          'DELETE /posts/:id',
          'POST /posts/:id/pin',
          'POST /posts/:id/unpin',
          'POST /posts/:id/lock',
          'POST /posts/:id/unlock',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(PostsController, 'create')).toBe('POST /posts');
      expect(routeOf(PostsController, 'findAll')).toBe('GET /posts');
      expect(routeOf(PostsController, 'findByCommunity')).toBe(
        'GET /posts/community/:communityId',
      );
      expect(routeOf(PostsController, 'findOne')).toBe('GET /posts/:id');
      expect(routeOf(PostsController, 'update')).toBe('PUT /posts/:id');
      expect(routeOf(PostsController, 'remove')).toBe('DELETE /posts/:id');
      expect(routeOf(PostsController, 'pin')).toBe('POST /posts/:id/pin');
      expect(routeOf(PostsController, 'unpin')).toBe('POST /posts/:id/unpin');
      expect(routeOf(PostsController, 'lock')).toBe('POST /posts/:id/lock');
      expect(routeOf(PostsController, 'unlock')).toBe('POST /posts/:id/unlock');
    });
  });

  describe('create', () => {
    it('should forward the payload and the authenticated user id', async () => {
      const createPostDto = {
        communityId: 1,
        title: 'Test Post',
        content: 'Test content',
        postType: PostType.TEXT,
      };
      const post = { id: 1 };

      mockPostsService.create.mockResolvedValue(post);

      const result = await controller.create(createPostDto, 1);

      expect(mockPostsService.create).toHaveBeenCalledWith(createPostDto, 1);
      expect(result).toBe(post);
    });
  });

  describe('findAll', () => {
    it('should forward pagination, sortBy and time', async () => {
      mockPostsService.findAll.mockResolvedValue(paginated);

      await controller.findAll({ page: 2, limit: 10 }, 'featured', 'week');

      expect(mockPostsService.findAll).toHaveBeenCalledWith(
        2,
        10,
        'featured',
        'week',
      );
    });

    it('should fall back to hot sorting and all time when the query is empty', async () => {
      mockPostsService.findAll.mockResolvedValue(paginated);

      await controller.findAll({ page: 1, limit: 20 });

      expect(mockPostsService.findAll).toHaveBeenCalledWith(
        1,
        20,
        'hot',
        'all',
      );
    });
  });

  describe('findByCommunity', () => {
    it('should convert the community id and forward pagination, sortBy and time', async () => {
      mockPostsService.findByCommunity.mockResolvedValue(paginated);

      await controller.findByCommunity(
        '1',
        { page: 1, limit: 20 },
        'top',
        'today',
      );

      expect(mockPostsService.findByCommunity).toHaveBeenCalledWith(
        1,
        1,
        20,
        'top',
        'today',
      );
    });
  });

  describe('findOne', () => {
    it('should convert the id param to a number', async () => {
      const post = { id: 1 };
      mockPostsService.findOne.mockResolvedValue(post);

      const result = await controller.findOne('1');

      expect(mockPostsService.findOne).toHaveBeenCalledWith(1);
      expect(result).toBe(post);
    });
  });

  describe('update', () => {
    it('should forward the id, the payload and the current user id', async () => {
      const updatePostDto = { title: 'Updated Title' };

      mockPostsService.update.mockResolvedValue({ id: 1 });

      await controller.update('1', updatePostDto, 1);

      expect(mockPostsService.update).toHaveBeenCalledWith(1, updatePostDto, 1);
    });
  });

  describe('remove', () => {
    it('should forward the id and the current user id', async () => {
      mockPostsService.remove.mockResolvedValue(undefined);

      await controller.remove('1', 1);

      expect(mockPostsService.remove).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('pin', () => {
    it('should forward the id and the current user id', async () => {
      const post = { id: 1, isPinned: true };
      mockPostsService.pin.mockResolvedValue(post);

      const result = await controller.pin('1', 1);

      expect(mockPostsService.pin).toHaveBeenCalledWith(1, 1);
      expect(result).toBe(post);
    });
  });

  describe('unpin', () => {
    it('should forward the id and the current user id', async () => {
      mockPostsService.unpin.mockResolvedValue({ id: 1 });

      await controller.unpin('1', 1);

      expect(mockPostsService.unpin).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('lock', () => {
    it('should forward the id and the current user id', async () => {
      mockPostsService.lock.mockResolvedValue({ id: 1 });

      await controller.lock('1', 1);

      expect(mockPostsService.lock).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('unlock', () => {
    it('should forward the id and the current user id', async () => {
      mockPostsService.unlock.mockResolvedValue({ id: 1 });

      await controller.unlock('1', 1);

      expect(mockPostsService.unlock).toHaveBeenCalledWith(1, 1);
    });
  });
});
