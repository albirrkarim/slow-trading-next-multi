import { Suspense } from "react";
import PinClient from "./PinClient";

export default function PinPage() {
  return (
    <Suspense>
      <PinClient />
    </Suspense>
  );
}
