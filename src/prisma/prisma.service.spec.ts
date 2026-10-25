import { PrismaService } from './prisma.service';

/**
 * Built from the prototype, never through the constructor: `.env` points
 * DATABASE_URL at a real database, and nothing here may open a pool to it.
 */
describe('PrismaService.cleanDatabase', () => {
  const savedEnv = process.env.NODE_ENV;

  function serviceWith(models: Record<string, unknown>) {
    return Object.assign(
      Object.create(PrismaService.prototype),
      models,
    ) as PrismaService;
  }

  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  it('empties every model delegate and skips internals', async () => {
    process.env.NODE_ENV = 'test';
    const user = { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const post = { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) };
    const internal = { deleteMany: jest.fn() };

    await serviceWith({
      user,
      post,
      notADelegate: {},
      _engine: internal,
      $extensions: internal,
    }).cleanDatabase();

    expect(user.deleteMany).toHaveBeenCalled();
    expect(post.deleteMany).toHaveBeenCalled();
    expect(internal.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to run in production', async () => {
    process.env.NODE_ENV = 'production';
    const user = { deleteMany: jest.fn() };

    await expect(
      serviceWith({ user }).cleanDatabase(),
    ).resolves.toBeUndefined();
    expect(user.deleteMany).not.toHaveBeenCalled();
  });
});
