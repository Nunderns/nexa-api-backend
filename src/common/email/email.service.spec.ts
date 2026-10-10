import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

/**
 * The service is instantiated in every app boot (it is a provider of a module
 * imported by `AuthModule`), so the no-key path has to work without throwing:
 * CI, local development and forks of this repo all boot without the secret.
 */
describe('EmailService', () => {
  const buildService = async (env: Record<string, string | undefined>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  };

  const template = {
    subject: 'Confirm your email address',
    html: '<p>hi</p>',
    text: 'hi',
  };

  describe('without RESEND_API_KEY', () => {
    it('should be constructible', async () => {
      const service = await buildService({});
      expect(service).toBeDefined();
    });

    it('should report the send as done so registration is not blocked', async () => {
      const service = await buildService({});
      await expect(service.sendEmail('a@example.com', template)).resolves.toBe(
        true,
      );
    });

    it('should generate a confirmation email without contacting Resend', async () => {
      const service = await buildService({});
      const generated = service.generateConfirmationTemplate('token', 'lena');

      expect(generated.subject).toBe('Confirm your email address');
      expect(generated.html).toContain('/auth/confirm-email?token=token');
      await expect(
        service.sendConfirmationEmail('a@example.com', 'lena', 'token'),
      ).resolves.toBe(true);
    });

    it('should generate a password reset email without contacting Resend', async () => {
      const service = await buildService({});
      const generated = service.generatePasswordResetTemplate('123456', 'lena');

      expect(generated.html).toContain('123456');
      await expect(
        service.sendPasswordResetEmail('a@example.com', 'lena', '123456'),
      ).resolves.toBe(true);
    });

    it('should treat an empty key as absent', async () => {
      const service = await buildService({ RESEND_API_KEY: '' });
      await expect(service.sendEmail('a@example.com', template)).resolves.toBe(
        true,
      );
    });
  });

  describe('with RESEND_API_KEY', () => {
    it('should be constructible', async () => {
      const service = await buildService({ RESEND_API_KEY: 're_test_key' });
      expect(service).toBeDefined();
    });

    it('should point the links at APP_URL when configured', async () => {
      const service = await buildService({
        RESEND_API_KEY: 're_test_key',
        APP_URL: 'https://nexa.example.com',
      });

      expect(
        service.generateConfirmationTemplate('token', 'lena').html,
      ).toContain('https://nexa.example.com/auth/confirm-email?token=token');
    });

    it('should report a failed send instead of throwing', async () => {
      const service = await buildService({ RESEND_API_KEY: 're_test_key' });

      // The SDK call is stubbed rather than performed: no request may leave
      // the test run, and a real API call from CI would be both flaky and
      // unwanted. Rejecting with a network-style error exercises the catch.
      const resend = (
        service as unknown as { resend: { emails: { send: unknown } } }
      ).resend;
      resend.emails.send = jest
        .fn()
        .mockRejectedValue(new Error('network unreachable'));

      await expect(service.sendEmail('a@example.com', template)).resolves.toBe(
        false,
      );
    });
  });
});
