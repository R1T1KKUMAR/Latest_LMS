/**
 * Entity Status Transitions & State Machine Validation.
 * Pure validation logic strictly implementing docs/status-transition-spec.md.
 */

export type ItemStatus =
  | "AVAILABLE"
  | "ISSUED"
  | "RESERVED"
  | "REFERENCE_ONLY"
  | "LOST"
  | "DAMAGED"
  | "REPAIR"
  | "WITHDRAWN"
  | "PROCESSING";

export type PatronStatus = "ACTIVE" | "BLOCKED" | "EXPIRED" | "GRADUATED" | "LEFT";

export type HoldStatus = "WAITING" | "AVAILABLE_FOR_PICKUP" | "COMPLETED" | "EXPIRED" | "CANCELLED";

export type LoanStatus = "ISSUED" | "RETURNED" | "LOST";

export type FineStatus = "OUTSTANDING" | "PAID" | "WAIVED";

export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates copy (item) status transitions (docs/status-transition-spec.md §2).
 */
export function validateItemStatusTransition(
  from: ItemStatus,
  to: ItemStatus,
  context?: {
    isDesk?: boolean;
    isReference?: boolean;
    hasWaitingHold?: boolean;
  },
): TransitionValidationResult {
  if (from === to) {
    return { valid: true };
  }

  // 1. Desk Operations
  if (to === "ISSUED") {
    if (from === "AVAILABLE" || from === "REFERENCE_ONLY" || from === "RESERVED") {
      return { valid: true };
    }
    return {
      valid: false,
      reason: `Cannot issue copy currently in status "${from}"`,
    };
  }

  if (from === "ISSUED") {
    if (to === "LOST") {
      return { valid: true }; // Declared lost at desk
    }
    if (to === "RESERVED") {
      if (context?.hasWaitingHold) return { valid: true };
      return {
        valid: false,
        reason: "Cannot transition returned copy to RESERVED without a waiting hold",
      };
    }
    if (to === "REFERENCE_ONLY") {
      if (context?.isReference) return { valid: true };
      return {
        valid: false,
        reason: "Non-reference copy cannot transition to REFERENCE_ONLY",
      };
    }
    if (to === "AVAILABLE") {
      if (context?.isReference) {
        return {
          valid: false,
          reason: "Reference items must return to REFERENCE_ONLY status",
        };
      }
      return { valid: true };
    }
    return {
      valid: false,
      reason: `Issued copies must be returned or marked lost before transitioning to "${to}"`,
    };
  }

  if (from === "RESERVED") {
    if (to === "AVAILABLE" || to === "REFERENCE_ONLY") {
      if (to === "AVAILABLE" && context?.isReference) {
        return {
          valid: false,
          reason: "Reference items must return to REFERENCE_ONLY status",
        };
      }
      return { valid: true }; // Released on hold expiry/cancellation
    }
    return {
      valid: false,
      reason: `Reserved copies can only be issued or returned to stock, not set to "${to}"`,
    };
  }

  // 2. Administrative Operations (CATALOG_MANAGE)
  const adminStockStatuses: ItemStatus[] = ["DAMAGED", "REPAIR", "WITHDRAWN", "PROCESSING"];

  if (from === "AVAILABLE" || from === "REFERENCE_ONLY") {
    if (adminStockStatuses.includes(to)) {
      return { valid: true };
    }
  }

  if (adminStockStatuses.includes(from)) {
    if (to === "AVAILABLE" || to === "REFERENCE_ONLY") {
      if (to === "AVAILABLE" && context?.isReference) {
        return {
          valid: false,
          reason: "Repaired reference items must return to REFERENCE_ONLY status",
        };
      }
      return { valid: true };
    }
    if (adminStockStatuses.includes(to)) {
      return { valid: true }; // e.g. DAMAGED -> REPAIR or REPAIR -> WITHDRAWN
    }
  }

  return {
    valid: false,
    reason: `Invalid copy status transition from "${from}" to "${to}"`,
  };
}

/**
 * Validates patron status transitions (docs/status-transition-spec.md §3).
 */
export function validatePatronStatusTransition(
  from: PatronStatus,
  to: PatronStatus,
): TransitionValidationResult {
  if (from === to) return { valid: true };

  // Terminal states cannot be reactivated
  if (from === "GRADUATED") {
    return {
      valid: false,
      reason: "Graduated patron account is closed and cannot change status",
    };
  }

  if (from === "LEFT") {
    return {
      valid: false,
      reason: "Withdrawn patron account has left and cannot change status",
    };
  }

  if (from === "ACTIVE") {
    if (["BLOCKED", "EXPIRED", "GRADUATED", "LEFT"].includes(to)) {
      return { valid: true };
    }
  }

  if (from === "BLOCKED" || from === "EXPIRED") {
    if (to === "ACTIVE") return { valid: true }; // Unblocked or renewed
    if (to === "GRADUATED" || to === "LEFT") return { valid: true };
  }

  return {
    valid: false,
    reason: `Invalid patron status transition from "${from}" to "${to}"`,
  };
}

/**
 * Validates hold reservation status transitions (docs/status-transition-spec.md §4).
 */
export function validateHoldStatusTransition(
  from: HoldStatus,
  to: HoldStatus,
): TransitionValidationResult {
  if (from === to) return { valid: true };

  // Terminal states
  if (from === "COMPLETED" || from === "EXPIRED" || from === "CANCELLED") {
    return {
      valid: false,
      reason: `Hold in terminal status "${from}" cannot be modified`,
    };
  }

  if (from === "WAITING") {
    if (to === "AVAILABLE_FOR_PICKUP" || to === "CANCELLED") {
      return { valid: true };
    }
  }

  if (from === "AVAILABLE_FOR_PICKUP") {
    if (to === "COMPLETED" || to === "EXPIRED" || to === "CANCELLED") {
      return { valid: true };
    }
  }

  return {
    valid: false,
    reason: `Invalid hold status transition from "${from}" to "${to}"`,
  };
}

/**
 * Validates loan status transitions.
 */
export function validateLoanStatusTransition(
  from: LoanStatus,
  to: LoanStatus,
): TransitionValidationResult {
  if (from === to) return { valid: true };

  if (from === "ISSUED") {
    if (to === "RETURNED" || to === "LOST") {
      return { valid: true };
    }
  }

  return {
    valid: false,
    reason: `Loan in status "${from}" cannot transition to "${to}"`,
  };
}

/**
 * Validates fine status transitions (docs/status-transition-spec.md §5).
 */
export function validateFineStatusTransition(
  from: FineStatus,
  to: FineStatus,
  balance: number = 0,
): TransitionValidationResult {
  if (from === to && from === "OUTSTANDING") {
    return { valid: true }; // Partial payment leaves it OUTSTANDING
  }

  if (from === "PAID" || from === "WAIVED") {
    return {
      valid: false,
      reason: `Fine in terminal status "${from}" is immutable (FR-FI-05)`,
    };
  }

  if (from === "OUTSTANDING") {
    if (to === "PAID") {
      if (balance > 0) {
        return {
          valid: false,
          reason: "Cannot mark fine as PAID when remaining balance is greater than zero",
        };
      }
      return { valid: true };
    }
    if (to === "WAIVED") {
      return { valid: true };
    }
  }

  return {
    valid: false,
    reason: `Invalid fine status transition from "${from}" to "${to}"`,
  };
}
