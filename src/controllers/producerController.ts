import { Request, Response } from 'express';
import { getProducersQuery } from '../services/producerService';
import { logger_error } from '../utils/logger';

export const getProducers = async (req: Request, res: Response) => {
    try {
        const { limit, chain, sort } = req.query;
        const limitNumber = limit ? parseInt(limit as string, 10) : undefined;
        const chainValue = chain as 'Mainnet' | 'Testnet' | undefined;
        const sortByValue = (sort as string === 'score') ? 'score' : 'total_votes';

        const producers = await getProducersQuery(limitNumber, chainValue, sortByValue);
        res.json(producers);
    } catch (error) {
        logger_error('PRODUCERS', 'Error in getProducers:', error);
        res.status(500).json({ error: 'An error occurred while fetching producers.', details: error instanceof Error ? error.message : String(error) });
    }
};