import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ArgumentMetadata } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  NOTIFICATION_BULK_RATE_LIMIT,
  NOTIFICATION_PREFERENCES_RATE_LIMIT,
  USER_THROTTLER_NAME,
} from '../common/config/rate-limit.config';
import { UserThrottleGuard } from '../common/guards/user-throttle.guard';
import { CustomValidationPipe } from '../common/pipes/validation.pipe';
import { collectRoutes, compareRoutes } from '../common/testing/route-metadata';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NOTIFICATIONS_MAX_PAGE_SIZE } from './notifications.constants';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const ID = '3f1c0d52-8a0e-4c4e-9d7a-2b1e6f0c9a11';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const service = {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    remove: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', limit: 100, ttl: 60_000 }],
        }),
      ],
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get(NotificationsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('exposes the notification endpoints', () => {
    expect(collectRoutes(NotificationsController)).toEqual(
      [
        'GET /notifications',
        'GET /notifications/unread-count',
        'GET /notifications/preferences',
        'PATCH /notifications/preferences',
        'PATCH /notifications/read-all',
        'PATCH /notifications/:id/read',
        'DELETE /notifications/:id',
      ].sort(compareRoutes),
    );
  });

  it('requires authentication and a per-user budget on every route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificationsController),
    ).toEqual([JwtAuthGuard, UserThrottleGuard]);
  });

  it.each([
    ['markAllRead', NOTIFICATION_BULK_RATE_LIMIT],
    ['updatePreferences', NOTIFICATION_PREFERENCES_RATE_LIMIT],
  ])('applies a tighter per-user limit to %s', (method, budget) => {
    const handler = (
      NotificationsController.prototype as unknown as Record<string, object>
    )[method];

    expect(
      Reflect.getMetadata(`THROTTLER:LIMIT${USER_THROTTLER_NAME}`, handler),
    ).toBe(budget.limit);
  });

  it('always uses the authenticated user as recipient', async () => {
    await controller.list(7, { limit: 20 });
    await controller.markRead(7, ID);
    await controller.remove(7, ID);
    await controller.markAllRead(7);

    expect(service.list).toHaveBeenCalledWith(7, { limit: 20 });
    expect(service.markRead).toHaveBeenCalledWith(7, ID);
    expect(service.remove).toHaveBeenCalledWith(7, ID);
    expect(service.markAllRead).toHaveBeenCalledWith(7);
  });
});

describe('notification DTO validation', () => {
  const pipe = new CustomValidationPipe();
  const asQuery: ArgumentMetadata = {
    type: 'query',
    metatype: NotificationQueryDto,
  };
  const asBody: ArgumentMetadata = {
    type: 'body',
    metatype: UpdatePreferencesDto,
  };

  it('applies defaults and parses query strings', async () => {
    await expect(pipe.transform({}, asQuery)).resolves.toMatchObject({
      limit: 20,
      unreadOnly: false,
    });
    await expect(
      pipe.transform({ limit: '5', unreadOnly: 'false' }, asQuery),
    ).resolves.toMatchObject({ limit: 5, unreadOnly: false });
    await expect(
      pipe.transform({ unreadOnly: 'true', type: 'USER_MENTION' }, asQuery),
    ).resolves.toMatchObject({ unreadOnly: true, type: 'USER_MENTION' });
  });

  it.each([
    [
      'a limit above the maximum',
      { limit: String(NOTIFICATIONS_MAX_PAGE_SIZE + 1) },
    ],
    ['a zero limit', { limit: '0' }],
    ['an unsupported type', { type: 'FRIEND_REQUEST' }],
    ['a non-boolean unreadOnly', { unreadOnly: 'yes' }],
    ['a malformed cursor', { cursor: "' OR 1=1 --" }],
    ['an unknown parameter', { recipientId: '2' }],
  ])('rejects %s', async (_label, query) => {
    await expect(pipe.transform(query, asQuery)).rejects.toThrow(
      'Validation failed',
    );
  });

  it('accepts a partial preference update', async () => {
    await expect(
      pipe.transform({ votes: false }, asBody),
    ).resolves.toMatchObject({ votes: false });
  });

  it.each([
    ['a string boolean', { votes: 'false' }],
    ['a number', { mentions: 0 }],
    ['an unknown field (mass assignment)', { userId: 2 }],
  ])('rejects %s in preferences', async (_label, body) => {
    await expect(pipe.transform(body, asBody)).rejects.toThrow(
      'Validation failed',
    );
  });
});
