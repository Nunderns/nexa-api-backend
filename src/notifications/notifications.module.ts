import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationEventsListener } from './notification-events.listener';
import { NotificationPublisher } from './notification-publisher';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * Depends only on Prisma and Auth. Content and chat modules reach it through
 * domain events, never through imports, so there is no cycle to manage.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationsGateway,
    { provide: NotificationPublisher, useExisting: NotificationsGateway },
    NotificationEventsListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
