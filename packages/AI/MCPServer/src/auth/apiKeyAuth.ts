// packages/AI/MCPServer/src/auth/apiKeyAuth.ts
import { hashAPIKey, isValidAPIKeyFormat, validateAPIKey } from '@memberjunction/encryption';
import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { CredentialEngine } from '@memberjunction/credentials';
import sql from 'mssql';