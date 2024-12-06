import { Request, Response } from 'express';
import { getNodesQuery } from '../services/nodeService';

export const getNodes = async (req: Request, res: Response) => {
    try {
        const chain = req.query.chain as 'mainnet' | 'testnet' | undefined;
        const type = req.query.type as 'api' | 'seed' | 'producer' | undefined;

        // Validate chain parameter
        if (chain && !['mainnet', 'testnet'].includes(chain)) {
            return res.status(400).json({ error: 'Invalid chain parameter. Must be "mainnet" or "testnet".' });
        }

        // Validate type parameter
        if (type && !['api', 'seed', 'producer'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type parameter. Must be "api", "seed", or "producer".' });
        }

        const nodes = await getNodesQuery(chain, type);
        res.json(nodes);
    } catch (error) {
        console.error('Error in getNodes:', error);
        res.status(500).json({ error: 'An error occurred while fetching nodes.' });
    }
};