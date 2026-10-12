import { createHash } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";

afterEach(() => {
  jest.restoreAllMocks();
});

test("Validator approves valid artifacts", async () => {
  const payloadBytes = Buffer.from("test payload", "utf8");

  const manifest = {
    version: "1.0.0",
    commitSha: "abc123",
    checksum: createHash("sha256").update(payloadBytes).digest("hex"),
    buildTimestamp: "2026-10-12T00:00:00Z",
  };

  const manifestResponse = {
    Body: {
      transformToString: jest.fn().mockResolvedValue(JSON.stringify(manifest)),
    },
  };

  const payloadResponse = {
    Body: {
      transformToByteArray: jest.fn().mockResolvedValue(payloadBytes),
    },
  };

  const s3SendMock = jest
    .fn()
    .mockResolvedValueOnce(manifestResponse)
    .mockResolvedValueOnce(payloadResponse);

  jest.spyOn(S3Client.prototype, "send").mockImplementation(s3SendMock);
});
