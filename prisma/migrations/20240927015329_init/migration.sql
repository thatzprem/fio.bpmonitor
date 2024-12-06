-- CreateIndex
CREATE INDEX "producer_chain_status_idx" ON "producer"("chain", "status");

-- CreateIndex
CREATE INDEX "producer_total_votes_idx" ON "producer"("total_votes");

-- CreateIndex
CREATE INDEX "producerBranding_producerId_idx" ON "producerBranding"("producerId");

-- CreateIndex
CREATE INDEX "producerFeeVotes_producerId_idx" ON "producerFeeVotes"("producerId");

-- CreateIndex
CREATE INDEX "producerNodes_producerId_status_idx" ON "producerNodes"("producerId", "status");

-- CreateIndex
CREATE INDEX "producerScores_producerId_time_stamp_idx" ON "producerScores"("producerId", "time_stamp");

-- CreateIndex
CREATE INDEX "producerSocials_producerId_idx" ON "producerSocials"("producerId");

-- CreateIndex
CREATE INDEX "producerTools_producerId_idx" ON "producerTools"("producerId");
