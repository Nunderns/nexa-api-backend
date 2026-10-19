export default async function globalTeardown(): Promise<void> {
  await globalThis.__PGLITE_SERVER__?.stop();
  await globalThis.__PGLITE_DB__?.close();
}
