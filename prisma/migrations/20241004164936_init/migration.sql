/*
  Warnings:

  - Added the required column `score_ratio` to the `producerScores` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "producerScores" ADD COLUMN     "score_ratio" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE INDEX "producerScores_score_ratio_idx" ON "producerScores"("score_ratio");
