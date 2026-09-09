import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("DoiMatKhauNgay!2026", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      fullName: "Quản trị hệ thống",
      username: "admin",
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const categories = ["Tem nhãn", "Túi", "Hộp", "Cuộn màng PE"];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
