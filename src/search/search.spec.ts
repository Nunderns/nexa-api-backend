import { ArgumentMetadata } from '@nestjs/common';
import { CustomValidationPipe } from '../common/pipes/validation.pipe';
import { SearchQueryDto } from './dto/search-query.dto';
import { toPrefixTsQuery } from './search-query';

describe('toPrefixTsQuery', () => {
  it('requires every word and lets the last one be a prefix', () => {
    expect(toPrefixTsQuery('nest rea')).toBe('nest & rea:*');
  });

  it('keeps letters with accents and digits', () => {
    expect(toPrefixTsQuery('café 2026')).toBe('café & 2026:*');
  });

  it('drops tsquery syntax so user input cannot inject operators', () => {
    expect(toPrefixTsQuery("a&b | !c:* (d) 'e'")).toBe('a & b & c & d & e:*');
  });

  it('returns null when nothing searchable is left', () => {
    expect(toPrefixTsQuery('  !!! -- ')).toBeNull();
  });

  it('caps the number of terms', () => {
    const words = Array.from({ length: 15 }, (_, i) => `w${i}`).join(' ');
    expect(toPrefixTsQuery(words)?.split(' & ')).toHaveLength(10);
  });
});

describe('SearchQueryDto validation', () => {
  const pipe = new CustomValidationPipe();
  const asQuery: ArgumentMetadata = { type: 'query', metatype: SearchQueryDto };

  it('applies defaults and trims the term', async () => {
    await expect(
      pipe.transform({ q: '  react ' }, asQuery),
    ).resolves.toMatchObject({ q: 'react', type: 'posts', page: 1, limit: 20 });
  });

  it.each([
    {},
    { q: '   ' },
    { q: 'x'.repeat(101) },
    { q: 'a', type: 'comments' },
  ])('rejects %p', async (query) => {
    await expect(pipe.transform(query, asQuery)).rejects.toThrow();
  });
});
