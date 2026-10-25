import { ArgumentMetadata } from '@nestjs/common';
import { CustomValidationPipe } from '../common/pipes/validation.pipe';
import { PopularFeedQueryDto } from './dto/popular-feed-query.dto';

describe('PopularFeedQueryDto validation', () => {
  const pipe = new CustomValidationPipe();
  const asQuery: ArgumentMetadata = {
    type: 'query',
    metatype: PopularFeedQueryDto,
  };

  it('applies defaults', async () => {
    await expect(pipe.transform({}, asQuery)).resolves.toMatchObject({
      sort: 'hot',
      t: 'day',
      page: 1,
      limit: 20,
    });
  });

  it('accepts every option and upper-cases the country', async () => {
    await expect(
      pipe.transform(
        { sort: 'top', t: 'week', geo: 'br', page: '2', limit: '10' },
        asQuery,
      ),
    ).resolves.toMatchObject({
      sort: 'top',
      t: 'week',
      geo: 'BR',
      page: 2,
      limit: 10,
    });
  });

  it.each([
    ['an unknown sort', { sort: 'best' }],
    ['an unknown window', { t: 'today' }],
    ['a country outside the list', { geo: 'ZZ' }],
    ['an injection attempt as country', { geo: "BR' OR 1=1 --" }],
    ['an unknown parameter', { sortBy: 'hot' }],
  ])('rejects %s', async (_label, query) => {
    await expect(pipe.transform(query, asQuery)).rejects.toThrow(
      'Validation failed',
    );
  });
});
