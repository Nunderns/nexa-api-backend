import { extractMentions } from './mentions';
import { MAX_MENTIONS_PER_CONTENT } from './notifications.constants';

describe('extractMentions', () => {
  it('finds handles following the registration rule', () => {
    expect(extractMentions('hey @alice and @bob_99, see @X_y')).toEqual([
      'alice',
      'bob_99',
      'X_y',
    ]);
  });

  it('deduplicates repeated mentions, keeping first-seen order', () => {
    expect(extractMentions('@bob @alice @bob @bob')).toEqual(['bob', 'alice']);
  });

  it('keeps case, since usernames are case sensitive', () => {
    expect(extractMentions('@Ana @ana')).toEqual(['Ana', 'ana']);
  });

  it('collects across several texts (post title and body)', () => {
    expect(extractMentions('Ping @alice', null, undefined, '@bob')).toEqual([
      'alice',
      'bob',
    ]);
  });

  it.each([
    ['an e-mail address', 'mail ana@example.com'],
    ['a doubled sign', '@@alice'],
    ['a handle shorter than 3', '@ab'],
    ['a handle longer than 30', `@${'a'.repeat(31)}`],
    ['a bare sign', 'look @ me'],
  ])('ignores %s', (_label, text) => {
    expect(extractMentions(text)).toEqual([]);
  });

  it('stops at punctuation', () => {
    expect(extractMentions('(@alice), @bob. @carol!')).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });

  it(`caps the result at ${MAX_MENTIONS_PER_CONTENT} users`, () => {
    const text = Array.from({ length: 25 }, (_, i) => `@user${i}`).join(' ');

    expect(extractMentions(text)).toHaveLength(MAX_MENTIONS_PER_CONTENT);
  });

  it('stays linear on adversarial input', () => {
    const text = `@${'a'.repeat(100_000)}`.repeat(5);
    const started = Date.now();

    expect(extractMentions(text)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
