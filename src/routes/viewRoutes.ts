import { Router } from 'express';
import { renderProducersPage, renderNodesPage } from '../controllers/viewController';

const router = Router();

router.get('/', renderProducersPage);
router.get('/nodes', renderNodesPage);

export default router;