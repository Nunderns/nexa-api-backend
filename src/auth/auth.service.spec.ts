import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const buildUser = (passwordHash: string) => ({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash,
    displayName: 'Test User',
    bio: null,
    avatarUrl: null,
    karma: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const buildRefreshToken = () => ({
    id: 1,
    userId: 1,
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
    createdAt: new Date(),
  });

  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Distinguish access/refresh tokens regardless of the JWT secrets in env.
    mockJwtService.sign.mockImplementation(
      (_payload: unknown, options?: { expiresIn?: string }) =>
        options?.expiresIn === '7d' ? 'refresh-token' : 'access-token',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    };

    it('should register a new user and return tokens', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(buildUser(passwordHash));
      mockPrismaService.refreshToken.create.mockResolvedValue(
        buildRefreshToken(),
      );

      const result = await service.register(registerDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 1,
        username: 'testuser',
        email: 'test@example.com',
      });
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ username: 'testuser' }, { email: 'test@example.com' }],
        },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: registerDto.username,
          email: registerDto.email,
          displayName: registerDto.displayName,
          passwordHash: expect.any(String),
        }),
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          tokenHash: expect.any(String),
        }),
      });
    });

    it('should store the password hashed, never in plain text', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(buildUser(passwordHash));
      mockPrismaService.refreshToken.create.mockResolvedValue(
        buildRefreshToken(),
      );

      await service.register(registerDto);

      const { data } = mockPrismaService.user.create.mock.calls[0][0];

      expect(data.passwordHash).not.toBe(registerDto.password);
      await expect(
        bcrypt.compare(registerDto.password, data.passwordHash),
      ).resolves.toBe(true);
    });

    it('should throw ConflictException if username already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        username: registerDto.username,
        email: 'other@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        username: 'someoneelse',
        email: registerDto.email,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login with valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash),
      );
      mockPrismaService.refreshToken.create.mockResolvedValue(
        buildRefreshToken(),
      );

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 1,
        username: 'testuser',
        email: 'test@example.com',
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash),
      );

      await expect(
        service.login({ ...loginDto, password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if account is deactivated', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...buildUser(passwordHash),
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto = { refreshToken: 'valid-refresh-token' };

    it('should refresh access token with valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 1,
        email: 'test@example.com',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash),
      );
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refreshToken(refreshTokenDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 1,
        username: 'testuser',
        email: 'test@example.com',
      });
      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'valid-refresh-token',
        expect.any(Object),
      );
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if the token cannot be verified', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refreshToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1 });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user is deactivated', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1 });
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...buildUser(passwordHash),
        isActive: false,
      });

      await expect(service.refreshToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should revoke all refresh tokens of the user', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout(1);

      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });
  });

  describe('validateUser', () => {
    it('should query the user without exposing the password hash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash),
      );

      await service.validateUser(1);

      const { select } = mockPrismaService.user.findUnique.mock.calls[0][0];

      expect(select.passwordHash).toBeUndefined();
      expect(select.email).toBe(true);
      expect(select.isActive).toBe(true);
    });

    it('should return the user when found and active', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash),
      );

      const result = await service.validateUser(1);

      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
    });

    it('should return null if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.validateUser(999)).resolves.toBeNull();
    });

    it('should return null if user is inactive', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...buildUser(passwordHash),
        isActive: false,
      });

      await expect(service.validateUser(1)).resolves.toBeNull();
    });
  });
});
