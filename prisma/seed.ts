import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { addManilaDays, toManilaDate } from "../src/lib/dates";
import {
  addInvoiceAdjustment,
  createManualInvoice,
} from "../src/features/billing/service";
import {
  addMaintenanceUpdate,
  createMaintenanceRequest,
  placeMaintenanceHold,
} from "../src/features/maintenance/service";
import { createNotice } from "../src/features/notices/service";
import { recordPayment } from "../src/features/payments/service";
import {
  createRoom,
  createRoomType,
  syncRoomUnitBed,
} from "../src/features/rooms/service";
import {
  getBusinessSettings,
  updateBusinessSettings,
} from "../src/features/settings/service";
import {
  assignTenantToBed,
  createTenant,
  createTenantNote,
} from "../src/features/tenants/service";
import { submitPublicBookingRequest } from "../src/features/transients/public-service";
import {
  checkInTransientReservation,
  createTransientGuest,
  createTransientReservation,
  updateRoomTransientPublish,
  updateTransientPolicyNote,
} from "../src/features/transients/service";
import { getDatabase } from "../src/server/db/client";
import { ensureOwnerRecord } from "../src/server/db/owner-record";

async function main(): Promise<void> {
  const rawOwnerUserId = process.env.OWNER_USER_ID?.trim();
  if (!rawOwnerUserId) {
    throw new Error(
      "OWNER_USER_ID is required in .env.local to seed Owner-scoped sample data.",
    );
  }
  const ownerUserId: string = rawOwnerUserId;

  const db = getDatabase();
  try {
    await ensureOwnerRecord(db, ownerUserId);
    const todayManila = toManilaDate(new Date());
    const currentBillingPeriod = todayManila.slice(0, 7);
    const periodStartManila = `${currentBillingPeriod}-01`;
    const periodEndManila = addManilaDays(periodStartManila, 29);

    // Clean up legacy multi-bed sample records (101-A..203-A) if present from earlier seed runs
    const legacyMultiBeds = await db.bed.findMany({
      where: {
        ownerUserId,
        number: {
          in: [
            "101-A",
            "101-B",
            "101-C",
            "101-D",
            "201-A",
            "201-B",
            "202-A",
            "203-A",
          ],
        },
      },
      select: { id: true },
    });
    if (legacyMultiBeds.length > 0) {
      await db.paymentAllocation.deleteMany({
        where: { invoice: { ownerUserId } },
      });
      await db.payment.deleteMany({ where: { ownerUserId } });
      await db.invoiceAdjustment.deleteMany({
        where: { invoice: { ownerUserId } },
      });
      await db.invoiceItem.deleteMany({
        where: { invoice: { ownerUserId } },
      });
      await db.invoice.deleteMany({ where: { ownerUserId } });
      await db.tenantAssignment.deleteMany({ where: { ownerUserId } });
      await db.allocation.deleteMany({ where: { ownerUserId } });
      await db.bookingRequest.deleteMany({ where: { ownerUserId } });
      await db.transientReservation.deleteMany({ where: { ownerUserId } });
      await db.maintenanceUpdate.deleteMany({ where: { ownerUserId } });
      await db.maintenanceRequest.deleteMany({ where: { ownerUserId } });
      await db.notice.deleteMany({ where: { ownerUserId } });
      await db.bed.deleteMany({ where: { ownerUserId } });
      await db.room.deleteMany({ where: { ownerUserId } });
      await db.roomType.deleteMany({ where: { ownerUserId } });
    }

    // 1. Business Settings (preserve existing Owner settings; fill only if missing/incomplete)
    const settings = await getBusinessSettings(ownerUserId);
    if (
      settings.id === null ||
      !settings.policiesComplete ||
      !settings.stayScheduleComplete ||
      !settings.businessName.trim()
    ) {
      await updateBusinessSettings(ownerUserId, {
        expectedVersion: settings.version,
        businessName: settings.businessName.trim() || "Daisy Residences",
        businessPhone: settings.businessPhone ?? "+63 917 555 0100",
        businessAddress:
          settings.businessAddress ??
          "142 Katipunan Ave, Loyola Heights, Quezon City",
        tin: settings.tin ?? "123-456-789-000",
        billingDayOfMonth: settings.billingDayOfMonth ?? 1,
        gracePeriodDays: settings.gracePeriodDays ?? 5,
        prorationPolicy: settings.prorationPolicy ?? "DAILY_EXACT",
        depositPolicy: settings.depositPolicy ?? "HOLD_SEPARATE",
        overpaymentPolicy: settings.overpaymentPolicy ?? "REJECT_OVERPAYMENT",
        invoicePrefix: settings.invoicePrefix ?? "INV-",
        receiptPrefix: settings.receiptPrefix ?? "RCP-",
        checkInTimeManila: settings.checkInTimeManila ?? "14:00",
        checkOutTimeManila: settings.checkOutTimeManila ?? "12:00",
        offlineUnlockMaxDays: settings.offlineUnlockMaxDays || 7,
        proofMaxMb: Math.max(
          1,
          Math.round(settings.proofMaxBytes / (1024 * 1024)) || 5,
        ),
        proofMaxFilesPerRecord: settings.proofMaxFilesPerRecord || 5,
      });
    }

    const rawSettings = await db.businessSettings.findUnique({
      where: { ownerUserId },
      select: { transientPolicyNote: true },
    });
    if (!rawSettings?.transientPolicyNote) {
      await updateTransientPolicyNote(ownerUserId, {
        transientPolicyNote:
          "Valid government ID required at check-in. Quiet hours begin at 10:00 PM.",
      });
    }

    // 2. Room Types (separated by building)
    async function ensureRoomType(input: {
      building: "BOARDING" | "TRANSIENT";
      name: string;
      monthlyRate: string | null;
      dailyRate: string | null;
      description: string;
    }) {
      const existing = await db.roomType.findFirst({
        where: {
          ownerUserId,
          building: input.building,
          name: input.name,
          archivedAt: null,
        },
        select: { id: true, name: true },
      });
      if (existing) return existing;
      return createRoomType(ownerUserId, input);
    }

    const singleRoomType = await ensureRoomType({
      building: "BOARDING",
      name: "Standard Single Room",
      monthlyRate: "4500.00",
      dailyRate: null,
      description:
        "Air-conditioned single boarder room with study desk, wardrobe locker, and shared floor bath.",
    });
    const studioRoomType = await ensureRoomType({
      building: "BOARDING",
      name: "Deluxe Studio Room",
      monthlyRate: "6500.00",
      dailyRate: null,
      description:
        "Private studio room with en-suite bathroom, study area, and mini-refrigerator.",
    });
    const suiteType = await ensureRoomType({
      building: "TRANSIENT",
      name: "Private Transient Suite",
      monthlyRate: null,
      dailyRate: "1250.00",
      description:
        "Private studio suite with queen bed, en-suite bath, and work desk for short stays.",
    });

    // 3. Rooms (each with 1 synced backing unit; separated into Boarding & Transient buildings)
    async function ensureRoomWithUnit(input: {
      building: "BOARDING" | "TRANSIENT";
      number: string;
      floor: string;
      roomTypeId: string;
      baseMonthlyRate: string | null;
      transientDailyRate: string | null;
      notes: string;
    }) {
      let existing = await db.room.findFirst({
        where: {
          ownerUserId,
          building: input.building,
          number: input.number,
          archivedAt: null,
        },
        select: {
          id: true,
          number: true,
          version: true,
          isTransientPublished: true,
        },
      });
      if (!existing) {
        const created = await createRoom(ownerUserId, {
          ...input,
          capacity: 1,
        });
        existing = {
          id: created.id,
          number: created.number,
          version: created.version,
          isTransientPublished: false,
        };
      }
      const unitBedId = await syncRoomUnitBed(ownerUserId, existing.id);
      if (!unitBedId) {
        throw new Error(`Failed to sync room unit for Room ${input.number}`);
      }
      return { ...existing, unitBedId };
    }

    const room101 = await ensureRoomWithUnit({
      building: "BOARDING",
      number: "101",
      floor: "1st Floor",
      roomTypeId: singleRoomType.id,
      baseMonthlyRate: "4500.00",
      transientDailyRate: null,
      notes: "East wing ground-floor single room near study lounge.",
    });
    const room102 = await ensureRoomWithUnit({
      building: "BOARDING",
      number: "102",
      floor: "1st Floor",
      roomTypeId: singleRoomType.id,
      baseMonthlyRate: "4500.00",
      transientDailyRate: null,
      notes: "Ground-floor single room with courtyard window.",
    });
    const room103 = await ensureRoomWithUnit({
      building: "BOARDING",
      number: "103",
      floor: "1st Floor",
      roomTypeId: singleRoomType.id,
      baseMonthlyRate: "4500.00",
      transientDailyRate: null,
      notes: "Ground-floor single room near garden exit.",
    });
    await ensureRoomWithUnit({
      building: "BOARDING",
      number: "104",
      floor: "1st Floor",
      roomTypeId: singleRoomType.id,
      baseMonthlyRate: "4500.00",
      transientDailyRate: null,
      notes: "Quiet end-corridor single room ready for move-in.",
    });

    const room201 = await ensureRoomWithUnit({
      building: "BOARDING",
      number: "201",
      floor: "2nd Floor",
      roomTypeId: studioRoomType.id,
      baseMonthlyRate: "6500.00",
      transientDailyRate: null,
      notes: "Quiet corner studio room with morning sun.",
    });

    const room202 = await ensureRoomWithUnit({
      building: "TRANSIENT",
      number: "202",
      floor: "2nd Floor",
      roomTypeId: suiteType.id,
      baseMonthlyRate: null,
      transientDailyRate: "1250.00",
      notes: "Private transient studio overlooking courtyard.",
    });
    if (!room202.isTransientPublished) {
      const fresh202 = await db.room.findUniqueOrThrow({
        where: { id: room202.id },
        select: { version: true, isTransientPublished: true },
      });
      if (!fresh202.isTransientPublished) {
        await updateRoomTransientPublish(ownerUserId, {
          roomId: room202.id,
          expectedVersion: fresh202.version,
          isTransientPublished: true,
          transientTitle: "Room 202 — Courtyard Studio Suite",
          transientDescription:
            "Quiet second-floor studio with private bath, fiber Wi-Fi, and work desk.",
          transientScope: "WHOLE_ROOM",
          transientDailyRate: "1250.00",
        });
      }
    }

    const room203 = await ensureRoomWithUnit({
      building: "TRANSIENT",
      number: "203",
      floor: "2nd Floor",
      roomTypeId: suiteType.id,
      baseMonthlyRate: null,
      transientDailyRate: "1350.00",
      notes: "Corner transient studio with balcony access.",
    });
    if (!room203.isTransientPublished) {
      const fresh203 = await db.room.findUniqueOrThrow({
        where: { id: room203.id },
        select: { version: true, isTransientPublished: true },
      });
      if (!fresh203.isTransientPublished) {
        await updateRoomTransientPublish(ownerUserId, {
          roomId: room203.id,
          expectedVersion: fresh203.version,
          isTransientPublished: true,
          transientTitle: "Room 203 — Balcony Suite",
          transientDescription:
            "Bright corner suite with private balcony, en-suite hot shower, and kitchenette.",
          transientScope: "WHOLE_ROOM",
          transientDailyRate: "1350.00",
        });
      }
    }

    // 4. Tenants & Active Room Assignments
    async function ensureTenant(input: {
      fullName: string;
      phone: string;
      email: string;
      address: string;
      emergencyContact: string;
      notes: string;
    }) {
      const existing = await db.tenant.findFirst({
        where: { ownerUserId, fullName: input.fullName, archivedAt: null },
        select: { id: true, fullName: true },
      });
      if (existing) return existing;
      return createTenant(ownerUserId, input);
    }

    const maria = await ensureTenant({
      fullName: "Maria Clara Santos",
      phone: "+63 917 810 2201",
      email: "maria.santos@example.ph",
      address: "San Fernando, Pampanga",
      emergencyContact: "Elena Santos (Mother) · +63 917 810 2200",
      notes: "Senior architecture student; prefers quiet study hours.",
    });
    const juan = await ensureTenant({
      fullName: "Juan Paolo Reyes",
      phone: "+63 918 340 5512",
      email: "jp.reyes@example.ph",
      address: "Lipa City, Batangas",
      emergencyContact: "Roberto Reyes (Father) · +63 918 340 5500",
      notes: "Engineering reviewee staying for board exam term.",
    });
    const angela = await ensureTenant({
      fullName: "Angela Mae Cruz",
      phone: "+63 919 605 8834",
      email: "angela.cruz@example.ph",
      address: "Cabanatuan, Nueva Ecija",
      emergencyContact: "Maricel Cruz (Sister) · +63 919 605 8800",
      notes: "Remote software analyst; daytime schedule.",
    });
    const carlo = await ensureTenant({
      fullName: "Carlo Miguel Bautista",
      phone: "+63 920 412 7790",
      email: "carlo.bautista@example.ph",
      address: "Baguio City, Benguet",
      emergencyContact: "Lorna Bautista (Mother) · +63 920 412 7700",
      notes: "Incoming boarder awaiting room placement next week.",
    });

    async function ensureTenantNotes(tenantId: string, notes: string[]) {
      const existingCount = await db.tenantNote.count({
        where: { ownerUserId, tenantId },
      });
      if (existingCount > 0) return;
      for (const content of notes) {
        await createTenantNote(ownerUserId, { tenantId, content });
      }
    }

    await ensureTenantNotes(maria.id, [
      "Senior architecture student; prefers quiet study hours.",
      "Submitted school ID photocopy and parent authorization at move-in.",
    ]);
    await ensureTenantNotes(juan.id, [
      "Engineering reviewee staying for board exam term.",
    ]);
    await ensureTenantNotes(angela.id, [
      "Remote software analyst; daytime schedule.",
    ]);
    await ensureTenantNotes(carlo.id, [
      "Incoming boarder awaiting room placement next week.",
    ]);

    async function ensureActiveAssignment(input: {
      tenantId: string;
      bedId: string;
      startDateManila: string;
      endDateManila: string;
      monthlyRate: string;
      securityDeposit: string;
      notes: string;
    }) {
      const existing = await db.tenantAssignment.findFirst({
        where: { ownerUserId, tenantId: input.tenantId, status: "ACTIVE" },
        select: { id: true },
      });
      if (existing) return existing;
      return assignTenantToBed(ownerUserId, input);
    }

    await ensureActiveAssignment({
      tenantId: maria.id,
      bedId: room101.unitBedId,
      startDateManila: addManilaDays(todayManila, -45),
      endDateManila: addManilaDays(todayManila, 180),
      monthlyRate: "4500.00",
      securityDeposit: "4500.00",
      notes: "Academic semester room lease.",
    });
    await ensureActiveAssignment({
      tenantId: juan.id,
      bedId: room102.unitBedId,
      startDateManila: addManilaDays(todayManila, -30),
      endDateManila: addManilaDays(todayManila, 150),
      monthlyRate: "4500.00",
      securityDeposit: "4500.00",
      notes: "Board review term room stay.",
    });
    await ensureActiveAssignment({
      tenantId: angela.id,
      bedId: room201.unitBedId,
      startDateManila: addManilaDays(todayManila, -60),
      endDateManila: addManilaDays(todayManila, 210),
      monthlyRate: "6500.00",
      securityDeposit: "6500.00",
      notes: "Deluxe studio room lease.",
    });

    // 5. Billing (Invoices, Line Items, Adjustments) & Payments
    const mariaInvoiceCount = await db.invoice.count({
      where: { ownerUserId, tenantId: maria.id },
    });
    if (mariaInvoiceCount === 0) {
      const invMaria = await createManualInvoice(ownerUserId, {
        tenantId: maria.id,
        billingPeriod: currentBillingPeriod,
        periodStartManila,
        periodEndManila,
        dueDateManila: addManilaDays(todayManila, 5),
        issueImmediately: true,
        notes: "Monthly room rent and utility meter.",
        items: [
          {
            itemType: "RENT",
            description: "Monthly room rent (Room 101)",
            quantity: "1.00",
            unitAmount: "4500.00",
          },
          {
            itemType: "UTILITY",
            description: "Electricity and water sub-meter",
            quantity: "1.00",
            unitAmount: "450.00",
          },
        ],
      });

      await recordPayment(ownerUserId, {
        tenantId: maria.id,
        amount: "4950.00",
        method: "GCASH",
        paidDateManila: todayManila,
        referenceNo: "GCASH-90284112",
        notes: "Paid in full via GCash.",
        allocations: [{ invoiceId: invMaria.id, amount: "4950.00" }],
        proofIntentIds: [],
      });
    }

    const juanInvoiceCount = await db.invoice.count({
      where: { ownerUserId, tenantId: juan.id },
    });
    if (juanInvoiceCount === 0) {
      const invJuan = await createManualInvoice(ownerUserId, {
        tenantId: juan.id,
        billingPeriod: currentBillingPeriod,
        periodStartManila,
        periodEndManila,
        dueDateManila: addManilaDays(todayManila, 3),
        issueImmediately: true,
        notes: "Monthly room rent and utility meter.",
        items: [
          {
            itemType: "RENT",
            description: "Monthly room rent (Room 102)",
            quantity: "1.00",
            unitAmount: "4500.00",
          },
          {
            itemType: "UTILITY",
            description: "Electricity and water sub-meter",
            quantity: "1.00",
            unitAmount: "380.00",
          },
        ],
      });

      await addInvoiceAdjustment(ownerUserId, {
        invoiceId: invJuan.id,
        expectedVersion: invJuan.version,
        type: "CREDIT",
        amount: "180.00",
        reason: "Rebate for tenant-supplied desk lamp bulb",
      });

      await recordPayment(ownerUserId, {
        tenantId: juan.id,
        amount: "2500.00",
        method: "CASH",
        paidDateManila: todayManila,
        referenceNo: "CASH-102-01",
        notes: "Partial cash payment received at front desk.",
        allocations: [{ invoiceId: invJuan.id, amount: "2500.00" }],
        proofIntentIds: [],
      });
    }

    const angelaInvoiceCount = await db.invoice.count({
      where: { ownerUserId, tenantId: angela.id },
    });
    if (angelaInvoiceCount === 0) {
      await createManualInvoice(ownerUserId, {
        tenantId: angela.id,
        billingPeriod: currentBillingPeriod,
        periodStartManila,
        periodEndManila,
        dueDateManila: addManilaDays(todayManila, 5),
        issueImmediately: true,
        notes: "Monthly studio room rent.",
        items: [
          {
            itemType: "RENT",
            description: "Monthly room rent (Room 201)",
            quantity: "1.00",
            unitAmount: "6500.00",
          },
        ],
      });

      await createManualInvoice(ownerUserId, {
        tenantId: angela.id,
        billingPeriod: null,
        periodStartManila: addManilaDays(todayManila, -15),
        periodEndManila: todayManila,
        dueDateManila: addManilaDays(todayManila, 7),
        issueImmediately: false,
        notes: "Draft sub-meter utility bill awaiting verification.",
        items: [
          {
            itemType: "UTILITY",
            description: "Room 201 aircon sub-meter reading (48 kWh)",
            quantity: "48.00",
            unitAmount: "15.00",
          },
        ],
      });
    }

    // 6. Transient Guests, Stays & Public Booking Request
    async function ensureTransientGuest(input: {
      fullName: string;
      phone: string;
      email: string;
      notes: string;
    }) {
      const existing = await db.transientGuest.findFirst({
        where: { ownerUserId, fullName: input.fullName, archivedAt: null },
        select: { id: true, fullName: true },
      });
      if (existing) return existing;
      return createTransientGuest(ownerUserId, input);
    }

    const lorenzo = await ensureTransientGuest({
      fullName: "Lorenzo David Tan",
      phone: "+63 917 990 1144",
      email: "lorenzo.tan@example.ph",
      notes: "Visiting parent attending university symposium.",
    });
    const lorenzoStayCount = await db.transientReservation.count({
      where: { ownerUserId, guestId: lorenzo.id },
    });
    if (lorenzoStayCount === 0) {
      const stay = await createTransientReservation(ownerUserId, {
        guestId: lorenzo.id,
        roomId: room202.id,
        bedId: null,
        scope: "WHOLE_ROOM",
        checkInDateManila: addManilaDays(todayManila, -1),
        checkOutDateManila: addManilaDays(todayManila, 2),
        partySize: 1,
        notes: "3-night symposium stay; requested extra bath towel.",
        tentative: false,
        issueInvoiceImmediately: true,
      });

      await checkInTransientReservation(ownerUserId, {
        reservationId: stay.id,
        expectedVersion: stay.version,
      });

      if (stay.activeInvoiceId) {
        await recordPayment(ownerUserId, {
          transientGuestId: lorenzo.id,
          amount: "1250.00",
          method: "MAYA",
          paidDateManila: todayManila,
          referenceNo: "MAYA-774120",
          notes: "First night deposit paid via Maya.",
          allocations: [{ invoiceId: stay.activeInvoiceId, amount: "1250.00" }],
          proofIntentIds: [],
        });
      }
    }

    const patricia = await ensureTransientGuest({
      fullName: "Patricia Anne Villanueva",
      phone: "+63 918 771 3309",
      email: "patricia.v@example.ph",
      notes: "Weekend guest for review seminar.",
    });
    const patriciaStayCount = await db.transientReservation.count({
      where: { ownerUserId, guestId: patricia.id },
    });
    if (patriciaStayCount === 0) {
      await createTransientReservation(ownerUserId, {
        guestId: patricia.id,
        roomId: room203.id,
        bedId: null,
        scope: "WHOLE_ROOM",
        checkInDateManila: addManilaDays(todayManila, 4),
        checkOutDateManila: addManilaDays(todayManila, 6),
        partySize: 1,
        notes: "Arriving around 3:00 PM.",
        tentative: false,
        issueInvoiceImmediately: false,
      });
    }

    const seedBookingKey = "seed-booking-req-room-203-0002";
    const existingReq = await db.bookingRequest.findUnique({
      where: {
        ownerUserId_idempotencyKey: {
          ownerUserId,
          idempotencyKey: seedBookingKey,
        },
      },
      select: { id: true },
    });
    if (!existingReq) {
      await submitPublicBookingRequest(ownerUserId, {
        idempotencyKey: seedBookingKey,
        roomId: room203.id,
        scope: "WHOLE_ROOM",
        checkInDateManila: addManilaDays(todayManila, 10),
        checkOutDateManila: addManilaDays(todayManila, 13),
        partySize: 1,
        guestName: "Gabriel Marco Lim",
        guestPhone: "+63 917 642 9081",
        guestEmail: "gabriel.lim@example.ph",
        notes: "Inquiring for a 3-night stay during bar exam week.",
        privacyConsentAccepted: true,
      });
    }

    // 7. Maintenance Requests, Updates & Room Hold
    const maint1Title = "Aircon indoor unit drain line & bracket servicing";
    const existingMaint1 = await db.maintenanceRequest.findFirst({
      where: { ownerUserId, title: maint1Title },
      select: { id: true },
    });
    if (!existingMaint1) {
      const createdMaint1 = await createMaintenanceRequest(ownerUserId, {
        roomId: room103.id,
        bedId: null,
        title: maint1Title,
        description:
          "Room 103 split-type aircon drain line requires flushing and wall bracket anchor bolt replacement before assigning to a new tenant.",
        category: "APPLIANCE",
        priority: "HIGH",
        attachmentIntentIds: [],
      });

      const updatedMaint1 = await addMaintenanceUpdate(ownerUserId, {
        requestId: createdMaint1.id,
        expectedVersion: createdMaint1.version,
        statusTo: "IN_PROGRESS",
        note: "Technician inspected indoor unit; replacement bracket bolts ordered and Room 103 placed on maintenance hold.",
        attachmentIntentIds: [],
      });

      await placeMaintenanceHold(ownerUserId, {
        requestId: updatedMaint1.id,
        expectedVersion: updatedMaint1.version,
        scope: "WHOLE_ROOM",
        bedId: null,
        startDateManila: todayManila,
        endDateManila: addManilaDays(todayManila, 4),
        notes: "Hold Room 103 until aircon drain line servicing is completed.",
      });
    }

    const maint2Title = "Bathroom bidet spray valve slow drip";
    const existingMaint2 = await db.maintenanceRequest.findFirst({
      where: { ownerUserId, title: maint2Title },
      select: { id: true },
    });
    if (!existingMaint2) {
      await createMaintenanceRequest(ownerUserId, {
        roomId: room201.id,
        bedId: null,
        title: maint2Title,
        description:
          "Slow drip at the bidet hose washer in Room 201 en-suite bathroom. Does not block room use.",
        category: "PLUMBING",
        priority: "MEDIUM",
        attachmentIntentIds: [],
      });
    }

    const maint3Title = "Replace study desk warm-white LED bulb";
    const existingMaint3 = await db.maintenanceRequest.findFirst({
      where: { ownerUserId, title: maint3Title },
      select: { id: true },
    });
    if (!existingMaint3) {
      const createdMaint3 = await createMaintenanceRequest(ownerUserId, {
        roomId: room202.id,
        bedId: null,
        title: maint3Title,
        description: "Desk lamp bulb flickered during room turnover check.",
        category: "ELECTRICAL",
        priority: "LOW",
        attachmentIntentIds: [],
      });

      await addMaintenanceUpdate(ownerUserId, {
        requestId: createdMaint3.id,
        expectedVersion: createdMaint3.version,
        statusTo: "RESOLVED",
        note: "Installed new 9W warm-white LED bulb prior to guest check-in.",
        attachmentIntentIds: [],
      });
    }

    // 8. Notices (Everyone, Room, and Tenant audiences)
    async function ensureNotice(input: {
      audience: "EVERYONE" | "ROOM" | "TENANT";
      roomId: string | null;
      tenantId: string | null;
      title: string;
      body: string;
      startDateManila: string;
      endDateManila: string;
    }) {
      const existing = await db.notice.findFirst({
        where: { ownerUserId, title: input.title },
        select: { id: true },
      });
      if (existing) return existing;
      return createNotice(ownerUserId, input);
    }

    await ensureNotice({
      audience: "EVERYONE",
      roomId: null,
      tenantId: null,
      title: "Monthly rooftop water tank cleaning this Saturday",
      body: "Water supply will be briefly paused from 9:00 AM to 11:30 AM on Saturday for routine tank sanitization. Please store water in advance.",
      startDateManila: addManilaDays(todayManila, -1),
      endDateManila: addManilaDays(todayManila, 7),
    });

    await ensureNotice({
      audience: "ROOM",
      roomId: room101.id,
      tenantId: null,
      title: "Room 101 aircon filter cleaning schedule",
      body: "Our technician will clean the Room 101 split-type aircon filters at 2:00 PM tomorrow. Kindly clear the area below the indoor unit.",
      startDateManila: todayManila,
      endDateManila: addManilaDays(todayManila, 5),
    });

    await ensureNotice({
      audience: "TENANT",
      roomId: null,
      tenantId: maria.id,
      title: "Lease renewal check-in reminder",
      body: "Hi Maria, please let the front desk know if you plan to renew your Room 101 lease for the upcoming semester.",
      startDateManila: addManilaDays(todayManila, 3),
      endDateManila: addManilaDays(todayManila, 14),
    });

    const [
      roomTypesCount,
      roomsCount,
      tenantsCount,
      assignmentsCount,
      invoicesCount,
      paymentsCount,
      guestsCount,
      reservationsCount,
      requestsCount,
      maintenanceCount,
      noticesCount,
    ] = await Promise.all([
      db.roomType.count({ where: { ownerUserId } }),
      db.room.count({ where: { ownerUserId } }),
      db.tenant.count({ where: { ownerUserId } }),
      db.tenantAssignment.count({ where: { ownerUserId } }),
      db.invoice.count({ where: { ownerUserId } }),
      db.payment.count({ where: { ownerUserId } }),
      db.transientGuest.count({ where: { ownerUserId } }),
      db.transientReservation.count({ where: { ownerUserId } }),
      db.bookingRequest.count({ where: { ownerUserId } }),
      db.maintenanceRequest.count({ where: { ownerUserId } }),
      db.notice.count({ where: { ownerUserId } }),
    ]);

    console.log(
      JSON.stringify({
        seeded: true,
        counts: {
          roomTypes: roomTypesCount,
          rooms: roomsCount,
          tenants: tenantsCount,
          assignments: assignmentsCount,
          invoices: invoicesCount,
          payments: paymentsCount,
          transientGuests: guestsCount,
          transientReservations: reservationsCount,
          bookingRequests: requestsCount,
          maintenanceRequests: maintenanceCount,
          notices: noticesCount,
        },
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Sample seed failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
