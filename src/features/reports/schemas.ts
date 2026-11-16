import { z } from "zod";
import type {
  MaintenanceCategoryValue,
  MaintenancePriorityValue,
  MaintenanceStatusValue,
} from "@/features/maintenance/schemas";
import type {
  PaymentMethodValue,
  PaymentStatusValue,
} from "@/features/payments/schemas";
import type { RoomBuildingValue } from "@/features/rooms/schemas";
import type { TransientReservationStatusValue } from "@/features/transients/schemas";
import { diffManilaDays, isValidManilaDate, toManilaDate } from "@/lib/dates";
import type {
  CollectionTrendPoint,
  LeaseExpiryBucketValue,
} from "./calculations";

export const REPORT_TYPES = [
  "occupancy",
  "rent-roll",
  "receivables-aging",
  "collections",
  "transient-revenue",
  "maintenance",
] as const;

export type ReportTypeValue = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportTypeValue, string> = {
  occupancy: "Occupancy",
  "rent-roll": "Rent roll",
  "receivables-aging": "Receivables aging",
  collections: "Collections",
  "transient-revenue": "Transient revenue",
  maintenance: "Maintenance",
};

export const REPORT_DESCRIPTIONS: Record<ReportTypeValue, string> = {
  occupancy:
    "Room, bed, and whole-room hold capacity across boarding and transient buildings on the selected date.",
  "rent-roll":
    "Active long-term boarding assignments on the selected date with monthly rate, security deposit, and open balance.",
  "receivables-aging":
    "Open invoice balances aged from due date using invoice issuances, adjustments, and payment reversals up to the selected date.",
  collections:
    "Posted receipts and reversal entries within the selected date range grouped by payment method.",
  "transient-revenue":
    "Transient stays within the selected date range showing nights, stay totals, invoiced amounts, collections, and cancellations.",
  maintenance:
    "Maintenance tickets reported or open in the selected window, category breakdown, and active occupancy holds.",
};

export const REPORT_BUILDING_FILTERS = [
  "all",
  "BOARDING",
  "TRANSIENT",
] as const;
export type ReportBuildingFilter = (typeof REPORT_BUILDING_FILTERS)[number];

export const REPORT_BUILDING_FILTER_LABELS: Record<
  ReportBuildingFilter,
  string
> = {
  all: "All buildings",
  BOARDING: "Boarding House",
  TRANSIENT: "Transient Building",
};

export const AGING_BUCKETS = [
  "CURRENT",
  "1_30",
  "31_60",
  "61_90",
  "91_PLUS",
] as const;

export type AgingBucketValue = (typeof AGING_BUCKETS)[number];

export const AGING_BUCKET_LABELS: Record<AgingBucketValue, string> = {
  CURRENT: "Current (not past due)",
  "1_30": "1–30 days past due",
  "31_60": "31–60 days past due",
  "61_90": "61–90 days past due",
  "91_PLUS": "91+ days past due",
};

export const REPORT_MAX_PERIOD_DAYS = 366;
export const REPORT_MAX_ROWS = 500;

const optionalDateParamSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .refine(
    (value) => value === "" || isValidManilaDate(value),
    "Use YYYY-MM-DD format for report dates.",
  );

export const RawReportFilterSchema = z.object({
  asOfDate: optionalDateParamSchema,
  fromDate: optionalDateParamSchema,
  toDate: optionalDateParamSchema,
  building: z.enum(REPORT_BUILDING_FILTERS).optional().default("all"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REPORT_MAX_ROWS)
    .optional()
    .default(REPORT_MAX_ROWS),
});

export type ResolvedReportFilters = {
  asOfDate: string;
  fromDate: string;
  toDate: string;
  building: ReportBuildingFilter;
  limit: number;
};

/**
 * Validates and resolves default report dates (`asOfDate` = today in Asia/Manila,
 * `fromDate` = 1st of `asOfDate`'s month, `toDate` = `asOfDate`) with a bounded window.
 */
export function resolveReportFilters(
  input: Record<string, unknown>,
  nowUtc: Date = new Date(),
): ResolvedReportFilters {
  const parsed = RawReportFilterSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Check report filter values.",
    );
  }

  const todayManila = toManilaDate(nowUtc);
  const asOfDate = parsed.data.asOfDate || todayManila;
  const toDate = parsed.data.toDate || asOfDate;
  const defaultMonthStart = `${toDate.slice(0, 8)}01`;
  const fromDate = parsed.data.fromDate || defaultMonthStart;

  if (fromDate > toDate) {
    throw new Error("Start date cannot be after end date.");
  }

  if (diffManilaDays(fromDate, toDate) > REPORT_MAX_PERIOD_DAYS) {
    throw new Error(`Date range cannot exceed ${REPORT_MAX_PERIOD_DAYS} days.`);
  }

  return {
    asOfDate,
    fromDate,
    toDate,
    building: parsed.data.building,
    limit: parsed.data.limit,
  };
}

export const ReportExportQuerySchema = z.object({
  reportType: z.enum(REPORT_TYPES),
});

export type OccupancyRoomRowDto = {
  roomId: string;
  roomCode: string;
  roomName: string;
  building: RoomBuildingValue;
  floor: string;
  isTransientPublished: boolean;
  capacityBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
  activeAllocationCount: number;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
  monthlyRate: string;
  transientDailyRate: string | null;
};

export type OccupancyBuildingComparisonDto = {
  building: RoomBuildingValue;
  buildingLabel: string;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  maintenanceRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
  occupancyRatePercent: number | null;
  potentialMonthlyRevenue: string;
  occupiedMonthlyRevenue: string;
  potentialDailyRateTotal: string;
  occupiedDailyRateTotal: string;
};

export type OccupancyRoomTypeComparisonDto = {
  roomTypeId: string;
  roomTypeName: string;
  building: RoomBuildingValue;
  buildingLabel: string;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  maintenanceRooms: number;
  occupancyRatePercent: number | null;
  totalBeds: number;
  occupiedBeds: number;
  avgMonthlyRate: string | null;
  avgDailyRate: string | null;
};

export type OccupancyReportDto = {
  summary: {
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    maintenanceRooms: number;
    boardingRooms: number;
    transientRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    maintenanceBeds: number;
    occupancyRatePercent: number | null;
    boardingOccupancyRatePercent: number | null;
    transientOccupancyRatePercent: number | null;
  };
  byBuilding: OccupancyBuildingComparisonDto[];
  byRoomType: OccupancyRoomTypeComparisonDto[];
  rows: OccupancyRoomRowDto[];
};

export type RentRollRowDto = {
  assignmentId: string;
  tenantId: string;
  tenantName: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  bedCode: string;
  startDate: string;
  endDate: string;
  status: string;
  monthlyRate: string;
  securityDeposit: string;
  openInvoiceBalance: string;
};

export type RentRollRoomTypeSummaryDto = {
  roomTypeId: string;
  roomTypeName: string;
  activeAssignments: number;
  sharePercent: number;
  totalMonthlyRent: string;
  totalSecurityDeposits: string;
  totalOpenBalance: string;
};

export type RentRollExpiryBucketDto = {
  bucket: LeaseExpiryBucketValue;
  label: string;
  count: number;
  monthlyRentAtRisk: string;
};

export type RentRollReportDto = {
  summary: {
    activeAssignments: number;
    totalMonthlyRent: string;
    totalSecurityDeposits: string;
    totalOpenBalance: string;
    averageMonthlyRent: string | null;
    openBalanceToRentPercent: number | null;
  };
  byRoomType: RentRollRoomTypeSummaryDto[];
  leaseExpiries: RentRollExpiryBucketDto[];
  rows: RentRollRowDto[];
};

export type ReceivablesAgingBucketDto = {
  bucket: AgingBucketValue;
  label: string;
  count: number;
  outstandingAmount: string;
};

export type ReceivablesScopeComparisonDto = {
  scope: "BOARDING" | "TRANSIENT";
  scopeLabel: string;
  openInvoicesCount: number;
  overdueInvoicesCount: number;
  outstandingAmount: string;
  overdueAmount: string;
};

export type ReceivablesAgingRowDto = {
  invoiceId: string;
  invoiceNumber: string;
  scope: "BOARDING" | "TRANSIENT";
  partyName: string;
  issuedDate: string;
  dueDate: string;
  daysPastDue: number;
  bucket: AgingBucketValue;
  totalAmount: string;
  paidAsOfAmount: string;
  balanceDue: string;
};

export type ReceivablesAgingReportDto = {
  summary: {
    openInvoicesCount: number;
    overdueInvoicesCount: number;
    totalOutstanding: string;
    overdueAmount: string;
    currentAmount: string;
    bucket1To30Amount: string;
    bucket31To60Amount: string;
    bucket61To90Amount: string;
    bucket91PlusAmount: string;
  };
  buckets: ReceivablesAgingBucketDto[];
  byScope: ReceivablesScopeComparisonDto[];
  rows: ReceivablesAgingRowDto[];
};

export type CollectionsMethodSummaryDto = {
  method: PaymentMethodValue;
  methodLabel: string;
  entryCount: number;
  postedAmount: string;
  reversalAmount: string;
  netAmount: string;
};

export type CollectionsScopeSummaryDto = {
  scope: "BOARDING" | "TRANSIENT";
  scopeLabel: string;
  entryCount: number;
  postedAmount: string;
  reversalAmount: string;
  netAmount: string;
};

export type CollectionsRowDto = {
  paymentId: string;
  receiptNumber: string | null;
  paidDate: string;
  paidAt: string;
  status: PaymentStatusValue;
  method: PaymentMethodValue;
  scope: "BOARDING" | "TRANSIENT";
  partyName: string;
  amount: string;
  unallocatedAmount: string;
  reversalReason: string | null;
};

export type CollectionsReportDto = {
  summary: {
    entryCount: number;
    postedCount: number;
    reversedCount: number;
    reversalCount: number;
    grossPostedAmount: string;
    totalReversalsAmount: string;
    netCollectedAmount: string;
    unallocatedCreditTotal: string;
    reversalRatePercent: number | null;
  };
  byMethod: CollectionsMethodSummaryDto[];
  byScope: CollectionsScopeSummaryDto[];
  dailyTrend: CollectionTrendPoint[];
  rows: CollectionsRowDto[];
};

export type TransientRevenueRowDto = {
  reservationId: string;
  guestId: string;
  guestName: string;
  roomCode: string;
  roomName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  status: TransientReservationStatusValue;
  dailyRate: string;
  totalAmount: string;
  invoicedAmount: string;
  collectedAmount: string;
};

export type TransientStatusSummaryDto = {
  status: TransientReservationStatusValue;
  statusLabel: string;
  staysCount: number;
  totalNights: number;
  stayAmount: string;
  invoicedAmount: string;
  collectedAmount: string;
};

export type TransientRoomTypeSummaryDto = {
  roomTypeId: string;
  roomTypeName: string;
  staysCount: number;
  activeOrCompletedCount: number;
  cancelledOrNoShowCount: number;
  totalNights: number;
  grossStayRevenue: string;
  invoicedAmount: string;
  collectedAmount: string;
};

export type TransientRevenueReportDto = {
  summary: {
    staysCount: number;
    activeOrCompletedCount: number;
    cancelledCount: number;
    noShowCount: number;
    totalNights: number;
    grossStayRevenue: string;
    invoicedAmount: string;
    collectedAmount: string;
    averageDailyRate: string | null;
    averageNightsPerStay: string | null;
    collectionRatePercent: number | null;
  };
  byStatus: TransientStatusSummaryDto[];
  byRoomType: TransientRoomTypeSummaryDto[];
  rows: TransientRevenueRowDto[];
};

export type MaintenanceCategorySummaryDto = {
  category: MaintenanceCategoryValue;
  categoryLabel: string;
  totalCount: number;
  openCount: number;
  activeHoldCount: number;
  resolvedCount: number;
};

export type MaintenancePrioritySummaryDto = {
  priority: MaintenancePriorityValue;
  priorityLabel: string;
  totalCount: number;
  openCount: number;
  activeHoldCount: number;
  resolvedCount: number;
};

export type MaintenanceBuildingSummaryDto = {
  building: RoomBuildingValue;
  buildingLabel: string;
  totalCount: number;
  openCount: number;
  activeHoldCount: number;
  resolvedCount: number;
};

export type MaintenanceReportRowDto = {
  requestId: string;
  roomCode: string;
  roomName: string;
  building: RoomBuildingValue;
  title: string;
  category: MaintenanceCategoryValue;
  priority: MaintenancePriorityValue;
  status: MaintenanceStatusValue;
  blocksOccupancy: boolean;
  reportedDate: string;
  resolvedDate: string | null;
};

export type MaintenanceReportDto = {
  summary: {
    totalInWindow: number;
    openCount: number;
    urgentOpenCount: number;
    activeHoldCount: number;
    resolvedInWindow: number;
    cancelledInWindow: number;
    resolutionRatePercent: number | null;
    avgResolutionDays: string | null;
  };
  byCategory: MaintenanceCategorySummaryDto[];
  byPriority: MaintenancePrioritySummaryDto[];
  byBuilding: MaintenanceBuildingSummaryDto[];
  rows: MaintenanceReportRowDto[];
};

export type ReportsOverviewDto = {
  filters: {
    asOfDate: string;
    fromDate: string;
    toDate: string;
    building: ReportBuildingFilter;
  };
  generatedAt: string;
  occupancy: OccupancyReportDto;
  rentRoll: RentRollReportDto;
  receivablesAging: ReceivablesAgingReportDto;
  collections: CollectionsReportDto;
  transientRevenue: TransientRevenueReportDto;
  maintenance: MaintenanceReportDto;
};
