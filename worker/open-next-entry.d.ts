type OpenNextWorkerHandler = {
  fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response>;
};

declare const openNextHandler: OpenNextWorkerHandler;
export default openNextHandler;

