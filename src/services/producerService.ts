import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { config } from '../config/env';
import { formatUrl, urlJoin, processTotalVotes, getFullBaseUrl } from "../utils/helpers";
import { logger_log, logger_error } from '../utils/logger';
import axios from 'axios';

interface Socials {
    [key: string]: string;
}

interface Node {
    type: string;
    [key: string]: any;
}

interface NodesByType {
    producer: Node[];
    query: Node[];
    full: Node[];
    seed: Node[];
    other: Node[];
}

// Queries db for active producers' data
export const getProducersQuery = async (
    limit?: number,
    chain: 'Mainnet' | 'Testnet' = 'Mainnet',
    sortBy: 'total_votes' | 'score' = 'total_votes'
) => {
    const chainValue = chain === 'Mainnet' ? 'Mainnet' : 'Testnet';

    const orderByClause =
        sortBy === 'total_votes'
            ? Prisma.sql`p.total_votes DESC`
            : Prisma.sql`COALESCE(s.score_ratio, 0) DESC`;

    const limitClause = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

    const producers = await prisma.$queryRaw<any[]>(Prisma.sql`
        WITH node_scores AS (
            SELECT
                ns."nodeId",
                json_build_object(
                        'time_stamp', ns.time_stamp,
                        'details', ns.details,
                        'score', ns.score,
                        'max_score', ns.max_score,
                        'grade', ns.grade
                ) AS score_data
            FROM "nodeScores" ns
            WHERE ns.time_stamp = (
                SELECT MAX(time_stamp)
                FROM "nodeScores"
                WHERE "nodeId" = ns."nodeId"
            )
        )
        SELECT
            p.*,
            ed.candidate_name,
            ed.website,
            ed.code_of_conduct,
            ed.email,
            ed.ownership_disclosure,
            ed.location_name,
            ed.location_country,
            ed.location_latitude,
            ed.location_longitude,
            s.time_stamp AS score_time_stamp,
            s.details AS score_details,
            s.score AS score_value,
            s.max_score AS score_max_score,
            s.grade AS score_grade,
            s.score_ratio,
            bv.bundledbvotenumber,
            bv.lastvotetimestamp,
            fm.multiplier AS fee_multiplier,
            fm.last_vote AS fee_multiplier_last_vote,
            -- Aggregate socials
            (
                SELECT json_agg(json_build_object('type', soc.type, 'handle', soc.handle))
                FROM "producerSocials" soc
                WHERE soc."producerId" = p.id
            ) AS socials,
            -- Aggregate nodes with scores
            (
                SELECT json_agg(json_build_object(
                        'type', n.type,
                        'location_name', n.location_name,
                        'location_country', n.location_country,
                        'location_latitude', n.location_latitude,
                        'location_longitude', n.location_longitude,
                        'url', n.url,
                        'api', n.api,
                        'historyV1', n."historyV1",
                        'hyperion', n.hyperion,
                        'server_version', n.server_version,
                        'status', n.status,
                        'score', CASE
                                     WHEN n.api = true THEN ns.score_data
                                     ELSE '[]'::json
                            END
                                ))
                FROM "producerNodes" n
                         LEFT JOIN node_scores ns ON n.id = ns."nodeId"
                WHERE n."producerId" = p.id
            ) AS nodes,
            -- Aggregate branding
            (
                SELECT json_agg(json_build_object('type', b.type, 'url', b.url))
                FROM "producerBranding" b
                WHERE b."producerId" = p.id
            ) AS branding,
            -- Aggregate feeVotes
            (
                SELECT json_agg(json_build_object('end_point', fv.end_point, 'value', fv.value, 'last_vote', fv.last_vote))
                FROM "producerFeeVotes" fv
                WHERE fv."producerId" = p.id
            ) AS fee_votes,
            -- Aggregate tools
            (
                SELECT json_agg(json_build_object('toolName', t."toolName", 'toolUrl', t."toolUrl"))
                FROM "producerTools" t
                WHERE t."producerId" = p.id
            ) AS tools
        FROM "producer" p
                 LEFT JOIN "producerExtendedData" ed ON p.id = ed."producerId"
                 LEFT JOIN LATERAL (
            SELECT *
            FROM "producerScores" s
            WHERE s."producerId" = p.id
            ORDER BY s.time_stamp DESC
                LIMIT 1
    ) s ON true
            LEFT JOIN "producerBundleVotes" bv ON bv."producerId" = p.id
            LEFT JOIN "producerFeeMultiplier" fm ON fm."producerId" = p.id
        WHERE
            p.status = 'active' AND p.chain = ${chainValue}
        ORDER BY ${orderByClause}
                 ${limitClause};
    `);

    // Map the results to the desired structure
    const result = producers.map((producer) => {
        const socials = producer.socials || [];
        const nodes = producer.nodes || [];
        const branding = producer.branding || [];
        const feeVotes = producer.fee_votes || [];
        const tools = producer.tools || [];

        return {
            // Include only the necessary fields
            id: producer.id,
            chain: producer.chain,
            chain_table_id: producer.chain_table_id,
            owner: producer.owner,
            fio_address: producer.fio_address,
            fio_address_valid: producer.fio_address_valid,
            addresshash: producer.addresshash,
            total_votes: Number(producer.total_votes),
            producer_public_key: producer.producer_public_key,
            status: producer.status,
            url: producer.url,
            unpaid_blocks: producer.unpaid_blocks,
            last_claim_time: producer.last_claim_time,
            last_bpclaim: producer.last_bpclaim,
            location: producer.location,
            // Extended Data
            candidate_name: producer.candidate_name,
            website: producer.website,
            code_of_conduct: producer.code_of_conduct,
            email: producer.email,
            ownership_disclosure: producer.ownership_disclosure,
            location_name: producer.location_name,
            location_country: producer.location_country,
            location_latitude: producer.location_latitude,
            location_longitude: producer.location_longitude,
            flagIconUrl: producer.location_country
                ? `${getFullBaseUrl()}/flags/${producer.location_country.toLowerCase()}.svg`
                : null,
            // Socials
            socials: socials.reduce((acc: Socials, social: any) => {
                if (social.type && social.handle) {
                    acc[social.type] = social.handle;
                }
                return acc;
            }, {} as Socials),
            // Nodes
            nodes: nodes.reduce((acc: NodesByType, node: any) => {
                const nodeType = node.type as keyof NodesByType;
                if (!acc[nodeType]) acc[nodeType] = [];
                const nodeWithScore = {
                    ...node,
                    score: node.api ? node.score : []
                };
                acc[nodeType].push(nodeWithScore);
                return acc;
            }, {} as NodesByType),
            // Branding
            branding: branding.reduce((acc: { [key: string]: string }, brand: any) => {
                acc[brand.type] = brand.url;
                return acc;
            }, {}),
            // Score
            score:
                producer.score_value !== null && producer.score_value !== undefined
                    ? {
                        time_stamp: producer.score_time_stamp,
                        details: producer.score_details,
                        score: producer.score_value,
                        max_score: producer.score_max_score,
                        grade: producer.score_grade,
                    }
                    : {
                        time_stamp: new Date().toISOString(),
                        details: {},
                        score: 0,
                        max_score: 0,
                        grade: 'N/A',
                    },
            // Bundle Votes
            bundleVotes:
                producer.bundledbvotenumber !== null && producer.bundledbvotenumber !== undefined
                    ? {
                        bundledbvotenumber: producer.bundledbvotenumber,
                        lastvotetimestamp: producer.lastvotetimestamp,
                    }
                    : {},
            // Fee Multiplier
            feeMultiplier:
                producer.fee_multiplier !== null && producer.fee_multiplier !== undefined
                    ? {
                        multiplier: producer.fee_multiplier,
                        last_vote: producer.fee_multiplier_last_vote,
                    }
                    : {},
            // Fee Votes
            feeVotes: feeVotes.reduce(
                (acc: { [key: string]: { value: string; last_vote: Date } }, vote: any) => {
                    acc[vote.end_point] = {
                        value: vote.value.toString(),
                        last_vote: vote.last_vote,
                    };
                    return acc;
                },
                {}
            ),
            // Tools
            tools: tools.reduce((acc: { [key: string]: string }, tool: any) => {
                acc[tool.toolName] = tool.toolUrl;
                return acc;
            }, {}),
        };
    });

    return result;
};

// Fetches producers for Mainnet and Testnet
export async function fetchProducers() {
    try {
        const chains = ['Mainnet', 'Testnet'];
        const apiUrls = [config.mainnetApiUrl, config.testnetApiUrl];
        const existingProducerIdsByChain: { [chain: string]: Set<number> } = {
            Mainnet: new Set<number>(),
            Testnet: new Set<number>(),
        };

        for (let i = 0; i < chains.length; i++) {
            const chain = chains[i];
            const apiUrl = apiUrls[i];

            logger_log('PRODUCERS',`Fetching producers for ${chain} from ${apiUrl}`);
            const response = await axios.post(`${apiUrl}/v1/chain/get_producers`, { limit: 1000 });
            logger_log('PRODUCERS',`Received ${response.data.producers.length} producers for ${chain}. Updating db...`);

            // Update database
            for (const producer of response.data.producers) {
                const chain_table_id = producer.id;
                existingProducerIdsByChain[chain].add(chain_table_id);
                producer.url = formatUrl(producer.url);
                const { id, is_active, total_votes, ...producerData } = producer;
                const status = is_active === 1 ? 'active' : 'inactive';
                const processedVotes = processTotalVotes(producer.total_votes);

                // Check FIO address validity
                let fio_address_valid = true;
                try {
                    const availCheckResponse = await axios.post(`${apiUrl}/v1/chain/avail_check`, {
                        fio_name: producer.fio_address
                    });
                    fio_address_valid = availCheckResponse.data.is_registered === 1;
                } catch (error) {
                    logger_error('PRODUCERS', `Error checking FIO address validity for ${chain} producer ${chain_table_id}:`, error);
                }

                const existingProducer = await prisma.producer.findUnique({
                    where: {
                        chain_chain_table_id: {
                            chain,
                            chain_table_id,
                        },
                    },
                });

                await prisma.producer.upsert({
                    where: {
                        chain_chain_table_id: {
                            chain,
                            chain_table_id,
                        },
                    },
                    update: {
                        ...producerData,
                        total_votes: processedVotes,
                        status,
                        last_claim_time: new Date(producer.last_claim_time),
                        fio_address_valid,
                    },
                    create: {
                        ...producerData,
                        total_votes: processedVotes,
                        status,
                        last_claim_time: new Date(producer.last_claim_time),
                        chain,
                        chain_table_id,
                        fio_address_valid
                    },
                });

                // If the producer status changed to inactive, update their nodes
                if (existingProducer && existingProducer.status === 'active' && status === 'inactive') {
                    await prisma.producerNodes.updateMany({
                        where: { producerId: existingProducer.id },
                        data: { status: 'inactive' }
                    });
                }

                logger_log('PRODUCERS',`Upserted producer ${chain_table_id} for ${chain}.`);
            }
        }

        // Update status to 'removed' for producers not returned in the API responses
        for (const chain of chains) {
            logger_log('PRODUCERS',`Updating status to 'removed' for producers not returned for ${chain}.`);
            const producersToRemove = await prisma.producer.findMany({
                where: {
                    chain: chain,
                    chain_table_id: { notIn: Array.from(existingProducerIdsByChain[chain]) },
                    status: { not: 'removed' }
                }
            });

            for (const producer of producersToRemove) {
                await prisma.producer.update({
                    where: { id: producer.id },
                    data: { status: 'removed' }
                });

                // Set all nodes of this producer to 'removed'
                await prisma.producerNodes.updateMany({
                    where: { producerId: producer.id },
                    data: { status: 'removed' }
                });
            }
        }
    } catch (error) {
        logger_error('PRODUCERS','Catch all error in fetchProducers() ', error);
    }
    logger_log('PRODUCERS',`Done updating with producer list.`);
}

// Fetches chains.json for all active producers from db and determines bp.json to query
export async function fetchBpJson() {
    logger_log('PRODUCERS',`Starting fetching bp.json...`);
    try {
        const activeProducers = await prisma.producer.findMany({
            where: {status: 'active' }
        });

        for (const producer of activeProducers) {
            let url = producer.url;

            if (!url) {
                logger_log('PRODUCERS',`Skipping ${producer.chain} producer ${producer.id} with empty URL.`);
                continue;
            }

            url = formatUrl(url);
            let chainsJsonFound = false;

            try {
                logger_log('PRODUCERS',`Fetching chains.json for ${producer.chain} producer ${producer.id} from ${url}`);
                const chainsResponse = await axios.get(urlJoin(url, `chains.json`), { timeout: config.json_fetch_timeout });
                const chains = chainsResponse.data.chains;
                chainsJsonFound = true;

                if (chains) {
                    const chainId = producer.chain === 'Mainnet' ? config.mainnetChainId : config.testnetChainId;
                    if (chains[chainId]) {
                        await processBpJson(producer.id, urlJoin(url, chains[chainId]), producer.chain);
                    } else {
                        logger_log('PRODUCERS',`Chain ID not found in chains.json for ${producer.chain} producer ${producer.id}.`);
                    }
                } else {
                    logger_log('PRODUCERS',`Invalid chains.json for ${producer.chain} producer ${producer.id}.`);
                }
            } catch {
                logger_log('PRODUCERS',`Unable to fetch chains.json for ${producer.chain} producer ${producer.id}.`);
            }

            if (!chainsJsonFound) {
                logger_log('PRODUCERS',`${producer.chain} producer ${producer.id} has no chains.json. Trying bp.json at ${url}`);
                try {
                    await processBpJson(producer.id, urlJoin(url, `bp.json`), producer.chain);
                } catch {
                    logger_log('PRODUCERS',`Unable to fetch bp.json for ${producer.chain} producer ${producer.id}.`);
                }
            }
        }
    } catch (error) {
        logger_error('PRODUCERS','Catch all error in fetchBpJson() ', error);
    }
    logger_log('PRODUCERS',`Done with bp.json`);
}

// Fetches and processes individual bp.json
async function processBpJson(
    producerId: number,
    bpJsonUrl: string,
    chain: string
) {
    try {
        logger_log('PRODUCERS', `Fetching bp.json for ${chain} producer ${producerId} from ${bpJsonUrl}`);
        const bpResponse = await axios.get(bpJsonUrl, { timeout: config.json_fetch_timeout });
        const bpData = bpResponse.data;

        if (bpData && typeof bpData === 'object' && bpData.org && typeof bpData.org === 'object') {
            logger_log('PRODUCERS', `Got bp.json for ${chain} producer ${producerId}. Updating db...`);

            // Check for required fields
            if (!bpData.org.candidate_name || !bpData.org.location) {
                logger_log('PRODUCERS', `Invalid bp.json structure for ${chain} producer ${producerId}. Missing required fields.`);
                return;
            }

            // Insert into ProducerExtendedData
            await prisma.producerExtendedData.upsert({
                where: { producerId },
                update: {
                    candidate_name: bpData.org.candidate_name,
                    website: formatUrl(bpData.org.website || ''),
                    code_of_conduct: formatUrl(bpData.org.code_of_conduct || ''),
                    email: bpData.org.email || '',
                    ownership_disclosure: formatUrl(bpData.org.ownership_disclosure || ''),
                    location_name: bpData.org.location.name || '',
                    location_country: bpData.org.location.country || '',
                    location_latitude: bpData.org.location.latitude || 0,
                    location_longitude: bpData.org.location.longitude || 0,
                },
                create: {
                    producerId,
                    candidate_name: bpData.org.candidate_name,
                    website: formatUrl(bpData.org.website || ''),
                    code_of_conduct: formatUrl(bpData.org.code_of_conduct || ''),
                    email: bpData.org.email || '',
                    ownership_disclosure: formatUrl(bpData.org.ownership_disclosure || ''),
                    location_name: bpData.org.location.name || '',
                    location_country: bpData.org.location.country || '',
                    location_latitude: bpData.org.location.latitude || 0,
                    location_longitude: bpData.org.location.longitude || 0,
                },
            });

            // Process socials
            const existingSocials = await prisma.producerSocials.findMany({ where: { producerId } });
            const existingSocialTypes = new Set(existingSocials.map(social => social.type));

            if (bpData.org.social && typeof bpData.org.social === 'object') {
                const socialKeys = Object.keys(bpData.org.social);
                for (const key of socialKeys) {
                    if (bpData.org.social[key]) {
                        await prisma.producerSocials.upsert({
                            where: {
                                producerId_type: {
                                    producerId,
                                    type: key,
                                },
                            },
                            update: {
                                handle: bpData.org.social[key],
                            },
                            create: {
                                producerId,
                                type: key,
                                handle: bpData.org.social[key],
                            },
                        });
                        existingSocialTypes.delete(key);
                    }
                }
            }

            // Remove socials not present in bp.json
            if (existingSocialTypes.size > 0) {
                await prisma.producerSocials.deleteMany({
                    where: {
                        producerId,
                        type: { in: Array.from(existingSocialTypes) },
                    },
                });
            }

            // Process nodes
            const existingNodes = await prisma.producerNodes.findMany({ where: { producerId } });
            const existingNodeUrls = new Set(existingNodes.map(node => node.url));
            const updatedNodeUrls = new Set();

            if (Array.isArray(bpData.nodes)) {
                for (const node of bpData.nodes) {
                    let nodeTypes: string[] = Array.isArray(node.node_type) ? node.node_type : [node.node_type];

                    for (const type of nodeTypes) {
                        const api = type === 'query' || type === 'full';
                        const historyV1 = api && node.features?.includes('history-v1') || false;
                        const hyperion = api && node.features?.includes('hyperion-v2') || false;

                        let nodeUrl = '';
                        if (type === 'seed') {
                            nodeUrl = node.p2p_endpoint || node.ssl_endpoint || node.api_endpoint || '';
                        } else {
                            nodeUrl = node.ssl_endpoint || node.api_endpoint || '';
                        }

                        if (api) {
                            nodeUrl = formatUrl(nodeUrl);
                        }

                        if (type !== 'producer' && !nodeUrl) {
                            logger_log('PRODUCERS', `Skipping node of type ${type} with missing URL for producer ${producerId}.`);
                            continue;
                        }

                        updatedNodeUrls.add(nodeUrl);

                        const existingNode = await prisma.producerNodes.findFirst({
                            where: {
                                producerId,
                                type,
                                url: nodeUrl
                            }
                        });

                        const nodeData = {
                            location_name: node.location?.name || '',
                            location_country: node.location?.country || '',
                            location_latitude: node.location?.latitude || 0,
                            location_longitude: node.location?.longitude || 0,
                            chain,
                            api,
                            historyV1,
                            hyperion,
                            server_version: node.server_version || '',
                            status: 'active'
                        };

                        if (existingNode) {
                            // Update existing node
                            logger_log('PRODUCERS', `Updating existing node ${existingNode.id} for producer ${producerId}.`);
                            await prisma.producerNodes.update({
                                where: { id: existingNode.id },
                                data: nodeData
                            });
                        } else {
                            // Create new node
                            logger_log('PRODUCERS', `Inserting new node for producer ${producerId}.`);
                            await prisma.producerNodes.create({
                                data: {
                                    producerId,
                                    type,
                                    url: nodeUrl,
                                    ...nodeData
                                }
                            });
                        }
                    }
                }
            }

            // Set nodes not present in bp.json to removed
            const nodesToRemove = Array.from(existingNodeUrls).filter(url => !updatedNodeUrls.has(url));
            if (nodesToRemove.length > 0) {
                logger_log('PRODUCERS', `Setting ${nodesToRemove.length} nodes to removed for producer ${producerId}.`);
                await prisma.producerNodes.updateMany({
                    where: {
                        producerId,
                        url: { in: nodesToRemove }
                    },
                    data: { status: 'removed' }
                });
            }

            // Process branding
            const existingBranding = await prisma.producerBranding.findMany({ where: { producerId } });
            const existingBrandingTypes = new Set(existingBranding.map(branding => branding.type));

            if (bpData.org.branding && typeof bpData.org.branding === 'object') {
                const brandingTypes = ['logo_256', 'logo_1024', 'logo_svg'];
                for (const type of brandingTypes) {
                    if (bpData.org.branding[type]) {
                        try {
                            // Verify image before inserting
                            const imageResponse = await axios.get(bpData.org.branding[type], {
                                timeout: 5000,
                                responseType: 'arraybuffer'
                            });

                            if (imageResponse.status === 200) {
                                await prisma.producerBranding.upsert({
                                    where: {
                                        producerId_type: {
                                            producerId,
                                            type,
                                        },
                                    },
                                    update: {
                                        url: bpData.org.branding[type],
                                    },
                                    create: {
                                        producerId,
                                        type,
                                        url: bpData.org.branding[type],
                                    },
                                });
                                existingBrandingTypes.delete(type);
                                logger_log('PRODUCERS', `Successfully processed branding asset for ${chain} producer ${producerId}, type ${type}`);
                            } else {
                                logger_log('PRODUCERS', `Failed to verify branding asset for ${chain} producer ${producerId}, type ${type}: ${imageResponse.status}`);
                            }
                        } catch (error) {
                            if (axios.isAxiosError(error)) {
                                if (error.response) {
                                    logger_log('PRODUCERS', `Failed to fetch branding asset for ${chain} producer ${producerId}, type ${type}. Status: ${error.response.status}`);
                                } else if (error.request) {
                                    logger_log('PRODUCERS', `Failed to fetch branding asset for ${chain} producer ${producerId}, type ${type}. No response received.`);
                                } else {
                                    logger_log('PRODUCERS', `Failed to fetch branding asset for ${chain} producer ${producerId}, type ${type}. Error: ${error.message}`);
                                }
                            } else {
                                logger_error('PRODUCERS', `Unexpected error verifying branding asset for ${chain} producer ${producerId}, type ${type}`, error);
                            }
                        }
                    }
                }
            }

            // Remove branding not present in bp.json
            if (existingBrandingTypes.size > 0) {
                await prisma.producerBranding.deleteMany({
                    where: {
                        producerId,
                        type: { in: Array.from(existingBrandingTypes) },
                    },
                });
                logger_log('PRODUCERS', `Removed ${existingBrandingTypes.size} outdated branding entries for ${chain} producer ${producerId}`);
            }
        } else {
            logger_log('PRODUCERS', `Invalid or empty bp.json received for ${chain} producer ${producerId} from url: ${bpJsonUrl}`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                logger_log('PRODUCERS', `Failed to fetch bp.json for ${chain} producer ${producerId} from url: ${bpJsonUrl}. Status: ${error.response.status}`);
            } else if (error.request) {
                logger_log('PRODUCERS', `Failed to fetch bp.json for ${chain} producer ${producerId} from url: ${bpJsonUrl}. No response received.`);
            } else {
                logger_log('PRODUCERS', `Failed to fetch bp.json for ${chain} producer ${producerId} from url: ${bpJsonUrl}. Error: ${error.message}`);
            }
        } else {
            logger_log('PRODUCERS', `Error processing bp.json for ${chain} producer ${producerId} from url: ${bpJsonUrl}. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
