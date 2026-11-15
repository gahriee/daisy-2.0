import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.send;
    destroy = mocks.destroy;
  },
  HeadBucketCommand: class {},
  GetObjectCommand: class {},
  PutObjectCommand: class {},
  HeadObjectCommand: class {},
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.signed,
}));
import {
  checkStorage,
  getStorage,
  headPrivateObject,
  putPrivateObject,
  signPrivateDownload,
  signPrivateUpload,
} from "../../../../src/server/storage/client";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function configure(): void {
  vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://storage.example.test");
  vi.stubEnv("AWS_REGION", "ap-southeast-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "example");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
}
it("fails closed on missing credentials", () => {
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
  expect(getStorage).toThrow(
    "Configure branch-scoped Neon storage credentials",
  );
});
it("releases its client after a failed bucket check", async () => {
  configure();
  mocks.send.mockRejectedValue(new Error("provider failure"));
  await expect(checkStorage()).rejects.toThrow("provider failure");
  expect(mocks.destroy).toHaveBeenCalledOnce();
});
it("signs private downloads for only 60 seconds and releases its client", async () => {
  configure();
  mocks.signed.mockResolvedValue("https://storage.example.test/signed");
  expect(await signPrivateDownload("owner/proof")).toContain("signed");
  expect(mocks.signed).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    { expiresIn: 60 },
  );
  expect(mocks.destroy).toHaveBeenCalledOnce();
});
it("signs private uploads, writes bounded objects, and returns null on missing head object", async () => {
  configure();
  mocks.signed.mockResolvedValue("https://storage.example.test/upload");
  expect(
    await signPrivateUpload({
      key: "owner/proof",
      contentType: "image/jpeg",
      contentLength: 1024,
    }),
  ).toContain("upload");
  mocks.send.mockResolvedValueOnce({});
  expect(
    await putPrivateObject({
      key: "owner/proof",
      contentType: "image/jpeg",
      body: new Uint8Array([1, 2, 3]),
    }),
  ).toEqual({ byteSize: 3 });

  mocks.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
  expect(await headPrivateObject("owner/missing")).toBeNull();
  expect(mocks.destroy).toHaveBeenCalledTimes(3);
});
