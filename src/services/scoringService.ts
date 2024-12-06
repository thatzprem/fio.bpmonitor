import {prisma} from '../config/database';
import {config} from '../config/env';
import axios from 'axios';
import { logger_error, logger_log } from '../utils/logger';

interface ScoringCriteria {
    [key: string]: number;
}

interface GradeChart {
    [key: string]: [number, number];
}

// Queries db for producer scores
export async function getScoresQuery(
    producerId: number,
    limit: number = 7
) {
    try {
        return await prisma.producerScores.findMany({
            where: {
                producerId: producerId
            },
            orderBy: {
                time_stamp: 'desc'
            },
            take: limit
        });
    } catch (error) {
        logger_error('SCORING', 'Error fetching producer scores:', error);
        throw error;
    }
}

// Calculates score for each producer
export async function calculateProducerScores() {
    try {
        const producers = await prisma.producer.findMany({
            where: { status: 'active' },
            include: {
                extendedData: true,
                nodes: {
                    include: {
                        nodeScores: {
                            orderBy: {
                                time_stamp: 'desc'
                            },
                            take: 1
                        }
                    }
                },
                feeMultiplier: true,
                feeVotes: true,
                bundleVotes: true,
                tools: true,
            },
        });

        const scoringCriteria: ScoringCriteria = config.producerScoringCriteria;
        const mainnetScoringCriteria: ScoringCriteria = config.mainnetScoringCriteria;
        const producerScoringPenalties = config.producerScoringPenalties;

        const producersByChain: { [key: string]: typeof producers } = {};
        producers.forEach(producer => {
            if (!producersByChain[producer.chain]) {
                producersByChain[producer.chain] = [];
            }
            producersByChain[producer.chain].push(producer);
        });

        for (const [chain, chainProducers] of Object.entries(producersByChain)) {
            let blockReliabilityData;
            try {
                blockReliabilityData = await fetchBlockReliabilityData(chain);
            } catch (error) {
                logger_error('SCORING', `Error fetching block reliability data for ${chain}:`, error);
                blockReliabilityData = null;
            }
            for (const producer of chainProducers) {
                try {
                    const blockReliability = blockReliabilityData?.prods?.find(
                        (prod: any) => prod.account === producer.owner
                    ) || null;
                    const score = await calculateProducerScore(
                        producer,
                        scoringCriteria,
                        mainnetScoringCriteria,
                        producerScoringPenalties,
                        blockReliability
                    );
                    await saveProducerScore(producer.id, score);
                } catch (error) {
                    logger_error('SCORING', `Error calculating score for producer ${producer.id}:`, error);
                }
            }
        }

        logger_log('SCORING', 'Producer scores calculated and saved successfully');
    } catch (error) {
        logger_error('SCORING', 'Catch all error in calculateProducerScores() ', error);
    }
}

// Calculates score for a single producer
async function calculateProducerScore(
    producer: any,
    scoringCriteria: ScoringCriteria,
    mainnetScoringCriteria: ScoringCriteria,
    producerScoringPenalties: ScoringCriteria,
    blockReliability: any | null
) {
    const details: { [key: string]: { status: boolean; score: number } } = {
        has_bp_json: {
            status: !!producer.extendedData,
            score: 0
        },
        reports_producer_node: {
            status: producer.nodes?.some((node: any) => node.type === 'producer') ?? false,
            score: 0
        },
        reports_seed_node: {
            status: producer.nodes?.some((node: any) => node.type === 'seed') ?? false,
            score: 0
        },
        reports_api_node: {
            status: producer.nodes?.some((node: any) => node.api === true) ?? false,
            score: 0
        },
        runs_api_node: {
            status: producer.nodes?.some((node: any) => node.api && node.status === 'active') ?? false,
            score: 0
        },
        api_node_score: {
            status: producer.nodes?.some((node: any) => node.api && node.status === 'active') ?? false,
            score: await calculateAvgNodeScore(producer.nodes, scoringCriteria['api_node_score'])
        },
        fee_votes: {
            status: !!(producer.feeMultiplier && producer.feeVotes && producer.feeVotes.length > 0),
            score: 0
        },
        fee_voted_recently: {
            status: checkRecentFeeVote(producer),
            score: 0
        },
        bundle_votes: {
            status: !!producer.bundleVotes,
            score: 0
        },
        runs_tools: {
            status: !!(producer.tools && producer.tools.length > 0),
            score: 0
        },
        valid_fio_address: {
            status: producer.fio_address_valid,
            score: producer.fio_address_valid ? 0 : producerScoringPenalties.valid_fio_address
        },
        no_missing_blocks: {
            status: true,
            score: 0
        },
    };

    let totalScore = 0;
    let maxScore = 0;

    // Calculate max_score and totalScore, exclude misg for now
    for (const [key, value] of Object.entries(scoringCriteria)) {
        if (key !== 'signs_msigs' && key !== 'signs_msigs_quickly') {
            maxScore += value;
            if (details[key].status) {
                details[key].score = key === 'api_node_score' ? details[key].score : value;
                totalScore += details[key].score;
            }
        }
    }

    // For Mainnet producers add participatesInTestnet
    if (producer.chain === 'Mainnet') {
        const testnetProducer = await getTestnetProducer(producer.owner);
        let participatesInTestnet = false;
        let participationScore = 0;

        if (testnetProducer) {
            const testnetScore = await getTestnetProducerScore(testnetProducer);
            participatesInTestnet = testnetScore > 0;
            const testnetScorePercentage = testnetScore / maxScore;
            participationScore = Math.round(testnetScorePercentage * mainnetScoringCriteria.participates_in_testnet);
        }

        details['participates_in_testnet'] = {
            status: participatesInTestnet,
            score: participationScore
        };

        for (const [key, value] of Object.entries(mainnetScoringCriteria)) {
            maxScore += value;
            if (details[key] && details[key].status) {
                totalScore += details[key].score;
            }
        }
    }

    // Check msig signing
    const msigResults = await checkSignsMsigs(producer).catch((error) => {
        logger_error('SCORING', `Error checking MSIGs for producer ${producer.owner}:`, error);
        return { signedPercentage: null, signedQuicklyPercentage: null };
    });

    if (msigResults.signedPercentage !== null) {
        maxScore += scoringCriteria['signs_msigs'];
        maxScore += scoringCriteria['signs_msigs_quickly'];

        const signsScore = Math.round(scoringCriteria['signs_msigs'] * (msigResults.signedPercentage / 100));
        const signsQuicklyScore = Math.round(scoringCriteria['signs_msigs_quickly'] * (msigResults.signedQuicklyPercentage / 100));

        details['signs_msigs'] = {
            status: signsScore > 0,
            score: signsScore
        };
        details['signs_msigs_quickly'] = {
            status: signsQuicklyScore > 0,
            score: signsQuicklyScore
        };

        totalScore += signsScore + signsQuicklyScore;
    }

    // Calculate no_missing_blocks score. At less than 95% full penalty is applied.
    if (blockReliability && typeof blockReliability.blocks_percent === 'number') {
        const blocksPercent = blockReliability.blocks_percent;
        if (blocksPercent < 100) {
            details.no_missing_blocks.status = false;
            const penaltyValue = Math.abs(producerScoringPenalties.no_missing_blocks);
            const integerPercent = Math.floor(blocksPercent * 100000);
            if (integerPercent <= 9500000) {  // 95.00000%
                details.no_missing_blocks.score = -penaltyValue;
            } else {
                const difference = 10000000 - integerPercent;
                const scaledPenalty = Math.ceil(difference * 2 / 10000);
                details.no_missing_blocks.score = -Math.min(penaltyValue, scaledPenalty);
            }
        }
    }

    // Apply penalties
    totalScore += details.valid_fio_address.score;
    totalScore += details.no_missing_blocks.score;

    // Ensure the total score is not negative
    totalScore = Math.max(0, totalScore);

    // Calculate final grade
    const grade = calculateGrade(totalScore, maxScore);

    return { details, score: totalScore, max_score: maxScore, grade };
}

// Calculates score for each node
export async function calculateNodeScores() {
    try {
        const nodeScoringCriteria: ScoringCriteria = config.nodeScoringCriteria;
        const resultPercentiles = config.resultPercentiles;

        const latestVersion = await getLatestVersionFromGithub();

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Modified query to include the max results for each node
        const nodes = await prisma.producerNodes.findMany({
            where: {
                status: 'active',
                api: true
            },
            include: {
                producer: true,
                apiFetchChecks: {
                    where: {
                        time_stamp: { gte: sevenDaysAgo }
                    },
                    orderBy: {
                        results: 'desc'
                    },
                    take: 1
                }
            }
        });

        // Process the results to get the highest result for each chain
        const highestResultsByChain = new Map<string, number>();
        nodes.forEach(node => {
            const chain = node.chain;
            const nodeResult = node.apiFetchChecks[0]?.results || 0;
            const currentMax = highestResultsByChain.get(chain) || 0;
            highestResultsByChain.set(chain, Math.max(currentMax, nodeResult));
        });

        for (const node of nodes) {
            try {
                const highestResult = highestResultsByChain.get(node.chain) || 0;
                const nodeResults = node.apiFetchChecks[0]?.results || null;
                const score = await calculateNodeScore(node, nodeScoringCriteria, resultPercentiles, latestVersion, highestResult, nodeResults);
                await saveNodeScore(node.id, score);
            } catch (error) {
                logger_error('SCORING', `Error calculating score for node ${node.id}:`, error);
            }
        }

        logger_log('SCORING', 'Node scores calculated and saved successfully');
    } catch (error) {
        logger_error('SCORING', 'Catch all error in calculateNodeScores() ', error);
    }
}

// Calculates score for a single node
async function calculateNodeScore(
    node: any,
    scoringCriteria: ScoringCriteria,
    resultPercentiles: any,
    latestVersion: string,
    highestResult: number,
    nodeResults: number | null
) {
    const details: { [key: string]: { status: boolean; score: number } } = {
        reports_latest_version: {
            status: checkLatestVersion([node], latestVersion),
            score: 0
        },
        runs_history_node: {
            status: node.historyV1,
            score: 0
        },
        runs_hyperion_node: {
            status: node.hyperion,
            score: 0
        },
        results_a: {
            status: false,
            score: 0
        },
        results_b: {
            status: false,
            score: 0
        },
        results_c: {
            status: false,
            score: 0
        },
        no_recent_outage: {
            status: await checkNoRecentOutage(node.id),
            score: 0
        }
    };

    // Check results percentiles
    if (nodeResults !== null) {
        details.results_a.status = checkResultsPercentile(nodeResults, highestResult, resultPercentiles.results_a);
        details.results_b.status = checkResultsPercentile(nodeResults, highestResult, resultPercentiles.results_b);
        details.results_c.status = checkResultsPercentile(nodeResults, highestResult, resultPercentiles.results_c);
    }

    let totalScore = 0;
    let maxScore = 0;

    // Calculate score for all criteria
    for (const [key, value] of Object.entries(scoringCriteria)) {
        maxScore += value;
        if (details[key] && details[key].status) {
            details[key].score = value;
            totalScore += value;
        }
    }

    const grade = calculateGrade(totalScore, maxScore);

    return { details, score: totalScore, max_score: maxScore, grade };
}

// Calculate the average node score for all producer nodes
async function calculateAvgNodeScore(
    nodes: any[],
    maxScore: number
): Promise<number> {
    const apiNodes = nodes.filter(node => node.api && node.status === 'active');

    if (apiNodes.length === 0) {
        return 0;
    }

    let totalScore = 0;
    let totalMaxScore = 0;

    for (const node of apiNodes) {
        if (node.nodeScores && node.nodeScores.length > 0) {
            totalScore += node.nodeScores[0].score;
            totalMaxScore += node.nodeScores[0].max_score;
        }
    }

    const averageScore = totalMaxScore > 0 ? (totalScore / totalMaxScore) : 0;
    return Math.round(averageScore * maxScore);
}

// Check for recent node outages
async function checkNoRecentOutage(nodeId: number): Promise<boolean> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const totalEntries = await prisma.apiNodeCheck.count({
        where: {
            nodeId: nodeId,
            time_stamp: { gte: sevenDaysAgo },
        }
    });

    const entriesWith200Status = await prisma.apiNodeCheck.count({
        where: {
            nodeId: nodeId,
            time_stamp: { gte: sevenDaysAgo },
            status: 200
        }
    });

    return totalEntries === entriesWith200Status;
}

// Determines if results returned by node fall within prescribed percentile
function checkResultsPercentile(
    nodeResults: number,
    highestResult: number,
    percentile: number
): boolean {
    if (highestResult === 0) return false;
    const percentileValue = highestResult * (percentile / 100);
    return nodeResults >= percentileValue;
}

// Calculates grade
function calculateGrade(
    score: number,
    maxScore: number
): string {
    if (maxScore === 0) return 'F';

    const percentage = Math.round((score / maxScore) * 100);  // Round to nearest integer
    const gradeChart: GradeChart = config.gradeChart;

    // Sort grade ranges from highest to lowest
    const sortedGrades = Object.entries(gradeChart).sort((a, b) => b[1][0] - a[1][0]);

    for (const [grade, [min, max]] of sortedGrades) {
        if (percentage >= min && percentage <= max) {
            return grade;
        }
    }

    return 'F';  // Default grade if no range matches
}

// Fetch latest API version
export async function getLatestVersionFromGithub(): Promise<string> {
    const { owner, repo, apiUrl } = config.github_api_version;
    const url = `${apiUrl}/repos/${owner}/${repo}/releases/latest`;

    try {
        const response = await axios.get(url, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        const latestRelease = response.data;
        const versionMatch = latestRelease.tag_name.match(/v?(\d+\.\d+\.\d+)/);
        if (versionMatch) {
            return versionMatch[1];
        }
        throw new Error('Unable to parse version number from GitHub release');
    } catch (error) {
        logger_error('SCORING', 'Error fetching latest version from GitHub:', error);
        throw error;
    }
}

// Check for latest version of API node
export function checkLatestVersion(
    nodes: any[],
    latestVersion: string
): boolean {
    const validVersions = nodes
        .map(node => {
            const match = node.server_version.match(/v?(\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
        })
        .filter((version): version is string => version !== null);

    if (validVersions.length === 0) {
        return false;
    }

    return validVersions.some(version => compareVersions(version, latestVersion) >= 0);
}

// Determines the latest version of API node
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    const maxLength = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLength; i++) {
        const partA = partsA[i] || 0;
        const partB = partsB[i] || 0;

        if (partA > partB) return 1;
        if (partA < partB) return -1;
    }

    return 0;
}

// Determines if producer has recent votes on fees
function checkRecentFeeVote(producer: any) {
    if (!producer.feeMultiplier || producer.feeVotes.length === 0) return false;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMultiplierVote = producer.feeMultiplier.last_vote > thirtyDaysAgo;
    const recentFeeVote = producer.feeVotes.some((vote: any) => vote.last_vote > thirtyDaysAgo);

    return recentMultiplierVote || recentFeeVote;
}

// Determines if producer signed msigs and if they signed quickly
async function checkSignsMsigs(producer: any) {
    const evaluateMsigsCount = config.evaluate_msigs_count;
    const evaluateMsigsTime = config.evaluate_msigs_time;

    logger_log('SCORING', `Checking MSIGs for producer ${producer.owner}`);

    const recentProposals = await prisma.proposals.findMany({
        where: {
            chain: producer.chain
        },
        orderBy: { time_stamp: 'desc' },
        take: evaluateMsigsCount,
    });

    let totalInvolved = 0;
    let signedCount = 0;
    let signedQuicklyCount = 0;

    for (const proposal of recentProposals) {
        let requestedActors: any[] = [];
        let receivedActors: any[] = [];

        try {
            if (typeof proposal.requested === 'string') {
                requestedActors = JSON.parse(proposal.requested);
            } else if (Array.isArray(proposal.requested)) {
                requestedActors = proposal.requested;
            }

            if (typeof proposal.received === 'string') {
                receivedActors = JSON.parse(proposal.received);
            } else if (Array.isArray(proposal.received)) {
                receivedActors = proposal.received;
            }
        } catch (error) {
            logger_error('SCORING', `Error parsing proposal`, error);
            continue;  // Skip this proposal
        }

        const wasRequested = requestedActors.some(item => item && typeof item === 'object' && item.actor === producer.owner);
        const producerSignature = receivedActors.find(item => item && typeof item === 'object' && item.actor === producer.owner);

        if (wasRequested || producerSignature) {
            totalInvolved++;

            if (producerSignature) {
                signedCount++;

                if (producerSignature.time) {
                    const proposalTime = new Date(proposal.time_stamp);
                    const signTime = new Date(producerSignature.time);
                    const daysDifference = (signTime.getTime() - proposalTime.getTime()) / (1000 * 3600 * 24);

                    if (daysDifference <= evaluateMsigsTime) {
                        signedQuicklyCount++;
                    }
                }
            }
        }
    }

    if (totalInvolved === 0) {
        logger_log('SCORING', `Producer ${producer.owner} was not involved in any MSIGs`);
        return {
            signedPercentage: null,
            signedQuicklyPercentage: null
        };
    }

    const signedPercentage = (signedCount / totalInvolved) * 100;
    const signedQuicklyPercentage = (signedQuicklyCount / totalInvolved) * 100;

    logger_log('SCORING', `Producer ${producer.owner}: Signed ${signedCount}/${totalInvolved} (${signedPercentage.toFixed(2)}%), Signed Quickly ${signedQuicklyCount}/${totalInvolved} (${signedQuicklyPercentage.toFixed(2)}%)`);

    return {
        signedPercentage,
        signedQuicklyPercentage
    };
}

// Fetch Testnet counterpart
async function getTestnetProducer(mainnetProducer: string): Promise<string | null> {
    const mapping = await prisma.producerChainMap.findFirst({
        where: { mainnetProducer }
    });
    return mapping ? mapping.testnetProducer : null;
}

// Fetch Testnet producer score
async function getTestnetProducerScore(testnetProducer: string): Promise<number> {
    const latestScore = await prisma.producerScores.findFirst({
        where: {
            producer: {
                owner: testnetProducer,
                chain: 'Testnet'
            }
        },
        orderBy: {
            time_stamp: 'desc'
        }
    });
    return latestScore ? latestScore.score : 0;
}

// Fetch missed blocks (thanks Aloha EOS)
async function fetchBlockReliabilityData(chain: string): Promise<any> {
    const networkId = chain === 'Mainnet' ? '20' : '23';
    const url = 'https://www.alohaeos.com/block/reliability/data/get';
    const formData = new URLSearchParams();
    formData.append('networkId', networkId);
    formData.append('timeframeId', '6');
    formData.append('sort', 'rank');
    formData.append('sortDir', 'asc');

    try {
        const response = await axios.post(url, formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data;
    } catch (error) {
        logger_error('SCORING', 'Error fetching block reliability data:', error);
        throw error;
    }
}

// Saves producer score and grade
async function saveProducerScore(producerId: number, scoreData: any) {
    try {
        const scoreRatio = scoreData.score / scoreData.max_score;
        await prisma.producerScores.create({
            data: {
                producerId,
                details: scoreData.details,
                score: scoreData.score,
                max_score: scoreData.max_score,
                grade: scoreData.grade,
                score_ratio: scoreRatio,
            },
        });
        logger_log('SCORING', `Score saved successfully for producer ${producerId}`);
    } catch (error) {
        logger_error('SCORING', `Catch all error in saveScore() for producer ${producerId}:`, error);
    }
}

// Saves node score and grade
async function saveNodeScore(nodeId: number, scoreData: any) {
    try {
        await prisma.nodeScores.create({
            data: {
                nodeId,
                details: scoreData.details,
                score: scoreData.score,
                max_score: scoreData.max_score,
                grade: scoreData.grade,
            },
        });
        logger_log('SCORING', `Score saved successfully for node ${nodeId}`);
    } catch (error) {
        logger_error('SCORING', `Catch all error in saveNodeScore() for node ${nodeId}:`, error);
    }
}