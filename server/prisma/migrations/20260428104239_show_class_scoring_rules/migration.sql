-- AlterTable
ALTER TABLE "ShowClass" ADD COLUMN     "firstRefusalFaults" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "jumpOffTimeFaultIntervalSeconds" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "jumpOffTimeFaultPoints" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "knockdownFaults" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "maxRefusalsBeforeElimination" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "secondRefusalFaults" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "timeFaultIntervalSeconds" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "timeFaultPoints" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "timeLimitMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0;
