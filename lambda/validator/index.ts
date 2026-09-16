import { S3Event } from 'aws-lambda';

export const handler = async (event: S3Event): Promise<void> => {
  console.log('Received S3 event:', JSON.stringify(event, null, 2));
}