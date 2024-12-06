-- CreateTable
CREATE TABLE "nodeScores" (
    "id" SERIAL NOT NULL,
    "time_stamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nodeId" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,

    CONSTRAINT "nodeScores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nodeScores_nodeId_time_stamp_idx" ON "nodeScores"("nodeId", "time_stamp");

-- AddForeignKey
ALTER TABLE "nodeScores" ADD CONSTRAINT "nodeScores_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "producerNodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
