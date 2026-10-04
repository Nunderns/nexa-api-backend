import { Test, TestingModule } from '@nestjs/testing';
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('VotesController', () => {
  let controller: VotesController;

  const mockVotesService = {
    voteOnPost: jest.fn(),
    voteOnComment: jest.fn(),
    getPostVote: jest.fn(),
    getCommentVote: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VotesController],
      providers: [
        {
          provide: VotesService,
          useValue: mockVotesService,
        },
      ],
    }).compile();

    controller = module.get<VotesController>(VotesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the voting endpoints', () => {
      expect(collectRoutes(VotesController)).toEqual(
        [
          'POST /votes/post/:postId',
          'GET /votes/post/:postId',
          'POST /votes/comment/:commentId',
          'GET /votes/comment/:commentId',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(VotesController, 'voteOnPost')).toBe(
        'POST /votes/post/:postId',
      );
      expect(routeOf(VotesController, 'getPostVote')).toBe(
        'GET /votes/post/:postId',
      );
      expect(routeOf(VotesController, 'voteOnComment')).toBe(
        'POST /votes/comment/:commentId',
      );
      expect(routeOf(VotesController, 'getCommentVote')).toBe(
        'GET /votes/comment/:commentId',
      );
    });
  });

  describe('voteOnPost', () => {
    it('should forward the post id, the vote payload and the current user id', async () => {
      const vote = { userId: 1, postId: 1, vote: 1 };
      mockVotesService.voteOnPost.mockResolvedValue(vote);

      const result = await controller.voteOnPost('1', { vote: 1 }, 1);

      expect(mockVotesService.voteOnPost).toHaveBeenCalledWith(
        1,
        { vote: 1 },
        1,
      );
      expect(result).toBe(vote);
    });

    it('should forward a downvote', async () => {
      mockVotesService.voteOnPost.mockResolvedValue({ vote: -1 });

      await controller.voteOnPost('3', { vote: -1 }, 2);

      expect(mockVotesService.voteOnPost).toHaveBeenCalledWith(
        3,
        { vote: -1 },
        2,
      );
    });

    it('should forward a vote removal', async () => {
      mockVotesService.voteOnPost.mockResolvedValue({ vote: 1 });

      await controller.voteOnPost('1', { vote: 0 }, 1);

      expect(mockVotesService.voteOnPost).toHaveBeenCalledWith(
        1,
        { vote: 0 },
        1,
      );
    });
  });

  describe('getPostVote', () => {
    it('should forward the post id and the current user id', async () => {
      const vote = { userId: 1, postId: 1, vote: 1 };
      mockVotesService.getPostVote.mockResolvedValue(vote);

      const result = await controller.getPostVote('1', 1);

      expect(mockVotesService.getPostVote).toHaveBeenCalledWith(1, 1);
      expect(result).toBe(vote);
    });

    it('should return null when the user has not voted', async () => {
      mockVotesService.getPostVote.mockResolvedValue(null);

      await expect(controller.getPostVote('1', 1)).resolves.toBeNull();
    });
  });

  describe('voteOnComment', () => {
    it('should forward the comment id, the vote payload and the current user id', async () => {
      const vote = { userId: 1, commentId: 10, vote: 1 };
      mockVotesService.voteOnComment.mockResolvedValue(vote);

      const result = await controller.voteOnComment('10', { vote: 1 }, 1);

      expect(mockVotesService.voteOnComment).toHaveBeenCalledWith(
        10,
        { vote: 1 },
        1,
      );
      expect(result).toBe(vote);
    });
  });

  describe('getCommentVote', () => {
    it('should forward the comment id and the current user id', async () => {
      const vote = { userId: 1, commentId: 10, vote: -1 };
      mockVotesService.getCommentVote.mockResolvedValue(vote);

      const result = await controller.getCommentVote('10', 1);

      expect(mockVotesService.getCommentVote).toHaveBeenCalledWith(10, 1);
      expect(result).toBe(vote);
    });

    it('should return null when the user has not voted', async () => {
      mockVotesService.getCommentVote.mockResolvedValue(null);

      await expect(controller.getCommentVote('10', 1)).resolves.toBeNull();
    });
  });
});
