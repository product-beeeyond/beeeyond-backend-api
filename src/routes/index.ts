import { Router } from 'express';
import authRoutes from './auth';
import propertyRoutes from './properties';
import investmentRoutes from './investments';
import adminRoutes from "./admin";
import superAdminRoutes from "./superAdmin";
import userRoutes from "./user";
// import multisigRoutes from './multisig'; 

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
router.use('/super-admin', superAdminRoutes);
// router.use('/multisig', multisigRoutes);

export default router;
