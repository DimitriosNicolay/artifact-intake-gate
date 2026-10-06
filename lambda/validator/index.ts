import { S3Event } from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";

const s3Client = new S3Client({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME as string;

interface ArtifactManifest {
  version: string;
  commitSha: string;
  checksum: string;
  buildTimestamp: string;
}

function isValidManifest(obj: any): obj is ArtifactManifest {
  return (
    typeof obj.version === "string" &&
    typeof obj.commitSha === "string" &&
    typeof obj.checksum === "string" &&
    typeof obj.buildTimestamp === "string"
  );
}

function derivePayloadKey(manifestKey: string): string {
  return manifestKey.replace("manifest.json", "payload.txt");
}

async function rejectArtifact(
  bucketName: string,
  manifestKey: string,
  reason: string,
): Promise<never> {
  console.log("Rejecting artifact:", reason);

  const payloadKey = derivePayloadKey(manifestKey);

  await s3Client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: manifestKey }),
  );
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: payloadKey }),
  );

  throw new Error(reason);
}

async function approveArtifact(manifest: ArtifactManifest): Promise<void> {
  console.log("Approving artifact:", manifest.commitSha);

  await ddbClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        commitSha: manifest.commitSha,
        version: manifest.version,
        checksum: manifest.checksum,
        buildTimestamp: manifest.buildTimestamp,
        status: "approved",
        validatedAt: new Date().toISOString(),
      },
    }),
  );
}

export const handler = async (event: S3Event): Promise<void> => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  const bucketName = event.Records[0].s3.bucket.name;
  const manifestKey = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " "),
  );
  const payloadKey = derivePayloadKey(manifestKey);

  const manifestResponse = await s3Client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: manifestKey }),
  );
  const manifestBody = await manifestResponse.Body?.transformToString();
  const manifest = JSON.parse(manifestBody ?? "{}");

  console.log("Parsed manifest:", manifest);

  if (!isValidManifest(manifest)) {
    await rejectArtifact(
      bucketName,
      manifestKey,
      "Manifest is incomplete or invalid. Required fields: version, commitSha, checksum, buildTimestamp.",
    );
    return;
  }

  const payloadResponse = await s3Client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: payloadKey }),
  );
  const payloadBytes = await payloadResponse.Body?.transformToByteArray();

  const calculatedChecksum = createHash("sha256")
    .update(payloadBytes ?? new Uint8Array())
    .digest("hex");
  const isChecksumValid = calculatedChecksum === manifest.checksum;

  console.log(
    "Computed checksum:",
    calculatedChecksum,
    "| Expected:",
    manifest.checksum,
    "| Valid:",
    isChecksumValid,
  );

  if (!isChecksumValid) {
    await rejectArtifact(
      bucketName,
      manifestKey,
      "Checksum mismatch - payload does not match manifest.",
    );
    return;
  }

  await approveArtifact(manifest);
};
