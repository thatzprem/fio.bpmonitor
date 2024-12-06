import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
    baseUrl: process.env.BASE_URL || 'http://localhost',
    dbUrl: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/bpmonitor",
    port: process.env.PORT || 4000,
    external_port: process.env.EXTERNAL_PORT || 4000,
    logging: process.env.LOGGING || 'file',// console or file
    loggingLevel: process.env.LOGGING_LEVEL || 'error',// error or info
    json_fetch_timeout: Number(process.env.JSON_FETCH_TIMEOUT) || 5000,
    node_check_timeout: Number(process.env.NODE_CHECK_TIMEOUT) || 10000,
    mainnetApiUrl: process.env.MAINNET_API_URL || "https://api.fiosweden.org",// Must run Hyperion
    testnetApiUrl: process.env.TESTNET_API_URL || "https://api.testnet.fiosweden.org",// Must run Hyperion
    mainnetChainId: process.env.MAINNET_CHAIN_ID || "21dcae42c0182200e93f954a074011f9048a7624c6fe81d3c9541a614a88bd1c",
    testnetChainId: process.env.TESTNET_CHAIN_ID || "b20901380af44ef59c5918439a1f9a41d83669020319a80574b804a5f95cbd7e",
    mainnetProposer: process.env.MAINNET_PROPOSER || "fio1uipge5sr",
    testnetProposer: process.env.TESTNET_PROPOSER || "nyvrxkxhiyql",
    producerToolsUrl: process.env.PRODUCER_TOOLS_URL || 'https://raw.githubusercontent.com/fioprotocol/fio.bpmonitor/master/bptools.md',
    producerChainMapUrl: process.env.PRODUCER_CHAIN_MAP_URL || 'https://raw.githubusercontent.com/fioprotocol/fio.bpmonitor/master/bpchainmap.md',
    producerScoringCriteria: JSON.parse(process.env.PRODUCER_SCORING_CRITERIA || '{' +
        '"has_bp_json":5,' +
        '"reports_producer_node":5,' +
        '"reports_seed_node":5,' +
        '"reports_api_node":5,' +
        '"runs_api_node":20,' +
        '"api_node_score":80,' +
        '"fee_votes":20,' +
        '"fee_voted_recently":20,' +
        '"bundle_votes":20,' +
        '"runs_tools":30,' +
        '"signs_msigs":30,' +
        '"signs_msigs_quickly":30' +
        '}'),
    nodeScoringCriteria: JSON.parse(process.env.NODE_SCORING_CRITERIA || '{' +
        '"reports_latest_version":20,' +
        '"runs_history_node":20,' +
        '"runs_hyperion_node":20,' +
        '"results_a":10,' +
        '"results_b":20,' +
        '"results_c":30,' +
        '"no_recent_outage":30' +
        '}'),
    producerScoringPenalties: JSON.parse(process.env.PRODUCER_SCORING_PENALTIES || '{' +
        '"valid_fio_address":-50,' +
        '"no_missing_blocks":-50' +
        '}'),
    mainnetScoringCriteria: JSON.parse(process.env.MAINNET_SCORING_CRITERIA || '{"participates_in_testnet":30}'),
    gradeChart: JSON.parse(process.env.GRADE_CHART || '{' +
        '"A+": [96, 100],' +
        '"A": [91, 95],' +
        '"A-": [86, 90],' +
        '"B+": [81, 85],' +
        '"B": [76, 80],' +
        '"B-": [71, 75],' +
        '"C+": [66, 70],' +
        '"C": [61, 65],' +
        '"C-": [56, 60],' +
        '"D+": [51, 55],' +
        '"D": [46, 50],' +
        '"D-": [41, 45],' +
        '"F": [0, 40]' +
        '}'),
    resultPercentiles: JSON.parse(process.env.RESULT_PERCENTILES || '{"results_a":75,"results_b":50,"results_c":25}'),
    evaluate_msigs_count: parseInt(process.env.EVALUATE_MSIGS_COUNT || '25', 10),
    evaluate_msigs_percent: parseInt(process.env.EVALUATE_MSIGS_PERCENT || '75', 10),
    evaluate_msigs_time: parseInt(process.env.EVALUATE_MSIGS_PERCENT || '7', 10),
    github_api_version: {
        owner: process.env.GITHUB_REPO_OWNER || 'fioprotocol',
        repo: process.env.GITHUB_REPO_NAME || 'fio',
        apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com'
    },
};

export const scoreDescriptions: { [key: string]: string } = {
    has_bp_json: "bp.json could be discovered",
    reports_api_node: "bp.json contained api node",
    reports_latest_version: "call to api node revealed latest version of fio core",
    reports_producer_node: "bp.json contained producer node",
    reports_seed_node: "bp.json contained seed node",
    runs_api_node: "Has 1+ api active node",
    api_node_score: "Average score for all nodes, see nodes for details",
    runs_history_node: "Last call to V1 History node was successful",
    runs_hyperion_node: "Last call to V2 History node was successful",
    results_a: "<a href='https://github.com/fioprotocol/fio.bpmonitor/blob/bb2f723b6bbd7d16694884c01e038e7a4eb4d85c/src/services/nodeService.ts#L225'>API query</a> average result count in 75th percentile in last 7 days",
    results_b: "<a href='https://github.com/fioprotocol/fio.bpmonitor/blob/bb2f723b6bbd7d16694884c01e038e7a4eb4d85c/src/services/nodeService.ts#L225'>API query</a> average result count in 50th percentile in last 7 days",
    results_c: "<a href='https://github.com/fioprotocol/fio.bpmonitor/blob/bb2f723b6bbd7d16694884c01e038e7a4eb4d85c/src/services/nodeService.ts#L225'>API query</a> average result count in 25th percentile in last 7 days",
    no_recent_outage: "No node outages in last 7 days.",
    fee_votes: "<a href='https://dev.fio.net/docs/setting-fees#setting-fees'>Votes on fees</a>",
    fee_voted_recently: "<a href='https://dev.fio.net/docs/setting-fees#setting-fees'>Votes on fees</a> in last 30 days",
    bundle_votes: "<a href='https://dev.fio.net/docs/setting-fees#setting-bundled-transactions'>Votes on bundles</a>",
    signs_msigs: "Signs msigs",
    signs_msigs_quickly: "Signs msigs in 7 days or less",
    runs_tools: "Runs <a href='https://github.com/fioprotocol/fio.bpmonitor/blob/master/bptools.md'>tools for community</a>",
    participates_in_testnet: "For Mainnet BPs, if they have a <a href='https://github.com/fioprotocol/fio.bpmonitor/blob/master/bpchainmap.md'>mapped Testnet BP</a>, the score of that BP is represented.",
    valid_fio_address: "Has valid and unexpired FIO Handle.",
    no_missing_blocks: "Has not missed any blocks in last 7 days."
};
