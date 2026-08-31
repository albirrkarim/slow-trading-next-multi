import { notFound } from "next/navigation";
import BlackSwanBacktest from "@/components/dev/BlackSwanBacktest";
import { isDevBacktestEnabled } from "@/lib/env/devBacktest";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isDevBacktestEnabled()) {
    notFound();
  }
  return <BlackSwanBacktest />;
}
