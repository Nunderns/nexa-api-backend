import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';
import { SecureIoAdapter } from './secure-io.adapter';

describe('SecureIoAdapter', () => {
  const saved = process.env.FRONTEND_URL;
  let options: ServerOptions;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://nexa.app';
    jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockImplementation((_port, opts?: ServerOptions) => {
        options = opts as ServerOptions;
        return {};
      });
    new SecureIoAdapter().createIOServer(0, {
      path: '/socket.io',
    } as ServerOptions);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.FRONTEND_URL = saved;
  });

  function allows(origin?: string): boolean {
    let allowed = false;
    options.allowRequest!(
      { headers: origin ? { origin } : {} } as IncomingMessage,
      (_err, ok) => {
        allowed = ok;
      },
    );
    return allowed;
  }

  it('keeps the caller options and caps the client frame size', () => {
    expect(options).toMatchObject({
      path: '/socket.io',
      serveClient: false,
      maxHttpBufferSize: 4096,
      cors: { origin: ['https://nexa.app'], credentials: false },
    });
  });

  it('accepts the frontend origin and requests without one', () => {
    expect(allows('https://nexa.app')).toBe(true);
    expect(allows()).toBe(true);
  });

  it('refuses a handshake from another site', () => {
    expect(allows('https://evil.example')).toBe(false);
  });
});
