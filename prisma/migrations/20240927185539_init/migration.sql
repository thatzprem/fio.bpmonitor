-- CreateIndex
CREATE INDEX "ProducerChainMap_mainnetProducer_idx" ON "ProducerChainMap"("mainnetProducer");

-- CreateIndex
CREATE INDEX "ProducerChainMap_testnetProducer_idx" ON "ProducerChainMap"("testnetProducer");

-- CreateIndex
CREATE INDEX "apiFetchCheck_nodeId_time_stamp_idx" ON "apiFetchCheck"("nodeId", "time_stamp");

-- CreateIndex
CREATE INDEX "apiNodeCheck_nodeId_time_stamp_idx" ON "apiNodeCheck"("nodeId", "time_stamp");

-- CreateIndex
CREATE INDEX "producer_owner_idx" ON "producer"("owner");

-- CreateIndex
CREATE INDEX "producerFeeMultiplier_last_vote_idx" ON "producerFeeMultiplier"("last_vote");

-- CreateIndex
CREATE INDEX "producerNodes_chain_type_status_idx" ON "producerNodes"("chain", "type", "status");

-- CreateIndex
CREATE INDEX "proposals_chain_time_stamp_idx" ON "proposals"("chain", "time_stamp");
