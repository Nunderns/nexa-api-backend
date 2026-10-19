/**
 * Real-time delivery port. The service depends on this abstraction rather
 * than on the gateway, so it can be unit tested without sockets and the
 * transport could change without touching business rules.
 *
 * Implementations must be best-effort and never throw: the database is the
 * source of truth, and a push that fails is recovered by the client's next
 * REST sync.
 */
export abstract class NotificationPublisher {
  abstract publishToUser(userId: number, event: string, payload: unknown): void;
}
