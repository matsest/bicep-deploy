// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { ResourceManagementClient } from "@azure/arm-resources";
import { DeploymentStacksClient } from "@azure/arm-resourcesdeploymentstacks";
import {
  ChainedTokenCredential,
  EnvironmentCredential,
  AzureCliCredential,
  AzurePowerShellCredential,
  TokenCredential,
} from "@azure/identity";
import { AdditionalPolicyConfig } from "@azure/core-client";
import { execSync } from "child_process";

import { Logger } from "./logging";
import { DeployConfig } from "./config";

const userAgentPrefix = "gh-azure-bicep-deploy";
const dummySubscriptionId = "00000000-0000-0000-0000-000000000000";
const endpoints = {
  azureCloud: "https://management.azure.com",
  azureChinaCloud: "https://management.chinacloudapi.cn",
  azureGermanCloud: "https://management.microsoftazure.de",
  azureUSGovernment: "https://management.usgovcloudapi.net",
};

export async function getDefaultSubscriptionId(): Promise<string | undefined> {
  // Try Azure CLI first
  try {
    const result = execSync("az account show --query id -o tsv", {
      encoding: "utf8",
      timeout: 10000,
    });
    const subscriptionId = result.trim();
    if (subscriptionId) {
      return subscriptionId;
    }
  } catch {
    // Azure CLI failed or not available, try PowerShell
  }

  // Try Azure PowerShell
  try {
    const result = execSync(
      "pwsh -Command \"(Get-AzContext).Subscription.Id\" 2>/dev/null || powershell -Command \"(Get-AzContext).Subscription.Id\"",
      {
        encoding: "utf8",
        timeout: 10000,
      },
    );
    const subscriptionId = result.trim();
    if (subscriptionId) {
      return subscriptionId;
    }
  } catch {
    // PowerShell failed or not available
  }

  return undefined;
}

export function createDeploymentClient(
  config: DeployConfig,
  logger: Logger,
  subscriptionId?: string,
  tenantId?: string,
): ResourceManagementClient {
  return new ResourceManagementClient(
    getCredential(tenantId),
    // Use subscription ID if provided, otherwise use dummy for tenant/management group scopes
    subscriptionId ?? dummySubscriptionId,
    {
      userAgentOptions: {
        userAgentPrefix: userAgentPrefix,
      },
      additionalPolicies: [createDebugLoggingPolicy(logger)],
      // Use a recent API version to take advantage of error improvements
      apiVersion: "2024-03-01",
      endpoint: endpoints[config.environment],
    },
  );
}

export function createStacksClient(
  config: DeployConfig,
  logger: Logger,
  subscriptionId?: string,
  tenantId?: string,
): DeploymentStacksClient {
  return new DeploymentStacksClient(
    getCredential(tenantId),
    // Use subscription ID if provided, otherwise use dummy for tenant/management group scopes
    subscriptionId ?? dummySubscriptionId,
    {
      userAgentOptions: {
        userAgentPrefix: userAgentPrefix,
      },
      additionalPolicies: [createDebugLoggingPolicy(logger)],
      endpoint: endpoints[config.environment],
    },
  );
}

// Log request + response bodies to GitHub Actions debug output if enabled
function createDebugLoggingPolicy(logger: Logger): AdditionalPolicyConfig {
  return {
    position: "perCall",
    policy: {
      name: "debugLoggingPolicy",
      async sendRequest(request, next) {
        if (logger.isDebugEnabled()) {
          logger.debug(`Request: ${request.method} ${request.url}`);
          if (request.body) {
            const parsed = JSON.parse(request.body.toString());
            logger.debug(`Body: ${JSON.stringify(parsed, null, 2)}`);
          }
        }

        const response = await next(request);

        if (logger.isDebugEnabled()) {
          logger.debug(`Response: ${response.status}`);
          if (response.bodyAsText) {
            const parsed = JSON.parse(response.bodyAsText);
            logger.debug(`Body: ${JSON.stringify(parsed, null, 2)}`);
          }

          const correlationId = response.headers.get(
            "x-ms-correlation-request-id",
          );
          logger.debug(`CorrelationId: ${correlationId}`);

          const activityId = response.headers.get("x-ms-request-id");
          logger.debug(`ActivityId: ${activityId}`);
        }

        return response;
      },
    },
  };
}

function getCredential(tenantId?: string): TokenCredential {
  return new ChainedTokenCredential(
    new EnvironmentCredential(),
    new AzureCliCredential({ tenantId }),
    new AzurePowerShellCredential({ tenantId }),
  );
}
