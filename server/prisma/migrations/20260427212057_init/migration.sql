-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('SHOW_JUMPING');

-- CreateEnum
CREATE TYPE "ScoringType" AS ENUM ('FAULTS_TIME', 'TIME_ONLY', 'JUMP_OFF');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('REGISTERED', 'SCRATCHED', 'ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'OK', 'RETIRED', 'ELIMINATED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('START', 'FINISH');

-- CreateEnum
CREATE TYPE "HorseSex" AS ENUM ('MARE', 'STALLION', 'GELDING');

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "type" "CompetitionType" NOT NULL DEFAULT 'SHOW_JUMPING',
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "language" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowClass" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseHeight" INTEGER NOT NULL DEFAULT 100,
    "category" TEXT NOT NULL DEFAULT 'Open',
    "allowedTime" INTEGER NOT NULL DEFAULT 90,
    "scoringType" "ScoringType" NOT NULL DEFAULT 'FAULTS_TIME',
    "knockdownPenalty" INTEGER NOT NULL DEFAULT 4,
    "refusalPenalty" INTEGER NOT NULL DEFAULT 4,
    "eliminationRules" JSONB,
    "startListLocked" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "currentEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horse" (
    "id" TEXT NOT NULL,
    "internalNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "yearOfBirth" INTEGER,
    "sex" "HorseSex",
    "color" TEXT,
    "owner" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Horse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rider" (
    "id" TEXT NOT NULL,
    "internalNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "club" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "EntryStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "faults" INTEGER NOT NULL DEFAULT 0,
    "timeMs" INTEGER NOT NULL DEFAULT 0,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "judgedAt" TIMESTAMP(3),
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "battery" INTEGER NOT NULL DEFAULT 100,
    "lastTriggerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Horse_internalNumber_key" ON "Horse"("internalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_internalNumber_key" ON "Rider"("internalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_classId_startNumber_key" ON "Entry"("classId", "startNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_classId_horseId_riderId_key" ON "Entry"("classId", "horseId", "riderId");

-- AddForeignKey
ALTER TABLE "ShowClass" ADD CONSTRAINT "ShowClass_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ShowClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ShowClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
