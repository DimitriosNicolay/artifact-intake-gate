import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

const s3Client = new S3Client({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: S3Event): Promise<void> => {
  console.log('Received S3 event:', JSON.stringify(event, null, 2));
  //throw new Error('Validation failed: This is a simulated validation error.');

  const bucketName = event.Records[0].s3.bucket.name;
  const objectKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  
  const manifestCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  const manifestResponse = await s3Client.send(manifestCommand);
  const manifestBody = await manifestResponse.Body?.transformToString();
  const manifest = JSON.parse(manifestBody ?? '{}');

  console.log('Parsed manifest:', manifest);
}

