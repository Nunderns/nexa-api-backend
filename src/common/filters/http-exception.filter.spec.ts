import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  function run(exception: unknown) {
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/posts/9' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);

    return {
      status: response.status.mock.calls[0][0],
      body: json.mock.calls[0][0],
    };
  }

  it('keeps the status and message of an HttpException', () => {
    const { status, body } = run(new NotFoundException('Post not found'));

    expect(status).toBe(404);
    expect(body).toEqual({
      success: false,
      statusCode: 404,
      timestamp: expect.any(String),
      path: '/posts/9',
      message: 'Post not found',
    });
  });

  it('forwards the per-field errors of a validation failure', () => {
    const { body } = run(
      new BadRequestException({
        message: 'Validation failed',
        errors: ['title should not be empty'],
      }),
    );

    expect(body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      errors: ['title should not be empty'],
    });
  });

  it('hides the details of an unexpected error behind a 500', () => {
    const { status, body } = run(new Error('relation "posts" does not exist'));

    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('relation');
  });
});
