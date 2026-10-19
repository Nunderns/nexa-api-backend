import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  GLOBAL_RATE_LIMIT,
  NOTIFICATION_BULK_RATE_LIMIT,
  NOTIFICATION_PREFERENCES_RATE_LIMIT,
  USER_THROTTLER_NAME,
} from '../common/config/rate-limit.config';
import { UserThrottleGuard } from '../common/guards/user-throttle.guard';
import {
  MarkAllReadResponseDto,
  NotificationPageDto,
  NotificationResponseDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationPreferencesDto,
  UpdatePreferencesDto,
} from './dto/update-preferences.dto';
import { NotificationsService } from './notifications.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Every route acts on the caller's own notifications only. The recipient is
 * always the authenticated user; no route accepts a user id. A notification
 * that belongs to someone else answers 404, the same as an unknown id, so
 * ids cannot be probed (IDOR).
 */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Missing or invalid token' })
@ApiResponse({ status: 429, description: 'Too many requests' })
@UseGuards(JwtAuthGuard, UserThrottleGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiOperation({
    summary: 'List my notifications, newest first',
    description:
      'Cursor paginated. Pass `nextCursor` from a page as `cursor` to get the ' +
      'next (older) page. Use this to recover anything missed while the ' +
      'WebSocket was disconnected.',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid query parameters or cursor',
  })
  list(
    @CurrentUser('id') userId: number,
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notificationsService.list(userId, query);
  }

  @Get('unread-count')
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiOperation({ summary: 'Number of my unread notifications' })
  @ApiOkResponse({ type: UnreadCountDto })
  unreadCount(@CurrentUser('id') userId: number): Promise<UnreadCountDto> {
    return this.notificationsService.unreadCount(userId);
  }

  @Get('preferences')
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiOperation({
    summary: 'My notification preferences',
    description:
      'Every category defaults to enabled. A disabled category is neither ' +
      'stored nor pushed. System notifications cannot be disabled.',
  })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  getPreferences(
    @CurrentUser('id') userId: number,
  ): Promise<NotificationPreferencesDto> {
    return this.notificationsService.getPreferences(userId);
  }

  @Patch('preferences')
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: NOTIFICATION_PREFERENCES_RATE_LIMIT,
  })
  @ApiOperation({
    summary: 'Update my notification preferences',
    description: 'Partial update; omitted categories keep their value.',
  })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  @ApiResponse({ status: 400, description: 'Non-boolean or unknown field' })
  updatePreferences(
    @CurrentUser('id') userId: number,
    @Body() body: UpdatePreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.notificationsService.updatePreferences(userId, body);
  }

  @Patch('read-all')
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: NOTIFICATION_BULK_RATE_LIMIT,
  })
  @ApiOperation({
    summary: 'Mark all my notifications as read',
    description:
      'Covers notifications created up to the moment of the request; one ' +
      'that arrives concurrently stays unread.',
  })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  markAllRead(
    @CurrentUser('id') userId: number,
  ): Promise<MarkAllReadResponseDto> {
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiOperation({
    summary: 'Mark one of my notifications as read',
    description: 'Idempotent: an already-read notification is returned as is.',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markRead(
    @CurrentUser('id') userId: number,
    @Param('id', uuid) id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markRead(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: GLOBAL_RATE_LIMIT,
    [USER_THROTTLER_NAME]: GLOBAL_RATE_LIMIT,
  })
  @ApiOperation({ summary: 'Delete one of my notifications' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  remove(
    @CurrentUser('id') userId: number,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    return this.notificationsService.remove(userId, id);
  }
}
