import openNextHandler from "./open-next-entry.mjs";
import { dispatchScheduledCron } from "../src/server/jobs/cloudflare-cron";

type WorkerEnv = Record<string, unknown> & {
  APP_ORIGIN?: string;
  CRON_SECRET?: string;
};

type ScheduledController = {
  cron: string;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const worker = {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return openNextHandler.fetch(request, env, ctx);
  },

  scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): void {
    ctx.waitUntil(
      dispatchScheduledCron({
        cron: controller.cron,
        env,
        fetcher: (request) => openNextHandler.fetch(request, env, ctx),
      }),
    );
  },
};

export default worker;

