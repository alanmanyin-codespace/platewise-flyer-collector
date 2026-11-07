import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface Task { postal: string; query: string }
export interface SeriesOptions {
  seriesSize: number;
  delayMs: number;
  attempts: number;
  baseDelayMs: number;
  maxConsecutiveFailures: number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const taskKey = (task: Task) => `${task.postal}\n${task.query}`;
export const buildTasks = (postalCodes: string[], queries: string[]): Task[] => postalCodes.flatMap(postal => queries.map(query => ({ postal, query })));

// Rate limits, server errors and network failures can pass; other HTTP errors will not.
function retryable(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status === undefined || status === 429 || status >= 500;
}

export async function withRetry<T>(action: () => Promise<T>, options: Pick<SeriesOptions, "attempts" | "baseDelayMs" | "sleep">): Promise<T> {
  const sleep = options.sleep ?? wait;
  for (let attempt = 1; ; attempt++) {
    try { return await action(); }
    catch (error) {
      if (attempt >= options.attempts || !retryable(error)) throw error;
      await sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

// Runs up to seriesSize tasks. A failed task stays pending for the next series; repeated
// failures end the series early rather than keep calling a source that is refusing requests.
export async function runSeries(pending: Task[], options: SeriesOptions, run: (task: Task) => Promise<void>): Promise<{ completed: number; failed: Task[]; stopped: boolean }> {
  const sleep = options.sleep ?? wait;
  const failed: Task[] = [];
  let completed = 0, consecutive = 0;
  for (const [index, task] of pending.slice(0, options.seriesSize).entries()) {
    if (index && options.delayMs) await sleep(options.delayMs);
    try {
      await withRetry(() => run(task), options);
      completed++;
      consecutive = 0;
    } catch {
      failed.push(task);
      if (++consecutive >= options.maxConsecutiveFailures) return { completed, failed, stopped: true };
    }
  }
  return { completed, failed, stopped: false };
}

// One JSON line per finished task, so a crash loses at most the request in progress.
export async function recordTask(path: string | URL, task: Task, offers: unknown[]): Promise<void> {
  const file = path instanceof URL ? fileURLToPath(path) : path;
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify({ ...task, offers })}\n`, { mode: 0o600 });
}

export async function loadJob<T = unknown>(path: string | URL): Promise<Map<string, T[]>> {
  const saved = new Map<string, T[]>();
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return saved;
    throw error;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Task & { offers: T[] };
      saved.set(taskKey(entry), entry.offers);
    } catch { /* a line cut off by a crash; that task simply runs again */ }
  }
  return saved;
}
