/**
 * Pure domain types for the RBMI Library Business Rules Engine (BR-01 to BR-09).
 * Zero database or framework dependencies.
 */

export interface CirculationRule {
  id?: number;
  libraryId?: number | null;
  categoryId?: number | null;
  itemTypeId?: number | null;
  maxBooks: number;
  loanDays: number;
  maxRenewals: number;
  finePerDay: number | string;
  graceDays: number;
  maxFine?: number | string | null;
  holdsAllowed: boolean;
}

export interface RuleTarget {
  libraryId?: number | null;
  categoryId: number;
  itemTypeId: number;
  isReference?: boolean;
}

export interface SystemSettingsConfig {
  defaultLoanDays: number; // DEFAULT_LOAN_DAYS (14)
  defaultMaxBooks: number; // DEFAULT_MAX_BOOKS (3)
  defaultMaxRenewals: number; // DEFAULT_MAX_RENEWALS (1)
  defaultFinePerDay: number; // DEFAULT_FINE_PER_DAY (2.00)
  defaultGraceDays: number; // DEFAULT_GRACE_DAYS (0)
  fineBlockLimit: number; // FINE_BLOCK_LIMIT (100.00)
  blockIssueIfOverdue: boolean; // BLOCK_ISSUE_IF_OVERDUE (true)
  holdPickupDays: number; // HOLD_PICKUP_DAYS (2)
  lostProcessingFee: number; // LOST_PROCESSING_FEE (50.00)
  opacAllowHolds: boolean; // OPAC_ALLOW_HOLDS (true)
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
  defaultLoanDays: 14,
  defaultMaxBooks: 3,
  defaultMaxRenewals: 1,
  defaultFinePerDay: 2.0,
  defaultGraceDays: 0,
  fineBlockLimit: 100.0,
  blockIssueIfOverdue: true,
  holdPickupDays: 2,
  lostProcessingFee: 50.0,
  opacAllowHolds: true,
};

export interface RuleResolutionResult {
  rule: CirculationRule;
  score: number;
  isFallback: boolean;
}

export interface PatronCirculationContext {
  id?: number;
  status: string; // ACTIVE, BLOCKED, EXPIRED, GRADUATED, LEFT
  cardExpiry: string | Date;
  activeLoansCount: number;
  hasOverdueLoans: boolean;
  outstandingFinesTotal: number;
}

export interface CopyCirculationContext {
  id?: number;
  status: string; // AVAILABLE, ISSUED, RESERVED, REFERENCE_ONLY, etc.
  isReference: boolean;
  reservedForPatronId?: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  rule?: CirculationRule;
  stepFailed?: number;
}

export interface RenewalContext {
  currentRenewalCount: number;
  isOverdue: boolean;
  hasWaitingHold: boolean;
  patronOutstandingFines: number;
}

export interface OverdueFineCalculationParams {
  dueDate: string | Date;
  returnDate: string | Date;
  finePerDay: number | string;
  graceDays?: number;
  maxFine?: number | string | null;
}

export interface OverdueFineCalculationResult {
  daysLate: number;
  chargeableDays: number;
  calculatedFine: number;
  finalOverdueFine: number;
  isCapped: boolean;
}

export interface LostChargeCalculationParams {
  itemPrice?: number | string | null;
  bibPrice?: number | string | null;
  lostProcessingFee?: number | string | null;
  overdueFineToDate?: number | string | null;
}

export interface LostChargeCalculationResult {
  baseReplacementPrice: number;
  processingFee: number;
  overdueFineToDate: number;
  totalLostCharge: number;
}

export interface HoldPlacementParams {
  patron: {
    id: number;
    status: string;
    cardExpiry: string | Date;
  };
  title: {
    availableCopiesCount: number;
  };
  patronActiveHoldsOnTitle: number;
  patronActiveLoansOnTitle: number;
  rule: CirculationRule;
  settings?: Partial<SystemSettingsConfig>;
}

export interface WaitingHoldItem {
  id: number;
  patronId: number;
  requestDate: string | Date;
}
