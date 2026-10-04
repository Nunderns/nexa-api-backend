import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('MediaController', () => {
  let controller: MediaController;

  const mockMediaService = {
    upload: jest.fn(),
    findOne: jest.fn(),
    findByPost: jest.fn(),
    findByComment: jest.fn(),
    findByUser: jest.fn(),
    remove: jest.fn(),
  };

  const uploadMediaDto = {
    url: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        {
          provide: MediaService,
          useValue: mockMediaService,
        },
      ],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the media endpoints', () => {
      expect(collectRoutes(MediaController)).toEqual(
        [
          'POST /media',
          'GET /media/:id',
          'GET /media/post/:postId',
          'GET /media/comment/:commentId',
          'GET /media/user/:userId',
          'DELETE /media/:id',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(MediaController, 'upload')).toBe('POST /media');
      expect(routeOf(MediaController, 'findOne')).toBe('GET /media/:id');
      expect(routeOf(MediaController, 'findByPost')).toBe(
        'GET /media/post/:postId',
      );
      expect(routeOf(MediaController, 'findByComment')).toBe(
        'GET /media/comment/:commentId',
      );
      expect(routeOf(MediaController, 'findByUser')).toBe(
        'GET /media/user/:userId',
      );
      expect(routeOf(MediaController, 'remove')).toBe('DELETE /media/:id');
    });
  });

  describe('upload', () => {
    it('should forward the payload and the authenticated user id', async () => {
      const media = { id: 1 };
      mockMediaService.upload.mockResolvedValue(media);

      const result = await controller.upload(uploadMediaDto, 1);

      expect(mockMediaService.upload).toHaveBeenCalledWith(uploadMediaDto, 1);
      expect(result).toBe(media);
    });

    it('should forward media attached to a post', async () => {
      mockMediaService.upload.mockResolvedValue({ id: 1 });

      await controller.upload({ ...uploadMediaDto, postId: 5 }, 1);

      expect(mockMediaService.upload).toHaveBeenCalledWith(
        { ...uploadMediaDto, postId: 5 },
        1,
      );
    });
  });

  describe('findOne', () => {
    it('should convert the id param to a number', async () => {
      const media = { id: 1 };
      mockMediaService.findOne.mockResolvedValue(media);

      const result = await controller.findOne('1');

      expect(mockMediaService.findOne).toHaveBeenCalledWith(1);
      expect(result).toBe(media);
    });
  });

  describe('findByPost', () => {
    it('should convert the post id to a number', async () => {
      mockMediaService.findByPost.mockResolvedValue([]);

      const result = await controller.findByPost('1');

      expect(mockMediaService.findByPost).toHaveBeenCalledWith(1);
      expect(result).toEqual([]);
    });
  });

  describe('findByComment', () => {
    it('should convert the comment id to a number', async () => {
      mockMediaService.findByComment.mockResolvedValue([]);

      const result = await controller.findByComment('10');

      expect(mockMediaService.findByComment).toHaveBeenCalledWith(10);
      expect(result).toEqual([]);
    });
  });

  describe('findByUser', () => {
    it('should convert the user id to a number', async () => {
      mockMediaService.findByUser.mockResolvedValue([]);

      const result = await controller.findByUser('7');

      expect(mockMediaService.findByUser).toHaveBeenCalledWith(7);
      expect(result).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should forward the id and the current user id', async () => {
      mockMediaService.remove.mockResolvedValue(undefined);

      await controller.remove('1', 1);

      expect(mockMediaService.remove).toHaveBeenCalledWith(1, 1);
    });
  });
});
