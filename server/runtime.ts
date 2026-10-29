// Convenience factory used by the Lab and the harness: one fresh session = one repo + one server.
import { createServer } from "./createServer.ts";
import { type Clock, type RandomSource, systemClock, webRandom } from "./domain/crypto.ts";
import { createMemoryRepo, type MemoryRepoOptions } from "./repo/memoryRepo.ts";
import type { Repo } from "./repo/Repo.ts";

export interface SessionOptions {
  viewHtml: string;
  clock?: Clock;
  random?: RandomSource;
  repo?: MemoryRepoOptions;
}

export function createSession(options: SessionOptions) {
  const repo: Repo = createMemoryRepo(options.repo);
  const server = createServer({
    repo,
    clock: options.clock ?? systemClock,
    random: options.random ?? webRandom,
    viewHtml: options.viewHtml,
  });
  return { repo, server };
}
