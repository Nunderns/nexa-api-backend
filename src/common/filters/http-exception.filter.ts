import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // The global CustomValidationPipe raises BadRequestException with an
    // `errors` array naming each offending field. Rebuilding the envelope
    // from scratch would drop it, leaving the client with nothing but
    // "Validation failed" and no way to tell which field was rejected.
    const details =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const errors =
      typeof details === 'object' && details !== null && !Array.isArray(details)
        ? (details as { errors?: unknown }).errors
        : undefined;

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(errors === undefined ? {} : { errors }),
    });
  }
}
