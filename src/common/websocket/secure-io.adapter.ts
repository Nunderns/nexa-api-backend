import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'http';
import type { ServerOptions } from 'socket.io';
import { allowedOrigins } from '../config/http-security.config';

/**
 * Largest message a client may send. Clients send nothing on our namespaces
 * (events are server to client only), so anything beyond a small frame is
 * abuse.
 */
const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024;

/**
 * Socket.IO adapter that applies the HTTP origin policy to WebSockets.
 *
 * CORS alone is not enough here: browsers enforce it for the HTTP
 * long-polling transport only, while a WebSocket upgrade is sent from any
 * page with that page's `Origin`. `allowRequest` therefore checks the
 * `Origin` header on every handshake request, polling and upgrade alike.
 *
 * A request without `Origin` is allowed: it does not come from a browser
 * page, so there is no cross-site context to protect, and it still has to
 * present a valid JWT to the gateway.
 */
export class SecureIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): unknown {
    const origins = allowedOrigins();

    return super.createIOServer(port, {
      ...options,
      serveClient: false,
      maxHttpBufferSize: MAX_CLIENT_MESSAGE_BYTES,
      cors: { origin: origins, credentials: false },
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null | undefined, allowed: boolean) => void,
      ) => {
        const origin = request.headers.origin;
        callback(null, origin === undefined || origins.includes(origin));
      },
    });
  }
}
