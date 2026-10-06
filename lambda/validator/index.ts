import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";

const s3Client = new S3Client({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

export const handler = async (event: S3Event): Promise<void> => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  const bucketName = event.Records[0].s3.bucket.name;
  const objectKey = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " "),
  );

  const manifestCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  const manifestResponse = await s3Client.send(manifestCommand);
  const manifestBody = await manifestResponse.Body?.transformToString();
  const manifest = JSON.parse(manifestBody ?? "{}");

  console.log("Parsed manifest:", manifest);

  if (!isValidManifest(manifest)) {
    throw new Error(
      "Manifest is incomplete or invalid. Required fields: version, commitSha, checksum, buildTimestamp.",
    );
  }

  const payloadKey = objectKey.replace("manifest.json", "payload.txt");

  const payloadCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: payloadKey,
  });

  const payloadResponse = await s3Client.send(payloadCommand);
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
};
