import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('CommentsController', () => {
  let controller: CommentsController;

  const mockCommentsService = {
    create: jest.fn(),
    findByPost: jest.fn(),
    findReplies: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getUserComments: jest.fn(),
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
      controllers: [CommentsController],
      providers: [
        {
          provide: CommentsService,
          useValue: mockCommentsService,
        },
      ],
    }).compile();

    controller = module.get<CommentsController>(CommentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the comment endpoints', () => {
      expect(collectRoutes(CommentsController)).toEqual(
        [
          'POST /comments',
          'GET /comments/post/:postId',
          'GET /comments/:id/replies',
          'GET /comments/:id',
          'PUT /comments/:id',
          'DELETE /comments/:id',
          'GET /comments/user/:userId',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(CommentsController, 'create')).toBe('POST /comments');
      expect(routeOf(CommentsController, 'findByPost')).toBe(
        'GET /comments/post/:postId',
      );
      expect(routeOf(CommentsController, 'findReplies')).toBe(
        'GET /comments/:id/replies',
      );
      expect(routeOf(CommentsController, 'findOne')).toBe('GET /comments/:id');
      expect(routeOf(CommentsController, 'update')).toBe('PUT /comments/:id');
      expect(routeOf(CommentsController, 'remove')).toBe(
        'DELETE /comments/:id',
      );
      expect(routeOf(CommentsController, 'getUserComments')).toBe(
        'GET /comments/user/:userId',
      );
    });
  });

  describe('create', () => {
    it('should forward the payload and the authenticated user id', async () => {
      const createCommentDto = { postId: 1, content: 'Nice post' };
      const comment = { id: 10 };

      mockCommentsService.create.mockResolvedValue(comment);

      const result = await controller.create(createCommentDto, 1);

      expect(mockCommentsService.create).toHaveBeenCalledWith(
        createCommentDto,
        1,
      );
      expect(result).toBe(comment);
    });

    it('should forward replies through the same endpoint', async () => {
      const createCommentDto = {
        postId: 1,
        content: 'Nice post',
        parentId: 5,
      };

      mockCommentsService.create.mockResolvedValue({ id: 11 });

      await controller.create(createCommentDto, 1);

      expect(mockCommentsService.create).toHaveBeenCalledWith(
        createCommentDto,
        1,
      );
    });
  });

  describe('findByPost', () => {
    it('should convert the post id and forward the pagination', async () => {
      mockCommentsService.findByPost.mockResolvedValue(paginated);

      await controller.findByPost('1', { page: 2, limit: 10 });

      expect(mockCommentsService.findByPost).toHaveBeenCalledWith(1, 2, 10);
    });
  });

  describe('findReplies', () => {
    it('should convert the id and forward the pagination', async () => {
      mockCommentsService.findReplies.mockResolvedValue(paginated);

      await controller.findReplies('10', { page: 1, limit: 20 });

      expect(mockCommentsService.findReplies).toHaveBeenCalledWith(10, 1, 20);
    });
  });

  describe('findOne', () => {
    it('should convert the id param to a number', async () => {
      const comment = { id: 10 };
      mockCommentsService.findOne.mockResolvedValue(comment);

      const result = await controller.findOne('10');

      expect(mockCommentsService.findOne).toHaveBeenCalledWith(10);
      expect(result).toBe(comment);
    });
  });

  describe('update', () => {
    it('should forward the id, the payload and the current user id', async () => {
      const updateCommentDto = { content: 'Updated content' };

      mockCommentsService.update.mockResolvedValue({ id: 10 });

      await controller.update('10', updateCommentDto, 1);

      expect(mockCommentsService.update).toHaveBeenCalledWith(
        10,
        updateCommentDto,
        1,
      );
    });
  });

  describe('remove', () => {
    it('should forward the id and the current user id', async () => {
      mockCommentsService.remove.mockResolvedValue(undefined);

      await controller.remove('10', 1);

      expect(mockCommentsService.remove).toHaveBeenCalledWith(10, 1);
    });
  });

  describe('getUserComments', () => {
    it('should convert the user id and forward the pagination', async () => {
      mockCommentsService.getUserComments.mockResolvedValue(paginated);

      await controller.getUserComments('7', { page: 1, limit: 20 });

      expect(mockCommentsService.getUserComments).toHaveBeenCalledWith(
        7,
        1,
        20,
      );
    });
  });
});
