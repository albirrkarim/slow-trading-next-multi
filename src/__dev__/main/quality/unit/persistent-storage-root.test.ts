import path from "path";
import { FILES } from "@/components/storage";

describe("test persistent storage isolation", () => {
  it("never resolves test storage into a development server instance", () => {
    const normalizedRoot = path.normalize(FILES.slow.root);

    expect(normalizedRoot).not.toContain(
      path.normalize("storage/persistent/instances/3010"),
    );
    expect(normalizedRoot).toContain("slow-trading-next-vitest-");
  });
});
