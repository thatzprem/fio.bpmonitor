import { Request, Response } from 'express';
import { getProducersQuery } from '../services/producerService';
import { getNodesQuery } from '../services/nodeService';
import { config, scoreDescriptions} from '../config/env';

export const renderProducersPage = async (req: Request, res: Response) => {
    try {
        const chain = (req.query.chain as 'Mainnet' | 'Testnet') || 'Mainnet';
        const producers = await getProducersQuery(undefined, chain, 'score');

        // Merge producerScoringCriteria with producerScoringPenalties
        const producerScoringCriteria = {
            ...config.producerScoringCriteria,
            ...(chain === 'Mainnet' ? config.mainnetScoringCriteria : {}),
            ...config.producerScoringPenalties
        };

        const nodeScoringCriteria = config.nodeScoringCriteria;

        res.render('producers', {
            producers,
            scoreDescriptions,
            producerScoringCriteria,
            nodeScoringCriteria,
            chain,
            currentPage: 'producers',
            currentChain: chain
        });
    } catch (error) {
        console.error('Error rendering producers page:', error);
        res.status(500).send('An error occurred while rendering the producers page.');
    }
};

export const renderNodesPage = async (req: Request, res: Response) => {
    try {
        const chain = (req.query.chain as 'Mainnet' | 'Testnet') || 'Mainnet';
        const nodeType = (req.query.type as 'api' | 'seed' | 'producer') || 'api';
        const nodes = await getNodesQuery(chain.toLowerCase() as 'mainnet' | 'testnet', nodeType);
        const nodeScoringCriteria = config.nodeScoringCriteria;

        res.render('nodes', {
            nodes,
            scoreDescriptions,
            nodeScoringCriteria,
            chain,
            currentPage: 'nodes',
            currentChain: chain
        });
    } catch (error) {
        console.error('Error rendering nodes page:', error);
        res.status(500).send('An error occurred while rendering the nodes page.');
    }
};