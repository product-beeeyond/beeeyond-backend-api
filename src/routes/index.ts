/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import authRoutes from "./auth";
// import propertyRoutes from './properties';
// import investmentRoutes from './investments';
import adminRoutes from "./admin";
import superAdminRoutes from "./superAdmin";
import userRoutes from "./user";
import axios from "axios";
import { PING_URL } from "../config";
import multisigRoutes from './multisig';
// Add to src/app.ts or main router file
// import recoveryRoutes from './recovery';
// import adminRecoveryRoutes from './routes/adminRecovery';
import { authLimiter } from '../middleware/rateLimit';

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

setInterval(async () => {
  try {
    const res = await axios.get(PING_URL);
    console.log("checked server health:", res.data);
  } catch (err: any) {
    console.error("Error checking server:", err.message);
  }
}, 1000 * 60 * 4); // Every 4 minutes

router.use("/auth", authLimiter, authRoutes);
// router.use('/properties', propertyRoutes);
// router.use('/investments', investmentRoutes);
router.use("/user", userRoutes);
router.use("/admin", adminRoutes);
router.use("/super-admin", superAdminRoutes);
router.use('/multisig/wallet', multisigRoutes);
// router.use('/api/recovery', recoveryRoutes);
// app.use('/api/admin/recovery', adminRecoveryRoutes);

export default router;
