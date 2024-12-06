import { prisma } from '../config/database';
import { config } from '../config/env';
import { logger_log, logger_error } from '../utils/logger';
import axios from 'axios';

// Queries db for producers' fee votes
export async function getFeesQuery(
    chainValue: 'mainnet' | 'testnet' = 'mainnet',
    type: 'by_producer' | 'by_fee' = 'by_fee'
) {
    const chain = chainValue === 'mainnet' ? 'Mainnet' : 'Testnet';

    const producers = await prisma.producer.findMany({
        where: { chain },
        include: {
            feeMultiplier: true,
            feeVotes: true
        }
    });

    if (type === 'by_producer') {
        return producers.map(producer => ({
            producer: producer.owner,
            multiplier: producer.feeMultiplier?.multiplier,
            last_vote: producer.feeMultiplier?.last_vote,
            fees: producer.feeVotes.map(vote => ({
                end_point: vote.end_point,
                value: Number(vote.value) * (producer.feeMultiplier?.multiplier || 1) / 1000000000,
                last_vote: vote.last_vote
            }))
        }));
    } else {
        const feesByEndpoint: { [key: string]: any[] } = {};
        for (const producer of producers) {
            for (const vote of producer.feeVotes) {
                if (!feesByEndpoint[vote.end_point]) {
                    feesByEndpoint[vote.end_point] = [];
                }
                feesByEndpoint[vote.end_point].push({
                    producer: producer.owner,
                    value: Number(vote.value) * (producer.feeMultiplier?.multiplier || 1) / 1000000000,
                    last_vote: vote.last_vote
                });
            }
        }
        return Object.entries(feesByEndpoint).map(([end_point, votes]) => ({
            end_point,
            votes
        }));
    }
}

// Triggers Fee and Multiplier votes fetch and processing for Mainnet and Testnet
export async function triggerFeeMultiplierFetch() {
    try {
        const chains = ['Mainnet', 'Testnet'];
        const apiUrls = [config.mainnetApiUrl, config.testnetApiUrl];

        for (let i = 0; i < chains.length; i++) {
            const chain = chains[i];
            const apiUrl = apiUrls[i];

            await fetchFeeMultiplierVotes(chain, apiUrl);
            await fetchFeeVotes(chain, apiUrl);
        }
    } catch (error) {
        logger_error('FEES', 'Catch all error in triggerFeeMultiplierFetch() ', error);
    }
    logger_log('FEES', 'Done updating fees.');
}

// Fetches Multiplier votes
async function fetchFeeMultiplierVotes(chain: string, apiUrl: string) {
    try {
        logger_log('FEES', `Fetching fee multipliers for ${chain} from ${apiUrl}`);
        const response = await axios.post(`${apiUrl}/v1/chain/get_table_rows`, {
            json: true,
            code: "fio.fee",
            scope: "fio.fee",
            table: "feevoters",
            limit: "5000"
        });

        const returnedProducerIds = new Set<number>();

        for (const row of response.data.rows) {
            const producer = await prisma.producer.findFirst({
                where: { owner: row.block_producer_name, chain }
            });

            if (producer) {
                returnedProducerIds.add(producer.id);
                await prisma.producerFeeMultiplier.upsert({
                    where: { producerId: producer.id },
                    update: {
                        multiplier: parseFloat(row.fee_multiplier),
                        last_vote: new Date(row.lastvotetimestamp * 1000)
                    },
                    create: {
                        producerId: producer.id,
                        multiplier: parseFloat(row.fee_multiplier),
                        last_vote: new Date(row.lastvotetimestamp * 1000)
                    }
                });
            }
        }

        // Remove multipliers for producers not returned by the API
        await prisma.producerFeeMultiplier.deleteMany({
            where: {
                producer: {
                    chain: chain
                },
                producerId: {
                    notIn: Array.from(returnedProducerIds)
                }
            }
        });

    } catch (error) {
        logger_error('FEES', `Catch all error in fetchFeeMultiplierVotes() for ${chain}: `, error);
    }
}

// Fetching Fee votes
async function fetchFeeVotes(chain: string, apiUrl: string) {
    try {
        logger_log('FEES', `Fetching fee votes for ${chain} from ${apiUrl}`);
        const response = await axios.post(`${apiUrl}/v1/chain/get_table_rows`, {
            json: true,
            code: "fio.fee",
            scope: "fio.fee",
            table: "feevotes2",
            limit: "5000"
        });

        const returnedVotes = new Set<string>();

        for (const row of response.data.rows) {
            const producer = await prisma.producer.findFirst({
                where: { owner: row.block_producer_name, chain }
            });

            if (producer) {
                for (const vote of row.feevotes) {
                    // Skip if end_point is empty
                    if (!vote.end_point) {
                        continue;
                    }

                    returnedVotes.add(`${producer.id}:${vote.end_point}`);

                    await prisma.producerFeeVotes.upsert({
                        where: {
                            producerId_end_point: {
                                producerId: producer.id,
                                end_point: vote.end_point
                            }
                        },
                        update: {
                            value: BigInt(vote.value),
                            last_vote: new Date(vote.timestamp * 1000)
                        },
                        create: {
                            producerId: producer.id,
                            end_point: vote.end_point,
                            value: BigInt(vote.value),
                            last_vote: new Date(vote.timestamp * 1000)
                        }
                    });
                }
            }
        }

        // Remove votes not returned by the API
        const allVotes = await prisma.producerFeeVotes.findMany({
            where: {
                producer: {
                    chain: chain
                }
            },
            select: {
                producerId: true,
                end_point: true
            }
        });

        const votesToDelete = allVotes.filter(vote => !returnedVotes.has(`${vote.producerId}:${vote.end_point}`));

        for (const vote of votesToDelete) {
            await prisma.producerFeeVotes.delete({
                where: {
                    producerId_end_point: {
                        producerId: vote.producerId,
                        end_point: vote.end_point
                    }
                }
            });
        }

    } catch (error) {
        logger_error('FEES', `Catch all error in fetchFeeVotes() for ${chain}: `, error);
    }
}