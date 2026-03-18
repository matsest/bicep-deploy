// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDefaultSubscriptionId } from "../src/azure";
import { execSync } from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

describe("getDefaultSubscriptionId", () => {
  const mockedExecSync = vi.mocked(execSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns subscription ID from Azure CLI when available", async () => {
    const expectedSubId = "12345678-1234-1234-1234-123456789012";
    mockedExecSync.mockReturnValueOnce(expectedSubId + "\n");

    const result = await getDefaultSubscriptionId();

    expect(result).toBe(expectedSubId);
    expect(mockedExecSync).toHaveBeenCalledWith(
      "az account show --query id -o tsv",
      expect.objectContaining({
        encoding: "utf8",
        timeout: 10000,
      }),
    );
  });

  it("returns subscription ID from Azure PowerShell when CLI fails", async () => {
    const expectedSubId = "87654321-4321-4321-4321-210987654321";
    
    // First call (CLI) throws error
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error("Azure CLI not available");
    });
    
    // Second call (PowerShell) succeeds
    mockedExecSync.mockReturnValueOnce(expectedSubId + "\n");

    const result = await getDefaultSubscriptionId();

    expect(result).toBe(expectedSubId);
    expect(mockedExecSync).toHaveBeenCalledTimes(2);
    expect(mockedExecSync).toHaveBeenNthCalledWith(
      1,
      "az account show --query id -o tsv",
      expect.any(Object),
    );
    expect(mockedExecSync).toHaveBeenNthCalledWith(
      2,
      'pwsh -Command "(Get-AzContext).Subscription.Id" 2>/dev/null || powershell -Command "(Get-AzContext).Subscription.Id"',
      expect.objectContaining({
        encoding: "utf8",
        timeout: 10000,
      }),
    );
  });

  it("returns undefined when both CLI and PowerShell fail", async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not available");
    });

    const result = await getDefaultSubscriptionId();

    expect(result).toBeUndefined();
    expect(mockedExecSync).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when CLI returns empty string", async () => {
    mockedExecSync.mockReturnValueOnce("\n");
    mockedExecSync.mockReturnValueOnce("fallback-sub-id\n");

    const result = await getDefaultSubscriptionId();

    // Should try PowerShell since CLI returned empty
    expect(mockedExecSync).toHaveBeenCalledTimes(2);
    expect(result).toBe("fallback-sub-id");
  });

  it("trims whitespace from subscription ID", async () => {
    const expectedSubId = "12345678-1234-1234-1234-123456789012";
    mockedExecSync.mockReturnValueOnce("  " + expectedSubId + "  \n");

    const result = await getDefaultSubscriptionId();

    expect(result).toBe(expectedSubId);
  });
});
