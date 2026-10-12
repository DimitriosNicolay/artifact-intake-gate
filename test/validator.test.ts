import { createHash } from "node:crypto";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { S3Event } from "aws-lambda";

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
    .mockResolvedValueOnce(payloadResponse)
    .mockResolvedValue({});

  jest.spyOn(S3Client.prototype, "send").mockImplementation(s3SendMock);

  const ddbSendMock = jest.fn().mockResolvedValue({});
  jest
    .spyOn(DynamoDBDocumentClient.prototype, "send")
    .mockImplementation(ddbSendMock);

  process.env.tableName = "testArtifactRegistry";

  const { handler } = await import("../lambda/validator/index.js");

  const event = {
    Records: [
      {
        s3: {
          bucket: { name: "testArtifactBucket" },
          object: { key: "build42/manifest.json" },
        },
      },
    ],
  };

  await handler(event as S3Event);

  expect(ddbSendMock).toHaveBeenCalledTimes(1);

  const putInput = ddbSendMock.mock.calls[0][0].input;

  expect(putInput).toMatchObject({
    TableName: "testArtifactRegistry",
    Item: {
      artifactId: "s3://testArtifactBucket/build42/manifest.json",
      status: "approved",
      validatedAt: expect.any(String),
    },
  });

  const deleteCommands = s3SendMock.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof DeleteObjectCommand);

  expect(deleteCommands).toHaveLength(0);
});

test("Validator rejects artifacts with a checksum mismatch", async () => {
  const payloadBytes = Buffer.from("test payload", "utf8");

  const manifest = {
    version: "1.0.0",
    commitSha: "abc123",
    checksum: "wrongChecksum",
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
    .mockResolvedValueOnce(payloadResponse)
    .mockResolvedValue({});

  jest.spyOn(S3Client.prototype, "send").mockImplementation(s3SendMock);

  const ddbSendMock = jest.fn().mockResolvedValue({});
  jest
    .spyOn(DynamoDBDocumentClient.prototype, "send")
    .mockImplementation(ddbSendMock);

  process.env.tableName = "testArtifactRegistry";

  const { handler } = await import("../lambda/validator/index.js");

  const event = {
    Records: [
      {
        s3: {
          bucket: { name: "testArtifactBucket" },
          object: { key: "build42/manifest.json" },
        },
      },
    ],
  };

  await expect(handler(event as S3Event)).rejects.toThrow("Checksum mismatch");

  expect(ddbSendMock).toHaveBeenCalledTimes(1);

  const putInput = ddbSendMock.mock.calls[0][0].input;

  expect(putInput).toMatchObject({
    TableName: "testArtifactRegistry",
    Item: {
      artifactId: "s3://testArtifactBucket/build42/manifest.json",
      status: "rejected",
      validatedAt: expect.any(String),
      reason: expect.stringContaining("Checksum mismatch"),
    },
  });

  const deleteCommands = s3SendMock.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof DeleteObjectCommand);

  expect(deleteCommands).toHaveLength(2);

  expect(deleteCommands[0].input).toEqual({
    Bucket: "testArtifactBucket",
    Key: "build42/manifest.json",
  });

  expect(deleteCommands[1].input).toEqual({
    Bucket: "testArtifactBucket",
    Key: "build42/payload.txt",
  });
});
