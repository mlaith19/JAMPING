import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  await prisma.device.upsert({
    where: { id: "seed-start" },
    update: {},
    create: { id: "seed-start", name: "Start Sensor", type: "START", online: true, battery: 95 },
  });
  await prisma.device.upsert({
    where: { id: "seed-finish" },
    update: {},
    create: { id: "seed-finish", name: "Finish Sensor", type: "FINISH", online: true, battery: 88 },
  });

  const horses = [
    { name: "Thunder", yearOfBirth: 2015, sex: "GELDING" as const, color: "Bay", owner: "Stable A" },
    { name: "Lightning", yearOfBirth: 2016, sex: "MARE" as const, color: "Chestnut", owner: "Stable B" },
    { name: "Storm", yearOfBirth: 2014, sex: "STALLION" as const, color: "Black", owner: "Stable C" },
    { name: "Comet", yearOfBirth: 2017, sex: "GELDING" as const, color: "Grey", owner: "Stable A" },
  ];
  for (const h of horses) {
    const exists = await prisma.horse.findFirst({ where: { name: h.name } });
    if (!exists) await prisma.horse.create({ data: h });
  }

  const riders = [
    { name: "Alex Cohen", phone: "+972-50-1234567", country: "Israel", club: "Tel Aviv Riding" },
    { name: "Sara Levi", phone: "+972-52-7654321", country: "Israel", club: "Jerusalem Equestrian" },
    { name: "John Smith", phone: "+1-555-0100", country: "USA", club: "NY Riders" },
    { name: "Maria Garcia", phone: "+34-600-123456", country: "Spain", club: "Madrid Club" },
  ];
  for (const r of riders) {
    const exists = await prisma.rider.findFirst({ where: { name: r.name } });
    if (!exists) await prisma.rider.create({ data: r });
  }

  const sampleComp = await prisma.competition.findFirst({ where: { name: "Spring Classic 2026" } });
  if (!sampleComp) {
    const c = await prisma.competition.create({
      data: {
        name: "Spring Classic 2026",
        date: new Date(),
        location: "Tel Aviv Arena",
        status: "DRAFT",
        language: "en",
      },
    });
    await prisma.showClass.create({
      data: {
        competitionId: c.id,
        name: "Class 1 - 1.10m Open",
        courseHeight: 110,
        category: "Open",
        allowedTime: 80,
        scoringType: "FAULTS_TIME",
      },
    });
    await prisma.showClass.create({
      data: {
        competitionId: c.id,
        name: "Class 2 - 1.20m Speed",
        courseHeight: 120,
        category: "Speed",
        allowedTime: 75,
        scoringType: "TIME_ONLY",
      },
    });
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
