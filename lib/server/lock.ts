import { open, readFile, unlink } from "node:fs/promises";
export async function ownerAlive(file: string) {
  try {
    const { pid } = JSON.parse(await readFile(file, "utf8")) as { pid: number };
    if (!Number.isInteger(pid) || pid < 1) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code !== "ESRCH";
    }
  } catch {
    return true;
  }
}
export async function acquireLock(file: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid }));
      return async () => {
        await handle.close();
        await unlink(file).catch(() => {});
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (await ownerAlive(file)) return null;
      await unlink(file).catch(() => {});
    }
  }
  return null;
}
