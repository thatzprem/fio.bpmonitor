import { Request, Response } from 'express';
import { getScoresQuery } from '../services/scoringService';
import { logger_error } from '../utils/logger';

export const getScores = async (req: Request, res: Response) => {
    try {
        const { producerId, limit } = req.query;
        const producerIdNumber = producerId ? parseInt(producerId as string, 10) : undefined;
        const limitNumber = limit ? parseInt(limit as string, 10) : 7;

        if (!producerIdNumber) {
            return res.status(400).json({ error: 'producerId is required' });
        }

        const scores = await getScoresQuery(producerIdNumber, limitNumber);
        res.json(scores);
    } catch (error) {
        logger_error('SCORES', 'Error in getScores:', error);
        res.status(500).json({ error: 'An error occurred while fetching scores.' });
    }
};