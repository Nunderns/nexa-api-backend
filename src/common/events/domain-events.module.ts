import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

/**
 * In-process event bus for `domain-events.ts`.
 *
 * Listeners are registered with `{ async: true, promisify: true }` and catch
 * their own errors, so `emit` returns immediately and a listener failure can
 * never surface in, or roll back, the request that published the event.
 */
@Module({
  imports: [EventEmitterModule.forRoot()],
})
export class DomainEventsModule {}
