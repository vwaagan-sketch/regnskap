"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export default function PrintButton() {
  return <Button variant="secondary" onClick={() => window.print()} aria-label="Skriv ut"><Printer className="h-4 w-4" /><span className="hidden sm:inline">Skriv ut</span></Button>;
}
