import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { collectRoutes, routeOf } from '../common/testing/route-metadata';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    confirmEmail: jest.fn(),
  };

  const authResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    userId: 1,
    username: 'testuser',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('routes', () => {
    it('should expose the auth endpoints', () => {
      expect(collectRoutes(AuthController)).toEqual(
        [
          'GET /auth/confirm-email',
          'POST /auth/login',
          'POST /auth/logout',
          'POST /auth/refresh',
          'POST /auth/register',
        ].sort(),
      );
    });

    it('should map each handler to its route', () => {
      expect(routeOf(AuthController, 'register')).toBe('POST /auth/register');
      expect(routeOf(AuthController, 'login')).toBe('POST /auth/login');
      expect(routeOf(AuthController, 'refresh')).toBe('POST /auth/refresh');
      expect(routeOf(AuthController, 'logout')).toBe('POST /auth/logout');
      expect(routeOf(AuthController, 'confirmEmail')).toBe(
        'GET /auth/confirm-email',
      );
    });
  });

  describe('register', () => {
    it('should forward the payload and return the created tokens', async () => {
      const registerDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
      };

      mockAuthService.register.mockResolvedValue(authResponse);

      const result = await controller.register(registerDto);

      expect(result).toEqual(authResponse);
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('should forward email and password to the service', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };

      mockAuthService.login.mockResolvedValue(authResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(authResponse);
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('refresh', () => {
    it('should forward the refresh token to the service', async () => {
      const refreshTokenDto = { refreshToken: 'valid-refresh-token' };

      mockAuthService.refreshToken.mockResolvedValue(authResponse);

      const result = await controller.refresh(refreshTokenDto);

      expect(result).toEqual(authResponse);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(
        refreshTokenDto,
      );
    });
  });

  describe('logout', () => {
    it('should forward the userId coming from the request body', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(1);

      expect(mockAuthService.logout).toHaveBeenCalledWith(1);
    });
  });

  describe('confirmEmail', () => {
    it('should forward the token to the service', async () => {
      const confirmEmailDto = { token: 'valid-token-123' };
      const expectedResult = { message: 'Email confirmed successfully' };

      mockAuthService.confirmEmail.mockResolvedValue(expectedResult);

      const result = await controller.confirmEmail(confirmEmailDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.confirmEmail).toHaveBeenCalledWith(
        confirmEmailDto,
      );
    });
  });
});
