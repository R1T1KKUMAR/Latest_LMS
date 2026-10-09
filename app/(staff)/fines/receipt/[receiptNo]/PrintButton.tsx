"use client";

import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
      🖨️ Print Receipt
    </Button>
  );
}
