import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export class CustomValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = errors.map((error) => {
          return Object.values(error.constraints || {}).join(', ');
        });
        return new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      },
    });
  }
}
