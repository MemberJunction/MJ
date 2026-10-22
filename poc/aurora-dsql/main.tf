# MJ-on-DSQL POC. Create: tofu apply. Tear down: tofu destroy.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  profile = "mj"
  region  = "us-east-1"
  default_tags { tags = { Project = "mj-dsql-poc", Owner = "craig.adam" } }
}

resource "aws_dsql_cluster" "mj" {
  deletion_protection_enabled = false
  tags                        = { Name = "mj-dsql-poc" }
}

output "endpoint" { value = "${aws_dsql_cluster.mj.identifier}.dsql.us-east-1.on.aws" }
output "identifier" { value = aws_dsql_cluster.mj.identifier }
