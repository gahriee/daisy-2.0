import { describe, expect, it } from "vitest";
import {
  BusinessSettingsModuleUpdateSchema,
  BusinessSettingsUpdateSchema,
  DEFAULT_HOUSE_RULES,
  hasCompleteFinancialPolicies,
  hasCompleteStaySchedule,
  parseHouseRulesList,
  serializeHouseRulesList,
} from "../../../../src/features/settings/schemas";

describe("business settings schemas", () => {
  it("accepts partial setup while reporting financial policies incomplete", () => {
    const parsed = BusinessSettingsUpdateSchema.parse({
      expectedVersion: 0,
      businessName: "  Daisy Residences  ",
      businessPhone: "",
      businessAddress: "",
      tin: "",
      billingDayOfMonth: null,
      gracePeriodDays: null,
      prorationPolicy: null,
      depositPolicy: null,
      overpaymentPolicy: null,
      invoicePrefix: null,
      receiptPrefix: null,
      checkInTimeManila: null,
      checkOutTimeManila: null,
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });

    expect(parsed.businessName).toBe("Daisy Residences");
    expect(parsed.businessPhone).toBeNull();
    expect(hasCompleteFinancialPolicies(parsed)).toBe(false);
  });

  it("normalizes prefixes and confirms complete policy sets", () => {
    const parsed = BusinessSettingsUpdateSchema.parse({
      expectedVersion: 1,
      businessName: "Daisy Boarding House",
      businessPhone: "+63 917 000 0000",
      businessAddress: "123 Sampaguita St.",
      tin: null,
      billingDayOfMonth: 5,
      gracePeriodDays: 3,
      prorationPolicy: "DAILY_EXACT",
      depositPolicy: "HOLD_SEPARATE",
      overpaymentPolicy: "CREDIT_NEXT_INVOICE",
      invoicePrefix: "inv-",
      receiptPrefix: "rcp-",
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });

    expect(parsed.invoicePrefix).toBe("INV-");
    expect(parsed.receiptPrefix).toBe("RCP-");
    expect(hasCompleteFinancialPolicies(parsed)).toBe(true);
    expect(hasCompleteStaySchedule(parsed)).toBe(true);
    expect(
      hasCompleteStaySchedule({
        checkInTimeManila: null,
        checkOutTimeManila: null,
      }),
    ).toBe(false);
    expect(
      hasCompleteFinancialPolicies({
        billingDayOfMonth: 5,
        gracePeriodDays: 3,
        prorationPolicy: "DAILY_EXACT",
        depositPolicy: "HOLD_SEPARATE",
        overpaymentPolicy: "CREDIT_NEXT_INVOICE",
        invoicePrefix: "INV-",
        receiptPrefix: "RCP-",
      }),
    ).toBe(true);
  });

  it("rejects out-of-range billing days and invalid times", () => {
    const badDay = BusinessSettingsUpdateSchema.safeParse({
      expectedVersion: 0,
      businessName: "Daisy",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      billingDayOfMonth: 31,
      gracePeriodDays: 3,
      prorationPolicy: null,
      depositPolicy: null,
      overpaymentPolicy: null,
      invoicePrefix: null,
      receiptPrefix: null,
      checkInTimeManila: "25:00",
      checkOutTimeManila: "12:00",
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });
    expect(badDay.success).toBe(false);
  });

  it("validates profile, policies, and operations modules independently", () => {
    const profileOnly = BusinessSettingsModuleUpdateSchema.parse({
      module: "profile",
      expectedVersion: 0,
      businessName: "  Daisy Residences  ",
      businessPhone: "",
      businessAddress: "",
      tin: "",
    });
    expect(profileOnly.module).toBe("profile");
    if (profileOnly.module === "profile") {
      expect(profileOnly.businessName).toBe("Daisy Residences");
      expect(profileOnly.businessPhone).toBeNull();
    }

    const policiesOnly = BusinessSettingsModuleUpdateSchema.parse({
      module: "policies",
      expectedVersion: 0,
      billingDayOfMonth: 5,
      gracePeriodDays: 3,
      prorationPolicy: "DAILY_EXACT",
      depositPolicy: "HOLD_SEPARATE",
      overpaymentPolicy: "CREDIT_NEXT_INVOICE",
      invoicePrefix: "inv-",
      receiptPrefix: "rcp-",
    });
    expect(policiesOnly.module).toBe("policies");
    if (policiesOnly.module === "policies") {
      expect(policiesOnly.invoicePrefix).toBe("INV-");
      expect(policiesOnly.receiptPrefix).toBe("RCP-");
    }

    const operationsOnly = BusinessSettingsModuleUpdateSchema.parse({
      module: "operations",
      expectedVersion: 1,
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });
    expect(operationsOnly.module).toBe("operations");

    const badProfile = BusinessSettingsModuleUpdateSchema.safeParse({
      module: "profile",
      expectedVersion: 0,
      businessName: "   ",
      businessPhone: null,
      businessAddress: null,
      tin: null,
    });
    expect(badProfile.success).toBe(false);
  });

  it("parses and serializes house rules without implicit defaults", () => {
    expect(parseHouseRulesList(null)).toEqual([]);
    expect(parseHouseRulesList("   ")).toEqual([]);

    const seededList = parseHouseRulesList(DEFAULT_HOUSE_RULES);
    expect(seededList).toHaveLength(6);
    expect(seededList[0]).toContain("No curfew");
    expect(seededList[5]).toContain("10pm to 7am");

    const custom = parseHouseRulesList(
      "1. Quiet hours at 10 PM.\n- Keep hallways clear.\n\nNo smoking indoors.",
    );
    expect(custom).toEqual([
      "Quiet hours at 10 PM.",
      "Keep hallways clear.",
      "No smoking indoors.",
    ]);

    const parsedOps = BusinessSettingsModuleUpdateSchema.parse({
      module: "operations",
      expectedVersion: 1,
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      transientPolicyNote: DEFAULT_HOUSE_RULES,
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });
    expect(parsedOps.module).toBe("operations");
    if (parsedOps.module === "operations") {
      expect(parsedOps.transientPolicyNote).toContain("No curfew");
    }

    const serialized = serializeHouseRulesList([
      "  1. No curfew. ",
      "",
      "- Keep common areas clean.",
    ]);
    expect(serialized).toBe("1. No curfew.\n2. Keep common areas clean.");
    expect(serializeHouseRulesList(["  ", ""])).toBeNull();

    const parsedHouseRules = BusinessSettingsModuleUpdateSchema.parse({
      module: "house_rules",
      expectedVersion: 2,
      transientPolicyNote: serialized,
    });
    expect(parsedHouseRules.module).toBe("house_rules");
    if (parsedHouseRules.module === "house_rules") {
      expect(parsedHouseRules.transientPolicyNote).toBe(
        "1. No curfew.\n2. Keep common areas clean.",
      );
    }
  });
});
