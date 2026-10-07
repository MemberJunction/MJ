terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

module "work_queue" {
  source = "../.."
  # Produce with: mj queue export-topology --transport AWS-dev > manifest.json
  # (the export renders DriverArtifacts.SnsFilterPolicy and Status for every subscription; never hand-edit filters here)
  manifest_path  = "${path.module}/manifest.json"
  name_prefix    = "mj-wq"
  environment    = "dev"
  region         = "us-east-1"
  create_kms_key = true

  lambda_consumers = {
    "email.archive" = {
      s3_bucket       = "replace-with-artifact-bucket"
      s3_key          = "work-queue/email-archive/replace-with-content-hash.zip"
      timeout_seconds = 60
    }
  }
}

output "binding_import" {
  value = module.work_queue.binding_import
}
