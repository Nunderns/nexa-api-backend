import { Test, TestingModule } from '@nestjs/testing';
import { CommunityRole } from '@prisma/client';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('CommunitiesController', () => {
  let controller: CommunitiesController;

  const mockCommunitiesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByName: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    getMembers: jest.fn(),
    updateMemberRole: jest.fn(),
    banMember: jest.fn(),
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
      controllers: [CommunitiesController],
      providers: [
        {
          provide: CommunitiesService,
          useValue: mockCommunitiesService,
        },
      ],
    }).compile();

    controller = module.get<CommunitiesController>(CommunitiesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the community endpoints', () => {
      expect(collectRoutes(CommunitiesController)).toEqual(
        [
          'POST /communities',
          'GET /communities',
          'GET /communities/:id',
          'GET /communities/name/:name',
          'PUT /communities/:id',
          'DELETE /communities/:id',
          'POST /communities/:id/join',
          'POST /communities/:id/leave',
          'GET /communities/:id/members',
          'PUT /communities/:id/members/:userId/role',
          'POST /communities/:id/members/:userId/ban',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(CommunitiesController, 'create')).toBe(
        'POST /communities',
      );
      expect(routeOf(CommunitiesController, 'findAll')).toBe(
        'GET /communities',
      );
      expect(routeOf(CommunitiesController, 'findOne')).toBe(
        'GET /communities/:id',
      );
      expect(routeOf(CommunitiesController, 'findByName')).toBe(
        'GET /communities/name/:name',
      );
      expect(routeOf(CommunitiesController, 'join')).toBe(
        'POST /communities/:id/join',
      );
      expect(routeOf(CommunitiesController, 'leave')).toBe(
        'POST /communities/:id/leave',
      );
      expect(routeOf(CommunitiesController, 'getMembers')).toBe(
        'GET /communities/:id/members',
      );
      expect(routeOf(CommunitiesController, 'updateMemberRole')).toBe(
        'PUT /communities/:id/members/:userId/role',
      );
      expect(routeOf(CommunitiesController, 'banMember')).toBe(
        'POST /communities/:id/members/:userId/ban',
      );
    });
  });

  describe('create', () => {
    it('should forward the payload and the authenticated user id', async () => {
      const createCommunityDto = {
        name: 'testcommunity',
        displayName: 'Test Community',
      };
      const community = { id: 1, ...createCommunityDto };

      mockCommunitiesService.create.mockResolvedValue(community);

      const result = await controller.create(createCommunityDto, 1);

      expect(mockCommunitiesService.create).toHaveBeenCalledWith(
        createCommunityDto,
        1,
      );
      expect(result).toBe(community);
    });
  });

  describe('findAll', () => {
    it('should forward the pagination query params', async () => {
      mockCommunitiesService.findAll.mockResolvedValue(paginated);

      await controller.findAll({ page: 2, limit: 15 });

      expect(mockCommunitiesService.findAll).toHaveBeenCalledWith(2, 15);
    });
  });

  describe('findOne', () => {
    it('should convert the id param to a number', async () => {
      const community = { id: 1 };
      mockCommunitiesService.findOne.mockResolvedValue(community);

      const result = await controller.findOne('1');

      expect(mockCommunitiesService.findOne).toHaveBeenCalledWith(1);
      expect(result).toBe(community);
    });
  });

  describe('findByName', () => {
    it('should forward the name param untouched', async () => {
      mockCommunitiesService.findByName.mockResolvedValue({ id: 1 });

      await controller.findByName('testcommunity');

      expect(mockCommunitiesService.findByName).toHaveBeenCalledWith(
        'testcommunity',
      );
    });
  });

  describe('update', () => {
    it('should forward the id, the payload and the current user id', async () => {
      const updateCommunityDto = { displayName: 'Updated Name' };

      mockCommunitiesService.update.mockResolvedValue({ id: 1 });

      await controller.update('1', updateCommunityDto, 1);

      expect(mockCommunitiesService.update).toHaveBeenCalledWith(
        1,
        updateCommunityDto,
        1,
      );
    });
  });

  describe('remove', () => {
    it('should forward the id and the current user id', async () => {
      mockCommunitiesService.remove.mockResolvedValue(undefined);

      await controller.remove('1', 1);

      expect(mockCommunitiesService.remove).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('join', () => {
    it('should forward the optional join payload when present', async () => {
      const joinCommunityDto = { role: CommunityRole.MODERATOR };

      mockCommunitiesService.join.mockResolvedValue({ id: 1 });

      await controller.join('1', 2, joinCommunityDto);

      expect(mockCommunitiesService.join).toHaveBeenCalledWith(
        1,
        2,
        joinCommunityDto,
      );
    });

    it('should forward undefined when no body is sent', async () => {
      mockCommunitiesService.join.mockResolvedValue({ id: 1 });

      await controller.join('1', 2);

      expect(mockCommunitiesService.join).toHaveBeenCalledWith(1, 2, undefined);
    });
  });

  describe('leave', () => {
    it('should forward the id and the current user id', async () => {
      mockCommunitiesService.leave.mockResolvedValue(undefined);

      await controller.leave('1', 1);

      expect(mockCommunitiesService.leave).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('getMembers', () => {
    it('should convert the id and forward the pagination', async () => {
      mockCommunitiesService.getMembers.mockResolvedValue(paginated);

      await controller.getMembers('1', { page: 2, limit: 50 });

      expect(mockCommunitiesService.getMembers).toHaveBeenCalledWith(1, 2, 50);
    });
  });

  describe('updateMemberRole', () => {
    it('should convert both ids and extract the role from the body', async () => {
      mockCommunitiesService.updateMemberRole.mockResolvedValue({ id: 1 });

      await controller.updateMemberRole('1', '2', CommunityRole.MODERATOR, 3);

      expect(mockCommunitiesService.updateMemberRole).toHaveBeenCalledWith(
        1,
        2,
        CommunityRole.MODERATOR,
        3,
      );
    });
  });

  describe('banMember', () => {
    it('should convert both ids keeping the acting user separate', async () => {
      mockCommunitiesService.banMember.mockResolvedValue({ id: 1 });

      await controller.banMember('1', '2', 1);

      expect(mockCommunitiesService.banMember).toHaveBeenCalledWith(1, 2, 1);
    });
  });
});
