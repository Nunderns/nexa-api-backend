import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByUsername: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getUserPosts: jest.fn(),
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
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the user endpoints', () => {
      expect(collectRoutes(UsersController)).toEqual(
        [
          'GET /users',
          'GET /users/:id',
          'GET /users/username/:username',
          'PUT /users/:id',
          'DELETE /users/:id',
          'GET /users/:id/posts',
          'GET /users/:id/comments',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(UsersController, 'findAll')).toBe('GET /users');
      expect(routeOf(UsersController, 'findOne')).toBe('GET /users/:id');
      expect(routeOf(UsersController, 'findByUsername')).toBe(
        'GET /users/username/:username',
      );
      expect(routeOf(UsersController, 'update')).toBe('PUT /users/:id');
      expect(routeOf(UsersController, 'remove')).toBe('DELETE /users/:id');
      expect(routeOf(UsersController, 'getUserPosts')).toBe(
        'GET /users/:id/posts',
      );
      expect(routeOf(UsersController, 'getUserComments')).toBe(
        'GET /users/:id/comments',
      );
    });
  });

  describe('findAll', () => {
    it('should forward the pagination query params', async () => {
      mockUsersService.findAll.mockResolvedValue(paginated);

      const result = await controller.findAll({ page: 2, limit: 10 });

      expect(mockUsersService.findAll).toHaveBeenCalledWith(2, 10);
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('should convert the id param to a number', async () => {
      const user = { id: 1, username: 'testuser' };
      mockUsersService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('1');

      expect(mockUsersService.findOne).toHaveBeenCalledWith(1);
      expect(result).toBe(user);
    });
  });

  describe('findByUsername', () => {
    it('should forward the username param untouched', async () => {
      const user = { id: 1, username: 'testuser' };
      mockUsersService.findByUsername.mockResolvedValue(user);

      await controller.findByUsername('testuser');

      expect(mockUsersService.findByUsername).toHaveBeenCalledWith('testuser');
    });
  });

  describe('update', () => {
    it('should forward the id, the payload and the current user id', async () => {
      const updateUserDto = { displayName: 'Updated Name' };
      const updated = { id: 1, ...updateUserDto };
      mockUsersService.update.mockResolvedValue(updated);

      const result = await controller.update('1', updateUserDto, 1);

      expect(mockUsersService.update).toHaveBeenCalledWith(1, updateUserDto, 1);
      expect(result).toBe(updated);
    });

    it('should keep the id and the current user id independent', async () => {
      mockUsersService.update.mockRejectedValue(new Error('Forbidden'));

      await expect(
        controller.update('2', { displayName: 'x' }, 1),
      ).rejects.toThrow('Forbidden');

      expect(mockUsersService.update).toHaveBeenCalledWith(
        2,
        { displayName: 'x' },
        1,
      );
    });
  });

  describe('remove', () => {
    it('should forward the id and the current user id', async () => {
      mockUsersService.remove.mockResolvedValue(undefined);

      await controller.remove('1', 1);

      expect(mockUsersService.remove).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('getUserPosts', () => {
    it('should convert the id and forward the pagination', async () => {
      mockUsersService.getUserPosts.mockResolvedValue(paginated);

      await controller.getUserPosts('1', { page: 3, limit: 5 });

      expect(mockUsersService.getUserPosts).toHaveBeenCalledWith(1, 3, 5);
    });
  });

  describe('getUserComments', () => {
    it('should convert the id and forward the pagination', async () => {
      mockUsersService.getUserComments.mockResolvedValue(paginated);

      await controller.getUserComments('7', { page: 1, limit: 20 });

      expect(mockUsersService.getUserComments).toHaveBeenCalledWith(7, 1, 20);
    });
  });
});
