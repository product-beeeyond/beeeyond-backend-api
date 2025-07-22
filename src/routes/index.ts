import { Router } from 'express';
import authRoutes from './auth';
import propertyRoutes from './properties';
import investmentRoutes from './investments';
import adminRoutes from "./admin";
import userRoutes from "./user";
// Import other route modules as they're created

const router = Router();

// Health check for API
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

router.use('/auth', authRoutes);
router.use('/properties', propertyRoutes);
router.use('/investments', investmentRoutes);
router.use('/user', userRoutes);
router.use('/admin', adminRoutes);

export default router;
