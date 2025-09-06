import { Router } from "express";
import authRoutes from "./auth";
// import propertyRoutes from './properties';
// import investmentRoutes from './investments';
import adminRoutes from "./admin";
import superAdminRoutes from "./superAdmin";
import userRoutes from "./user";
// import multisigRoutes from './multisig';
// Add to src/app.ts or main router file
// import recoveryRoutes from './recovery';
// import adminRecoveryRoutes from './routes/adminRecovery';

const router = Router();

// Health check for API
router.get("/health", (req, res) => {
  res.json({
    Service:
      "Beeeyond.africa - Africa's No. 1 fractional real estate investment platform",
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

router.use("/auth", authRoutes);
// router.use('/properties', propertyRoutes);
// router.use('/investments', investmentRoutes);
router.use("/user", userRoutes);
router.use("/admin", adminRoutes);
router.use("/super-admin", superAdminRoutes);
// router.use('/multisig', multisigRoutes);

// Add these route registrations

// router.use('/api/recovery', recoveryRoutes);
// app.use('/api/admin/recovery', adminRecoveryRoutes);

export default router;
