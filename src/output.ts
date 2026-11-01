import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function outputFilename(postalCode: string, date: Date, suffix: string = randomUUID()): string {
  const postal = postalCode.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)) throw new Error("Invalid Canadian postal code.");
  return `offers-${postal}-${date.toISOString().replace(/[:.]/g, "-")}-${suffix}.json`;
}

export async function saveResult(path: string | URL, result: unknown): Promise<void> {
  const destination = path instanceof URL ? fileURLToPath(path) : path;
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
