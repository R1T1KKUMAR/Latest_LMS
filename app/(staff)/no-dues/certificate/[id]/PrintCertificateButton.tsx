"use client";

import { Button } from "@/components/ui/Button";

export function PrintCertificateButton() {
  return (
    <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
      🖨️ Print Certificate (A4)
    </Button>
  );
}
