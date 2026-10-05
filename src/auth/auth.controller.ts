import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { AUTH_RATE_LIMIT } from '../common/config/rate-limit.config';
import {
  PASSWORD_RESET_RATE_LIMIT,
  VERIFY_RESET_CODE_RATE_LIMIT,
} from '../common/config/rate-limit.config';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: AUTH_RATE_LIMIT })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Username or email already exists' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_RATE_LIMIT })
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token successfully refreshed',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 204, description: 'User successfully logged out' })
  async logout(@Body('userId') userId: number): Promise<void> {
    return this.authService.logout(userId);
  }

  @Get('confirm-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_RATE_LIMIT })
  @ApiOperation({ summary: 'Confirm email address with token' })
  @ApiQuery({ name: 'token', description: 'Email confirmation token' })
  @ApiResponse({ status: 200, description: 'Email confirmed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired confirmation token',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async confirmEmail(
    @Query() confirmEmailDto: ConfirmEmailDto,
  ): Promise<{ message: string }> {
    return this.authService.confirmEmail(confirmEmailDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: PASSWORD_RESET_RATE_LIMIT })
  @ApiOperation({ summary: 'Request a password reset code' })
  @ApiResponse({
    status: 200,
    description:
      'If an account with this email exists, a password reset code has been sent.',
    schema: {
      example: {
        message:
          'If an account with this email exists, a password reset code has been sent.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests. Please try again later.',
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: VERIFY_RESET_CODE_RATE_LIMIT })
  @ApiOperation({ summary: 'Verify the password reset code' })
  @ApiResponse({
    status: 200,
    description:
      'Code verified successfully. Returns a reset token for the password reset step.',
    schema: {
      example: { resetToken: 'secure-random-token-for-password-reset' },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset code' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests. Please try again later.',
  })
  async verifyResetCode(
    @Body() verifyResetCodeDto: VerifyResetCodeDto,
  ): Promise<{ resetToken: string }> {
    return this.authService.verifyResetCode(verifyResetCodeDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: PASSWORD_RESET_RATE_LIMIT })
  @ApiOperation({ summary: 'Reset password using the reset token' })
  @ApiResponse({
    status: 200,
    description:
      'Password reset successfully. Please log in with your new password.',
    schema: {
      example: {
        message:
          'Password reset successfully. Please log in with your new password.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token, or invalid password format',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests. Please try again later.',
  })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
