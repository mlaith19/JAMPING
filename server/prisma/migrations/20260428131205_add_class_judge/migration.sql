-- CreateEnum
CREATE TYPE "JudgeRole" AS ENUM ('CHIEF_JUDGE', 'JUDGE', 'TIMEKEEPER', 'SECRETARY');

-- CreateTable
CREATE TABLE "ClassJudge" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "JudgeRole" NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassJudge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassJudge_classId_idx" ON "ClassJudge"("classId");

-- AddForeignKey
ALTER TABLE "ClassJudge" ADD CONSTRAINT "ClassJudge_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ShowClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
