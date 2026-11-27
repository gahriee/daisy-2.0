import { describe, expect, it } from "vitest";
import {
  BusinessSettingsModuleUpdateSchema,
  DEFAULT_HOUSE_RULES,
  hasCompleteFinancialPolicies,
  hasCompleteStaySchedule,
  parseHouseRulesList,
  serializeHouseRulesList,
} from "../../../../src/features/settings/schemas";

describe("business settings schemas", () => {
  it("validates the simplified property module with stay times and overdue SMS toggle", () => {
    const parsed = BusinessSettingsModuleUpdateSchema.parse({
      module: "property",
      expectedVersion: 0,
      businessName: "  Daisy Residences  ",
      businessPhone: "",
      businessAddress: "",
      tin: "",
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      smsOverdueEnabled: true,
      smsOverdueSendTimeManila: "09:30",
    });

    expect(parsed.module).toBe("property");
    if (parsed.module === "property") {
      expect(parsed.businessName).toBe("Daisy Residences");
      expect(parsed.businessPhone).toBeNull();
      expect(parsed.checkInTimeManila).toBe("14:00");
      expect(parsed.checkOutTimeManila).toBe("12:00");
      expect(parsed.smsOverdueEnabled).toBe(true);
      expect(parsed.smsOverdueSendTimeManila).toBe("09:30");
    }

    expect(
      hasCompleteStaySchedule({
        checkInTimeManila: "14:00",
        checkOutTimeManila: "12:00",
      }),
    ).toBe(true);
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

  it("rejects blank business name, invalid stay/SMS times, and retired modules", () => {
    const blankName = BusinessSettingsModuleUpdateSchema.safeParse({
      module: "property",
      expectedVersion: 0,
      businessName: "   ",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      smsOverdueEnabled: false,
      smsOverdueSendTimeManila: "09:00",
    });
    expect(blankName.success).toBe(false);

    const badTimes = BusinessSettingsModuleUpdateSchema.safeParse({
      module: "property",
      expectedVersion: 0,
      businessName: "Daisy",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      checkInTimeManila: "25:00",
      checkOutTimeManila: "12:00",
      smsOverdueEnabled: false,
      smsOverdueSendTimeManila: "09:00",
    });
    expect(badTimes.success).toBe(false);

    const badSmsTime = BusinessSettingsModuleUpdateSchema.safeParse({
      module: "property",
      expectedVersion: 0,
      businessName: "Daisy",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      smsOverdueEnabled: true,
      smsOverdueSendTimeManila: "25:99",
    });
    expect(badSmsTime.success).toBe(false);

    for (const retiredModule of [
      "profile",
      "policies",
      "operations",
      "sms",
      "email",
    ]) {
      const retired = BusinessSettingsModuleUpdateSchema.safeParse({
        module: retiredModule,
        expectedVersion: 0,
      });
      expect(retired.success).toBe(false);
    }
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
