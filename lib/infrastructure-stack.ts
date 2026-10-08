import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "ArtifactBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      //autoDeleteObjects: true, (doesn't work because of floci deployment issue)
    });

    const table = new dynamodb.TableV2(this, "ArtifactRegistry", {
      partitionKey: { name: "commitSha", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const validatorFunction = new NodejsFunction(this, "ValidatorFunction", {
      entry: path.join(__dirname, "../lambda/validator/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    bucket.grantRead(validatorFunction);

    table.grantReadWriteData(validatorFunction);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(validatorFunction),
      { suffix: "manifest.json" },
    );

    const errorMetric = validatorFunction.metricErrors();

    new cloudwatch.Alarm(this, "ValidatorFunctionErrorAlarm", {
      metric: errorMetric,
      threshold: 1,
      evaluationPeriods: 1,
    });
  }
}
