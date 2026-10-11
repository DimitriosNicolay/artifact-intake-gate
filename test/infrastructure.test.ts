import * as cdk from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import * as Infrastructure from "../lib/infrastructure-stack";

test("Create a single S3-Bucket", () => {
  const app = new cdk.App();
  const stack = new Infrastructure.InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::S3::Bucket", 1);
});

test("Check DynamoDB-Table partition key attribute type", () => {
  const app = new cdk.App();
  const stack = new Infrastructure.InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
    KeySchema: [
      {
        AttributeName: "artifactId",
        KeyType: "HASH",
      },
    ],
    AttributeDefinitions: [
      {
        AttributeName: "artifactId",
        AttributeType: "S",
      },
    ],
  });
});

test("Alarm monitors Lambda errors with threshold 1", () => {
  const app = new cdk.App();
  const stack = new Infrastructure.InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::CloudWatch::Alarm", {
    MetricName: "Errors",
    EvaluationPeriods: 1,
    Threshold: 1,
  });
});

test("Validator uses Node.js 24", () => {
  const app = new cdk.App();
  const stack = new Infrastructure.InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs24.x",
  });
});

test("Validator TABLE_NAME references the registry table", () => {
  const app = new cdk.App();
  const stack = new Infrastructure.InfrastructureStack(app, "TestStack");
  const template = Template.fromStack(stack);
  const tables = template.findResources("AWS::DynamoDB::GlobalTable");
  const tableId = Object.keys(tables)[0];

  template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: {
      Variables: {
        TABLE_NAME: {
          Ref: tableId,
        },
      },
    },
  });
});
