# artifactIntakeGate

A small AWS application that validates uploaded artifacts and records whether they were approved or rejected.

An artifact consists of a payload file and a JSON manifest. Uploading the manifest to S3 triggers a Lambda function, which checks the required fields and compares the payload's SHA-256 checksum with the manifest. The result is stored in DynamoDB. Rejected artifacts are deleted from S3, while their validation result remains in the registry.

## Why I built this

I had some theoretical knowledge of AWS, but little hands-on experience. I built this project to see how a few AWS services work together in practice, from defining the infrastructure to testing the complete workflow.

I deliberately kept the scope small: upload an artifact, validate it, and record the result. This gave me a manageable starting point for working with AWS CDK, Lambda, S3, DynamoDB, and CloudWatch.

If you would like to read more about the design decisions, challenges, and what I learned while building this project, take a look at the project article on [my website](https://dnicolay.de).

## Technologies

| Technology                                                                                                                                                                                                | Role in this project                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://api.iconify.design/logos/typescript-icon.svg" height="18" alt="" /> TypeScript                                                                                                          | Defines the infrastructure and implements the validator.                                                                  |
| <img src="https://api.iconify.design/vscode-icons/file-type-aws.svg" height="18" alt="" /> AWS CDK                                                                                                        | Generates the CloudFormation template, including resources, permissions, and connections.                                 |
| <img src="https://api.iconify.design/logos/aws-s3.svg" height="18" alt="" /> Amazon S3                                                                                                                    | Stores the payload and manifest, and sends the upload notification.                                                       |
| <img src="https://api.iconify.design/logos/aws-lambda.svg" height="18" alt="" /> AWS Lambda                                                                                                               | Reads the files and runs the validation.                                                                                  |
| <img src="https://api.iconify.design/logos/aws-dynamodb.svg" height="18" alt="" /> Amazon DynamoDB                                                                                                        | Stores validation results using an artifact ID as the partition key.                                                      |
| <img src="https://api.iconify.design/logos/aws-cloudwatch.svg" height="18" alt="" /> Amazon CloudWatch                                                                                                    | Stores Lambda logs and provides an alarm on Lambda errors.                                                                |
| <img src="https://api.iconify.design/logos/jest.svg" height="18" alt="" /> Jest<br><img src="https://api.iconify.design/logos/swc.svg" height="18" alt="" /> SWC                                          | Jest runs the tests; SWC transforms TypeScript. CDK assertions check infrastructure, while SDK mocks isolate the handler. |
| <img src="https://raw.githubusercontent.com/floci-io/floci/2.1.0/docs/assets/floci.svg" height="18" alt="" /><br><img src="https://api.iconify.design/logos/docker-icon.svg" height="18" alt="" /> Docker | floci provides the local AWS environment; Docker runs the emulator and Lambda containers.                                 |

## Architecture

Placeholder: Architecture diagram

### Validation workflow

Placeholder: Validation workflow diagram

1. Upload `payload.txt` to a folder in S3.
2. Upload `manifest.json` to the same folder. This upload triggers the validator.
3. The validator reads the manifest and checks that the four required fields are strings.
4. If the manifest is valid, it loads the payload and calculates its SHA-256 checksum.
5. If the checksums match, it stores an `approved` result. Both files remain in S3.
6. If a required field is invalid or the checksum differs, it stores a `rejected` result with a reason, deletes both files, and throws an error.

The upload order matters. The payload must already exist when the manifest triggers validation.

## Manifest format

Example manifest. The checksum must be calculated from your own payload file; the values below illustrate the format.

```json
{
  "version": "1.0.0",
  "commitSha": "a275110a841b",
  "checksum": "55ab640df056a9671321a873e13d8cc5f7afd6afe1dedfcdef8c36cb7a46a5fe",
  "buildTimestamp": "2026-10-06T10:39:35Z"
}
```

## Running locally

### Prerequisites

- Node.js 24 and npm
- Docker with a running daemon and access from your user account
- AWS CLI v2
- floci CLI

Commands work in Bash and Zsh.

### Install and deploy

```bash
git clone https://github.com/DimitriosNicolay/artifactIntakeGate.git
cd artifactIntakeGate
npm ci

source ./scripts/dev-env.sh
printenv AWS_ENDPOINT_URL AWS_REGION AWS_DEFAULT_REGION
aws sts get-caller-identity
```

The development script starts floci if needed and configures the current shell. Repeat the `source` command in each new terminal session. For the local setup, the endpoint should be `http://127.0.0.1:4566` and the account should be `000000000000`.

```bash
npm run build
npm test -- --runInBand
npx cdk bootstrap aws://000000000000/us-east-1
npx cdk diff
npx cdk deploy
```

Bootstrap creates the CDK deployment resources. It is needed once per local account and region while that environment's state exists.

### Find the deployed resources

CDK generates the physical resource names. Retrieve them instead of copying names from another deployment:

```bash
artifactBucket=$(aws cloudformation describe-stack-resources \
  --stack-name InfrastructureStack \
  --query "StackResources[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId | [0]" \
  --output text)

artifactTable=$(aws cloudformation describe-stack-resources \
  --stack-name InfrastructureStack \
  --query "StackResources[?ResourceType=='AWS::DynamoDB::GlobalTable'].PhysicalResourceId | [0]" \
  --output text)
```

These are shell variables for the current terminal session.

### Try a valid artifact

```bash
aws s3 cp fixtures/valid-artifact/payload.txt \
  "s3://$artifactBucket/validArtifact/payload.txt"
aws s3 cp fixtures/valid-artifact/manifest.json \
  "s3://$artifactBucket/validArtifact/manifest.json"

aws dynamodb scan --table-name "$artifactTable" --consistent-read
aws s3 ls "s3://$artifactBucket/validArtifact/"
```

Expect an `approved` entry and both files in S3. Processing is asynchronous, so repeat the queries after a few seconds if necessary.

### Try an invalid artifact

The invalid fixture contains a checksum that does not match its payload.

```bash
aws s3 cp fixtures/invalid-artifact/payload.txt \
  "s3://$artifactBucket/invalidArtifact/payload.txt"
aws s3 cp fixtures/invalid-artifact/manifest.json \
  "s3://$artifactBucket/invalidArtifact/manifest.json"

aws dynamodb scan --table-name "$artifactTable" --consistent-read
aws s3 ls "s3://$artifactBucket/invalidArtifact/"
```

Expect a `rejected` entry with a checksum-mismatch reason. The S3 listing for that prefix should be empty after processing.

### Upload your own artifact

Create a folder containing your file, named `payload.txt`. The current validator expects this filename, even if you are testing a different kind of file.

```bash
mkdir -p myArtifact
printf 'My test artifact\n' > myArtifact/payload.txt
```

Alternatively, copy your own file to `myArtifact/payload.txt`. Generate the manifest with the checksum of that file:

```bash
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const payloadBytes = readFileSync("myArtifact/payload.txt");
const manifest = {
  version: "1.0.0",
  commitSha: "localTest",
  checksum: createHash("sha256").update(payloadBytes).digest("hex"),
  buildTimestamp: new Date().toISOString(),
};

writeFileSync("myArtifact/manifest.json", JSON.stringify(manifest, null, 2));
JS
```

Set `version` and `commitSha` to the values for your artifact. Upload the payload before its manifest:

```bash
aws s3 cp myArtifact/payload.txt "s3://$artifactBucket/myArtifact/payload.txt"
aws s3 cp myArtifact/manifest.json "s3://$artifactBucket/myArtifact/manifest.json"
aws dynamodb scan --table-name "$artifactTable" --consistent-read
```

To test rejection, change the checksum in the generated manifest, then upload the payload and manifest again. The registry entry should change to `rejected`, and both uploaded files should be deleted.

## Testing

```bash
npm run build
npm test -- --runInBand
```

The tests cover infrastructure configuration and validator behavior.

| Suite          | Coverage                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infrastructure | One S3 bucket, registry key definition, alarm metric and thresholds, Node.js runtime, and the Lambda's table reference.                                                    |
| Validator      | Valid artifact approval, checksum mismatch rejection, and rejection when `commitSha` is missing. Checks include registry write inputs and the relevant S3 delete requests. |

## Possible extensions

The scope is intentionally limited to artifact validation and recording results. Possible additions include:

- **Grafana dashboards:** Visualize CloudWatch metrics for invocations, errors, and execution duration.
- **Notifications:** Deliver alarm notifications through SNS.
- **Stronger validation:** Validate metadata formats and handle malformed JSON.
- **Event handling:** Process all event records and support retries and duplicate events.
- **Artifact history:** Preserve previous uploads and validation results.
- **CI/CD integration:** Upload build artifacts automatically from a pipeline.

## Cleanup

The bucket and table use `RemovalPolicy.DESTROY`. The bucket does not automatically delete its contents, so it must be emptied before removing the stack.

The following commands delete the local project's artifacts and registry:

```bash
aws s3 rm "s3://$artifactBucket/" --recursive
npx cdk destroy
```

The CDK bootstrap stack remains available for later deployments. floci state persistence depends on the emulator configuration.
