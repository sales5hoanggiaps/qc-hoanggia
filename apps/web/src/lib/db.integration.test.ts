import { describe, expect, it, afterAll } from "vitest";
import { prisma } from "@qc/db";

describe("@qc/db round-trip", () => {
  it("tạo và đọc lại 1 Category", async () => {
    const created = await prisma.category.create({ data: { name: "Tem nhãn (test)" } });
    const found = await prisma.category.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Tem nhãn (test)");
    await prisma.category.delete({ where: { id: created.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
