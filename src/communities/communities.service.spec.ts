import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityRole } from '@prisma/client';

describe('CommunitiesService', () => {
  let service: CommunitiesService;

  const mockPrismaService = {
    community: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    communityMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockCommunity = {
    id: 1,
    name: 'testcommunity',
    displayName: 'Test Community',
    description: 'A test community',
    iconUrl: null,
    bannerUrl: null,
    isPrivate: false,
    isNsfw: false,
    memberCount: 10,
    postCount: 0,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    creator: {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
    },
  };

  const mockMembership = {
    communityId: 1,
    userId: 1,
    role: CommunityRole.OWNER,
    joinedAt: new Date(),
    bannedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunitiesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CommunitiesService>(CommunitiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new community', async () => {
      const createCommunityDto = {
        name: 'testcommunity',
        displayName: 'Test Community',
        description: 'A test community',
      };

      mockPrismaService.community.findUnique.mockResolvedValue(null);
      mockPrismaService.community.create.mockResolvedValue(mockCommunity);
      mockPrismaService.communityMember.create.mockResolvedValue(
        mockMembership,
      );

      const result = await service.create(createCommunityDto, 1);

      expect(result).toEqual(mockCommunity);
      expect(mockPrismaService.community.create).toHaveBeenCalledWith({
        data: { ...createCommunityDto, createdBy: 1 },
      });
      expect(mockPrismaService.communityMember.create).toHaveBeenCalledWith({
        data: {
          communityId: mockCommunity.id,
          userId: 1,
          role: CommunityRole.OWNER,
        },
      });
    });

    it('should throw ConflictException if community name exists', async () => {
      const createCommunityDto = {
        name: 'testcommunity',
        displayName: 'Test Community',
      };

      mockPrismaService.community.findUnique.mockResolvedValue(mockCommunity);

      await expect(service.create(createCommunityDto, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated communities', async () => {
      const communities = [mockCommunity];
      mockPrismaService.community.findMany.mockResolvedValue(communities);
      mockPrismaService.community.count.mockResolvedValue(1);

      const result = await service.findAll(1, 20);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.community.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        include: expect.any(Object),
        orderBy: { memberCount: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a community by id', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue(mockCommunity);

      const result = await service.findOne(1);

      expect(result).toEqual(mockCommunity);
      expect(mockPrismaService.community.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if community not found', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByName', () => {
    it('should return a community by name', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue(mockCommunity);

      const result = await service.findByName('testcommunity');

      expect(result).toEqual(mockCommunity);
      expect(mockPrismaService.community.findUnique).toHaveBeenCalledWith({
        where: { name: 'testcommunity' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if community not found', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue(null);

      await expect(service.findByName('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update community if user is owner', async () => {
      const updateCommunityDto = { displayName: 'Updated Name' };
      const updatedCommunity = {
        ...mockCommunity,
        displayName: 'Updated Name',
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.community.update.mockResolvedValue(updatedCommunity);

      const result = await service.update(1, updateCommunityDto, 1);

      expect(result).toEqual(updatedCommunity);
    });

    it('should update community if user is moderator', async () => {
      const updateCommunityDto = { displayName: 'Updated Name' };
      const moderatorMembership = {
        ...mockMembership,
        role: CommunityRole.MODERATOR,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        moderatorMembership,
      );
      mockPrismaService.community.update.mockResolvedValue(mockCommunity);

      const result = await service.update(1, updateCommunityDto, 1);

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if user is not owner or moderator', async () => {
      const updateCommunityDto = { displayName: 'Updated Name' };
      const memberMembership = {
        ...mockMembership,
        role: CommunityRole.MEMBER,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        memberMembership,
      );

      await expect(service.update(1, updateCommunityDto, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('should delete community if user is owner', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.community.delete.mockResolvedValue(mockCommunity);

      await service.remove(1, 1);

      expect(mockPrismaService.community.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const memberMembership = {
        ...mockMembership,
        role: CommunityRole.MEMBER,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        memberMembership,
      );

      await expect(service.remove(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join', () => {
    it('should allow user to join community', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue(mockCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(null);
      mockPrismaService.communityMember.create.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.community.update.mockResolvedValue(mockCommunity);

      const result = await service.join(1, 1);

      expect(result).toEqual(mockMembership);
      expect(mockPrismaService.communityMember.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for private communities', async () => {
      const privateCommunity = { ...mockCommunity, isPrivate: true };

      mockPrismaService.community.findUnique.mockResolvedValue(
        privateCommunity,
      );

      await expect(service.join(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if already a member', async () => {
      mockPrismaService.community.findUnique.mockResolvedValue(mockCommunity);
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.join(1, 1)).rejects.toThrow(ConflictException);
    });
  });

  describe('leave', () => {
    it('should allow user to leave community', async () => {
      const memberMembership = {
        ...mockMembership,
        role: CommunityRole.MEMBER,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        memberMembership,
      );
      mockPrismaService.communityMember.delete.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.community.update.mockResolvedValue(mockCommunity);

      await service.leave(1, 1);

      expect(mockPrismaService.communityMember.delete).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if owner tries to leave', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.leave(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMembers', () => {
    it('should return paginated community members', async () => {
      const members = [
        {
          ...mockMembership,
          user: {
            id: 1,
            username: 'testuser',
            displayName: 'Test User',
            avatarUrl: null,
            karma: 0,
          },
        },
      ];

      mockPrismaService.communityMember.findMany.mockResolvedValue(members);
      mockPrismaService.communityMember.count.mockResolvedValue(1);

      const result = await service.getMembers(1, 1, 20);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('updateMemberRole', () => {
    it('should allow owner to update member role', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.communityMember.update.mockResolvedValue(
        mockMembership,
      );

      const result = await service.updateMemberRole(
        1,
        2,
        CommunityRole.MODERATOR,
        1,
      );

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if not owner', async () => {
      const memberMembership = {
        ...mockMembership,
        role: CommunityRole.MEMBER,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        memberMembership,
      );

      await expect(
        service.updateMemberRole(1, 2, CommunityRole.MODERATOR, 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when trying to change own role', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(
        service.updateMemberRole(1, 1, CommunityRole.MODERATOR, 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('banMember', () => {
    it('should allow owner to ban member', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.communityMember.update.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.community.update.mockResolvedValue(mockCommunity);

      const result = await service.banMember(1, 2, 1);

      expect(result).toBeDefined();
    });

    it('should allow moderator to ban member', async () => {
      const moderatorMembership = {
        ...mockMembership,
        role: CommunityRole.MODERATOR,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        moderatorMembership,
      );
      mockPrismaService.communityMember.update.mockResolvedValue(
        mockMembership,
      );
      mockPrismaService.community.update.mockResolvedValue(mockCommunity);

      const result = await service.banMember(1, 2, 1);

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if not owner or moderator', async () => {
      const memberMembership = {
        ...mockMembership,
        role: CommunityRole.MEMBER,
      };

      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        memberMembership,
      );

      await expect(service.banMember(1, 2, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when trying to ban yourself', async () => {
      mockPrismaService.communityMember.findUnique.mockResolvedValue(
        mockMembership,
      );

      await expect(service.banMember(1, 1, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
