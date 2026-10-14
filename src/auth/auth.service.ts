import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/email/email.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface JwtPayload {
  sub: number;
  email: string;
}

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  private generateVerificationToken(): string {
    // Generate a secure random token (32 bytes = 256 bits)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  private generateResetCode(): string {
    // Generate a secure random 6-digit numeric code
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    // Ensure it's a 6-digit number (100000-999999)
    return String(100000 + (array[0] % 900000));
  }

  private generateResetToken(): string {
    // Generate a secure random token for the reset password step
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    // Find user by email (for account enumeration protection, we don't reveal if user exists)
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return the same message for security (account enumeration protection)
    const genericMessage =
      'If an account with this email exists, a password reset code has been sent.';

    if (!user) {
      return { message: genericMessage };
    }

    // Generate a secure 6-digit reset code
    const resetCode = this.generateResetCode();
    const codeHash = await bcrypt.hash(resetCode, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate any existing unused reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Create new password reset token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt,
      },
    });

    // Send password reset email (don't await to avoid blocking)
    this.emailService
      .sendPasswordResetEmail(user.email, user.username, resetCode)
      .catch((error: Error) => {
        this.emailService['logger'].error(
          `Failed to send password reset email to ${user.email}: ${error.message}`,
        );
      });

    return { message: genericMessage };
  }

  async verifyResetCode(
    verifyResetCodeDto: VerifyResetCodeDto,
  ): Promise<{ resetToken: string }> {
    const { email, code } = verifyResetCodeDto;

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Find the latest unused reset token for this user
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Check if code has expired
    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset code has expired');
    }

    // Check attempts limit (max 5 attempts)
    if (resetToken.attempts >= 5) {
      throw new BadRequestException(
        'Too many failed attempts. Please request a new code.',
      );
    }

    // Verify the code
    const isCodeValid = await bcrypt.compare(code, resetToken.codeHash);

    // Increment attempts counter
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { attempts: resetToken.attempts + 1 },
    });

    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Generate a reset token for the password reset step
    const resetTokenValue = this.generateResetToken();
    const resetTokenHash = await bcrypt.hash(resetTokenValue, 10);
    const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Mark the code as used and store the reset token
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        usedAt: new Date(),
        codeHash: resetTokenHash, // Reuse codeHash field to store the reset token hash
        expiresAt: resetTokenExpires,
      },
    });

    return { resetToken: resetTokenValue };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { resetToken, newPassword } = resetPasswordDto;

    // Find the reset token (by hashed value)
    const storedToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        usedAt: { not: null }, // Only tokens that have been verified (code used)
        expiresAt: { gte: new Date() }, // Not expired
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!storedToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Verify the reset token
    const isTokenValid = await bcrypt.compare(resetToken, storedToken.codeHash);

    if (!isTokenValid) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Get the user
    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password and invalidate all refresh tokens (force re-login)
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: storedToken.id },
        data: {
          usedAt: new Date(), // Mark as fully used
          expiresAt: new Date(), // Expire immediately
        },
      }),
    ]);

    return {
      message:
        'Password reset successfully. Please log in with your new password.',
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { username, email, password, displayName, bio } = registerDto;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      if (existingUser.username === username) {
        throw new ConflictException('Username already exists');
      }
      if (existingUser.email === email) {
        throw new ConflictException('Email already exists');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = this.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName,
        bio,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    });

    // Send confirmation email (don't await to avoid blocking registration)
    this.emailService
      .sendConfirmationEmail(user.email, user.username, verificationToken)
      .catch((error: Error) => {
        this.emailService['logger'].error(
          `Failed to send confirmation email to ${user.email}: ${error.message}`,
        );
      });

    const tokens = await this.issueSession(user.id, user.email);

    return {
      ...tokens,
      userId: user.id,
      username: user.username,
      email: user.email,
    };
  }

  async confirmEmail(
    confirmEmailDto: ConfirmEmailDto,
  ): Promise<{ message: string }> {
    const { token } = confirmEmailDto;

    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired confirmation token');
    }

    if (
      user.emailVerificationExpires &&
      user.emailVerificationExpires < new Date()
    ) {
      throw new BadRequestException('Confirmation token has expired');
    }

    if (user.isEmailVerified) {
      return { message: 'Email already confirmed' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return { message: 'Email confirmed successfully' };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please check your inbox for the confirmation link.',
      );
    }

    const tokens = await this.issueSession(user.id, user.email);

    return {
      ...tokens,
      userId: user.id,
      username: user.username,
      email: user.email,
    };
  }

  /**
   * Exchanges a refresh token for a new access/refresh pair (rotation).
   *
   * The signature alone is not enough: the token must also exist in
   * `refresh_tokens` and not be revoked, which is what makes logout, password
   * reset and rotation actually invalidate it. Lookup is by SHA-256 of the
   * token, a deterministic hash, so it can be found with an indexed equality
   * query (a salted hash like bcrypt can only be compared, never searched).
   *
   * A token that is found but already revoked was used before, so either the
   * legitimate client or an attacker holds a copy of an old token. We cannot
   * tell which, so every session of the user is revoked and both must log in
   * again.
   */
  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    const { refreshToken } = refreshTokenDto;

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(refreshToken) },
    });

    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; all sessions revoked`,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please check your inbox for the confirmation link.',
      );
    }

    const tokens = this.generateTokens(user.id, user.email);

    await this.prisma.$transaction(async (tx) => {
      // Conditional on `revokedAt: null` so that two concurrent refreshes
      // with the same token cannot both succeed: only one of them flips the
      // row, the other sees count 0 and is rejected.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (count === 0) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashRefreshToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
    });

    return {
      ...tokens,
      userId: user.id,
      username: user.username,
      email: user.email,
    };
  }

  async logout(userId: number): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /** Signs a new token pair and persists the refresh token. */
  private async issueSession(userId: number, email: string) {
    const tokens = this.generateTokens(userId, email);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashRefreshToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return tokens;
  }

  /**
   * SHA-256 rather than bcrypt: the token is already 256+ bits of signed,
   * unguessable data, so slow hashing adds nothing, and a deterministic
   * hash is what allows looking the row up by value.
   */
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateTokens(userId: number, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'access-secret',
      expiresIn: '15m',
    });

    // `jwtid` makes every refresh token unique. Without it, two logins of
    // the same user within the same second would sign byte-identical tokens
    // and collide on the unique `token_hash` column.
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      expiresIn: '7d',
      jwtid: randomUUID(),
    });

    return { accessToken, refreshToken };
  }

  async validateUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        karma: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }
}
