import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  it('wraps the handler result in the success envelope', async () => {
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    const result = await lastValueFrom(
      new TransformInterceptor().intercept({} as ExecutionContext, next),
    );

    expect(result).toEqual({
      data: { id: 1 },
      success: true,
      timestamp: expect.any(String),
    });
  });
});
