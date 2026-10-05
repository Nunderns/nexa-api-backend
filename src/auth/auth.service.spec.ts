import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/email/email.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockEmailService = {
    sendConfirmationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  };

  const buildUser = (passwordHash: string, overrides = {}) => ({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash,
    displayName: 'Test User',
    bio: null,
    avatarUrl: null,
    karma: 0,
    isActive: true,
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
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
        {
          provide: EmailService,
          useValue: mockEmailService,
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
          emailVerificationToken: expect.any(String),
          emailVerificationExpires: expect.any(Date),
        }),
      });
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          tokenHash: expect.any(String),
        }),
      });
      expect(mockEmailService.sendConfirmationEmail).toHaveBeenCalledWith(
        registerDto.email,
        registerDto.username,
        expect.any(String),
      );
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

    it('should throw UnauthorizedException if email not verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: false }),
      );

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.refreshToken.create).not.toHaveBeenCalled();
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

    it('should throw UnauthorizedException if email not verified', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 1,
        email: 'test@example.com',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: false }),
      );

      await expect(service.refreshToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
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
      expect(select.isEmailVerified).toBe(true);
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

  describe('confirmEmail', () => {
    const confirmEmailDto = { token: 'valid-token-123' };

    it('should confirm email successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, {
          isEmailVerified: false,
          emailVerificationToken: 'valid-token-123',
          emailVerificationExpires: new Date(Date.now() + 3600000),
        }),
      );
      mockPrismaService.user.update.mockResolvedValue(buildUser(passwordHash));

      const result = await service.confirmEmail(confirmEmailDto);

      expect(result).toEqual({ message: 'Email confirmed successfully' });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { emailVerificationToken: 'valid-token-123' },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });
    });

    it('should return message if email already confirmed', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, {
          isEmailVerified: true,
          emailVerificationToken: 'valid-token-123',
        }),
      );

      const result = await service.confirmEmail(confirmEmailDto);

      expect(result).toEqual({ message: 'Email already confirmed' });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if token is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.confirmEmail(confirmEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if token is expired', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, {
          isEmailVerified: false,
          emailVerificationToken: 'valid-token-123',
          emailVerificationExpires: new Date(Date.now() - 3600000),
        }),
      );

      await expect(service.confirmEmail(confirmEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto = { email: 'test@example.com' };
    const genericMessage =
      'If an account with this email exists, a password reset code has been sent.';

    beforeEach(() => {
      // Reset passwordResetToken mocks
      mockPrismaService.passwordResetToken.create.mockReset();
      mockPrismaService.passwordResetToken.updateMany.mockReset();
      mockPrismaService.passwordResetToken.findFirst.mockReset();
      mockPrismaService.passwordResetToken.update.mockReset();
    });

    it('should return generic message for non-existent email (account enumeration protection)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(result).toEqual({ message: genericMessage });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      // Should not call create or updateMany when user doesn't exist
      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(
        mockPrismaService.passwordResetToken.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('should create reset token and send email for existing user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ id: 1 });

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(result).toEqual({ message: genericMessage });
      expect(
        mockPrismaService.passwordResetToken.updateMany,
      ).toHaveBeenCalledWith({
        where: { userId: 1, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'testuser',
        expect.any(String),
      );
    });

    it('should invalidate previous unused reset tokens', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ id: 1 });

      await service.forgotPassword(forgotPasswordDto);

      expect(
        mockPrismaService.passwordResetToken.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, usedAt: null },
        }),
      );
    });
  });

  describe('verifyResetCode', () => {
    const verifyResetCodeDto = { email: 'test@example.com', code: '123456' };

    beforeEach(() => {
      mockPrismaService.passwordResetToken.findFirst.mockReset();
      mockPrismaService.passwordResetToken.update.mockReset();
    });

    it('should return reset token for valid code', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        attempts: 0,
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});

      const result = await service.verifyResetCode(verifyResetCodeDto);

      expect(result).toHaveProperty('resetToken');
      expect(typeof result.resetToken).toBe('string');
      expect(result.resetToken.length).toBeGreaterThan(0);
      expect(
        mockPrismaService.passwordResetToken.findFirst,
      ).toHaveBeenCalledWith({
        where: { userId: 1, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should throw BadRequestException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyResetCode(verifyResetCodeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for non-existent reset token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.verifyResetCode(verifyResetCodeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired code', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash,
        expiresAt: new Date(Date.now() - 3600000),
        usedAt: null,
        attempts: 0,
      });

      await expect(service.verifyResetCode(verifyResetCodeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for already used code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      // Used code won't be found because findFirst filters by usedAt: null
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.verifyResetCode(verifyResetCodeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for too many failed attempts', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        attempts: 5,
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});

      await expect(service.verifyResetCode(verifyResetCodeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should increment attempts counter on invalid code', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        attempts: 0,
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});

      await expect(
        service.verifyResetCode({
          email: 'test@example.com',
          code: 'wrongcode',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { attempts: 1 },
      });
    });

    it('should mark code as used and store reset token hash', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        attempts: 0,
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});

      await service.verifyResetCode(verifyResetCodeDto);

      expect(mockPrismaService.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            usedAt: expect.any(Date),
            codeHash: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto = {
      resetToken: 'valid-reset-token',
      newPassword: 'NewSecurePassword123!',
    };

    beforeEach(() => {
      mockPrismaService.passwordResetToken.findFirst.mockReset();
      mockPrismaService.passwordResetToken.update.mockReset();
      mockPrismaService.user.update.mockReset();
      mockPrismaService.refreshToken.deleteMany.mockReset();
      mockPrismaService.$transaction.mockReset();
    });

    it('should reset password successfully and invalidate sessions', async () => {
      const resetTokenHash = await bcrypt.hash('valid-reset-token', 10);
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.$transaction.mockImplementation((operations: any[]) =>
        Promise.all(operations.map((op: any) => op)),
      );

      const result = await service.resetPassword(resetPasswordDto);

      expect(result).toEqual({
        message:
          'Password reset successfully. Please log in with your new password.',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: expect.any(String) },
      });
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('should throw BadRequestException for invalid reset token', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired reset token', async () => {
      // Service query filters: usedAt != null AND expiresAt >= now
      // Expired token won't match, so findFirst returns null
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for already used reset token', async () => {
      // Service query requires usedAt != null, but this token has usedAt = null
      // So findFirst returns null
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for non-existent user', async () => {
      const resetTokenHash = await bcrypt.hash('valid-reset-token', 10);
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 999,
        codeHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should hash the new password', async () => {
      const resetTokenHash = await bcrypt.hash('valid-reset-token', 10);
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.$transaction.mockImplementation((operations: any[]) =>
        Promise.all(operations.map((op: any) => op)),
      );

      await service.resetPassword(resetPasswordDto);

      const updateCall = mockPrismaService.user.update.mock.calls[0][0];
      const newPasswordHash = updateCall.data.passwordHash;
      expect(newPasswordHash).not.toBe(resetPasswordDto.newPassword);
      await expect(
        bcrypt.compare(resetPasswordDto.newPassword, newPasswordHash),
      ).resolves.toBe(true);
    });

    it('should mark reset token as fully used after successful reset', async () => {
      const resetTokenHash = await bcrypt.hash('valid-reset-token', 10);
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.$transaction.mockImplementation((operations: any[]) =>
        Promise.all(operations.map((op: any) => op)),
      );

      await service.resetPassword(resetPasswordDto);

      expect(mockPrismaService.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            usedAt: expect.any(Date),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should not allow reuse of reset token after password change', async () => {
      const resetTokenHash = await bcrypt.hash('valid-reset-token', 10);
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        codeHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(), // Already used
      });
      mockPrismaService.passwordResetToken.update.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue(
        buildUser(passwordHash, { isEmailVerified: true }),
      );
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.$transaction.mockImplementation((operations: any[]) =>
        Promise.all(operations.map((op: any) => op)),
      );

      await service.resetPassword(resetPasswordDto);

      // Second attempt should fail - token is now expired (findFirst returns null)
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
