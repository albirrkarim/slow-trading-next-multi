import { notFound } from "next/navigation";

import DynamicTradePage from "@/components/dev/DynamicTrade";
import { isDevBacktestEnabled } from "@/lib/env/devBacktest";

export const dynamic = "force-dynamic";

export default function Home() {
    if (!isDevBacktestEnabled()) {
        notFound();
    }

    return <DynamicTradePage />;
}
