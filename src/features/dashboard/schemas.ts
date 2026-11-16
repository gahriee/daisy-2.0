import { z } from "zod";
import { AUDIT_AREA_LABELS } from "@/features/audit/schemas";
import { INVOICE_STATUSES } from "@/features/billing/schemas";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
} from "@/features/maintenance/schemas";
import { NOTICE_AUDIENCES } from "@/features/notices/schemas";
import { ROOM_BUILDINGS } from "@/features/rooms/schemas";
import { TRANSIENT_RESERVATION_STATUSES } from "@/features/transients/schemas";

export const DashboardBuildingOccupancySchema = z.object({
  totalRooms: z.number().int().min(0),
  occupiedRooms: z.number().int().min(0),
  availableRooms: z.number().int().min(0),
  maintenanceRooms: z.number().int().min(0),
  publishedRooms: z.number().int().min(0),
  occupancyPercent: z.number().int().min(0).max(100).nullable(),
});

export type DashboardBuildingOccupancyDto = z.infer<
  typeof DashboardBuildingOccupancySchema
>;

export const DashboardDueInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  payerName: z.string(),
  payerKind: z.enum(["TENANT", "TRANSIENT"]),
  dueDateManila: z.string(),
  balanceAmount: z.string(),
  status: z.enum([INVOICE_STATUSES[1], INVOICE_STATUSES[2]]),
  isOverdue: z.boolean(),
});

export type DashboardDueInvoiceDto = z.infer<typeof DashboardDueInvoiceSchema>;

export const DashboardTransientTurnoverSchema = z.object({
  id: z.string().uuid(),
  guestName: z.string(),
  roomNumber: z.string(),
  status: z.enum(TRANSIENT_RESERVATION_STATUSES),
  checkInDateManila: z.string(),
  checkOutDateManila: z.string(),
  nights: z.number().int().min(1),
  partySize: z.number().int().min(1),
  totalAmount: z.string(),
});

export type DashboardTransientTurnoverDto = z.infer<
  typeof DashboardTransientTurnoverSchema
>;

export const DashboardBoardingMoveInSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  roomNumber: z.string(),
  startDateManila: z.string(),
  endDateManila: z.string(),
});

export type DashboardBoardingMoveInDto = z.infer<
  typeof DashboardBoardingMoveInSchema
>;

export const DashboardEndingAssignmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  roomNumber: z.string(),
  endDateManila: z.string(),
  daysRemaining: z.number().int(),
});

export type DashboardEndingAssignmentDto = z.infer<
  typeof DashboardEndingAssignmentSchema
>;

export const DashboardPendingRequestSchema = z.object({
  id: z.string().uuid(),
  referenceCode: z.string(),
  guestName: z.string(),
  roomNumber: z.string(),
  checkInDateManila: z.string(),
  checkOutDateManila: z.string(),
  nights: z.number().int().min(1),
  partySize: z.number().int().min(1),
  quotedTotalAmount: z.string(),
  createdAt: z.string(),
});

export type DashboardPendingRequestDto = z.infer<
  typeof DashboardPendingRequestSchema
>;

export const DashboardMaintenanceItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  roomNumber: z.string(),
  building: z.enum(ROOM_BUILDINGS),
  category: z.enum(MAINTENANCE_CATEGORIES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  status: z.enum([
    MAINTENANCE_STATUSES[0],
    MAINTENANCE_STATUSES[1],
    MAINTENANCE_STATUSES[2],
  ]),
  hasActiveHold: z.boolean(),
  createdAt: z.string(),
});

export type DashboardMaintenanceItemDto = z.infer<
  typeof DashboardMaintenanceItemSchema
>;

export const DashboardNoticeItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  audience: z.enum(NOTICE_AUDIENCES),
  targetLabel: z.string(),
  startDateManila: z.string(),
  endDateManila: z.string(),
});

export type DashboardNoticeItemDto = z.infer<typeof DashboardNoticeItemSchema>;

export const DashboardActivityItemSchema = z.object({
  id: z.string().uuid(),
  area: z.string(),
  action: z.string(),
  actorType: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: z.string(),
});

export type DashboardActivityItemDto = z.infer<
  typeof DashboardActivityItemSchema
>;

export const DashboardSnapshotSchema = z.object({
  snapshotAt: z.string(),
  businessDateManila: z.string(),
  currentMonthKey: z.string(),
  configuration: z.object({
    policiesConfigured: z.boolean(),
    stayScheduleConfigured: z.boolean(),
  }),
  occupancy: z.object({
    boarding: DashboardBuildingOccupancySchema,
    transient: DashboardBuildingOccupancySchema,
  }),
  billing: z.object({
    openInvoiceCount: z.number().int().min(0),
    openBalance: z.string(),
    overdueInvoiceCount: z.number().int().min(0),
    overdueBalance: z.string(),
    dueSoonInvoiceCount: z.number().int().min(0),
    draftInvoiceCount: z.number().int().min(0),
    collectedThisMonth: z.string(),
    previousMonthKey: z.string(),
    collectedPreviousMonth: z.string(),
    dueAndOverdueInvoices: z.array(DashboardDueInvoiceSchema),
  }),
  staysToday: z.object({
    pendingBookingRequests: z.number().int().min(0),
    pendingBookingRequestsList: z.array(DashboardPendingRequestSchema),
    checkInsTodayCount: z.number().int().min(0),
    checkOutsTodayCount: z.number().int().min(0),
    boardingMoveInsTodayCount: z.number().int().min(0),
    boardingEndingSoonCount: z.number().int().min(0),
    transientCheckInsToday: z.array(DashboardTransientTurnoverSchema),
    transientCheckOutsToday: z.array(DashboardTransientTurnoverSchema),
    boardingMoveInsToday: z.array(DashboardBoardingMoveInSchema),
    boardingEndingSoon: z.array(DashboardEndingAssignmentSchema),
  }),
  maintenance: z.object({
    openCount: z.number().int().min(0),
    urgentCount: z.number().int().min(0),
    activeHoldCount: z.number().int().min(0),
    openRequests: z.array(DashboardMaintenanceItemSchema),
  }),
  notices: z.object({
    activeCount: z.number().int().min(0),
    activeNotices: z.array(DashboardNoticeItemSchema),
  }),
  recentActivity: z.array(DashboardActivityItemSchema),
});

export type DashboardSnapshotDto = z.infer<typeof DashboardSnapshotSchema>;

export function getDashboardAreaLabel(area: string): string {
  return (
    (AUDIT_AREA_LABELS as Record<string, string>)[area] ??
    area.charAt(0).toUpperCase() + area.slice(1)
  );
}
