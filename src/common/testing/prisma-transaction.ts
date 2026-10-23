/**
 * Makes `mock.$transaction` behave like Prisma's: an interactive callback runs
 * against the mock itself, and a batch array resolves to its results in order.
 * Assertions on model methods therefore hold whether or not the service calls
 * them inside a transaction. Survives `jest.clearAllMocks`.
 */
export function mockPrismaTransactions<T extends object>(
  mock: T,
): T & { $transaction: jest.Mock } {
  return Object.assign(mock, {
    $transaction: jest.fn((work: ((tx: T) => unknown) | unknown[]) =>
      Array.isArray(work) ? Promise.all(work) : work(mock),
    ),
  });
}
