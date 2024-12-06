import { prisma } from '../config/database';
import { config } from '../config/env';
import axios from 'axios';
import { logger_log, logger_error } from '../utils/logger';

const axiosInstance = axios.create({
    timeout: 30000, // 30 seconds
});

// Queries db for proposals
export async function getProposalQuery(
    limit?: number,
    chain: string = 'Mainnet'
) {
    try {
        const whereClause = { chain };

        return await prisma.proposals.findMany({
            where: whereClause,
            orderBy: {
                time_stamp: 'desc'
            },
            take: limit
        });
    } catch (error) {
        logger_error('PROPOSALS', 'Error fetching proposals:', error);
        throw error;
    }
}

// Fetches and processes msig proposals
export async function fetchProposals() {
    const chains = ['Mainnet', 'Testnet'];
    const apiUrls = [config.mainnetApiUrl, config.testnetApiUrl];
    const proposers = [config.mainnetProposer, config.testnetProposer];

    for (let i = 0; i < chains.length; i++) {
        const chain = chains[i];
        const apiUrl = apiUrls[i];
        const proposer = proposers[i];

        try {
            logger_log('PROPOSALS', `Fetching proposals for ${chain} from ${apiUrl}`);
            const response = await axiosInstance.get(`${apiUrl}/v2/state/get_proposals?proposer=${proposer}&executed=true`);

            logger_log('PROPOSALS', `Received ${response.data.proposals.length} proposals for ${chain}. Starting processing...`);

            for (const proposal of response.data.proposals) {
                try {
                    logger_log('PROPOSALS', `Processing proposal ${proposal.proposal_name} for ${chain}`);

                    logger_log('PROPOSALS', `Fetching block info for proposal ${proposal.proposal_name} (block ${proposal.block_num}) on ${chain}`);
                    const blockResponse = await axiosInstance.post(`${apiUrl}/v1/chain/get_block`, {
                        block_num_or_id: proposal.block_num.toString()
                    });

                    const timestamp = new Date(blockResponse.data.timestamp);

                    logger_log('PROPOSALS', `Upserting proposal ${proposal.proposal_name} for ${chain}`);
                    await prisma.proposals.upsert({
                        where: {
                            proposal_name_block_num: {
                                proposal_name: proposal.proposal_name,
                                block_num: proposal.block_num,
                            },
                        },
                        update: {
                            chain,
                            time_stamp: timestamp,
                            requested: proposal.requested_approvals,
                            received: proposal.provided_approvals,
                        },
                        create: {
                            chain,
                            proposal_name: proposal.proposal_name,
                            block_num: proposal.block_num,
                            time_stamp: timestamp,
                            requested: proposal.requested_approvals,
                            received: proposal.provided_approvals,
                        },
                    });

                    logger_log('PROPOSALS', `Successfully upserted proposal ${proposal.proposal_name} for ${chain}`);
                } catch (error) {
                    logger_error('PROPOSALS', `Error processing proposal ${proposal.proposal_name} for ${chain}: `, error);
                }
            }

            logger_log('PROPOSALS', `Completed processing all proposals for ${chain}`);
        } catch (error) {
            logger_error('PROPOSALS', `Catch all error in fetchProposals() for ${chain}: `, error);
        }
    }
    logger_log('PROPOSALS', `Completed updating proposals for all chains.`);
}