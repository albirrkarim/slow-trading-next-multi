import { notFound } from "next/navigation";

import CoinsPage from "@/components/dev/Coins";
import { isDevBacktestEnabled } from "@/lib/env/devBacktest";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isDevBacktestEnabled()) {
    notFound();
  }

  return <CoinsPage />;
}
