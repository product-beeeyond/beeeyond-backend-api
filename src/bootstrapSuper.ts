import { UserRole } from "./middleware/auth";
import User from "./models/User";
import logger from "./utils/logger";

/**
 * Hash password using bcrypt with salt
 */
// const hashPassword = async (password: string): Promise<{ hashedPassword: string; salt: string }> => {
//   const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
//   const hashedPassword = await bcrypt.hash(password, salt);
//   return { hashedPassword, salt };
// };

/**
 * Validates super admin environment variables
 */
const validateSuperAdminEnv = (): {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
} => {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME as string;
  const lastName = process.env.SUPER_ADMIN_LAST_NAME as string;

  if (!email) {
    throw new Error("SUPER_ADMIN_EMAIL environment variable is required");
  }

  if (!password) {
    throw new Error("SUPER_ADMIN_PASSWORD environment variable is required");
  }

  if (password.length < 8) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters long");
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("SUPER_ADMIN_EMAIL must be a valid email address");
  }

  return { email, password, firstName, lastName };
};

/**
 * Ensures a super admin exists in the system
 * Creates one from environment variables if none exists
 */
export async function ensureSuperAdmin(): Promise<void> {
  try {
    logger.info("🔍 Checking for existing super admin...");

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({
      where: { role: UserRole.SUPER_ADMIN },
      attributes: ["id", "email", "firstName", "lastName", "createdAt"],
    });

    if (existingSuperAdmin) {
      logger.info("✅ Super admin already exists:", {
        id: existingSuperAdmin.id,
        email: existingSuperAdmin.email,
        name: `${existingSuperAdmin.firstName} ${existingSuperAdmin.lastName}`,
        createdAt: existingSuperAdmin.createdAt,
      });
      return;
    }

    logger.info(
      "❌ No super admin found. Creating from environment variables..."
    );

    // Validate environment variables
    const { email, password, firstName, lastName } = validateSuperAdminEnv();

    // Check if user with email already exists (but different role)
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      logger.warn(
        "⚠️ User with super admin email already exists but with different role:",
        {
          email,
          currentRole: existingUser.role,
        }
      );

      // Update existing user to super admin
      await existingUser.update({ role: UserRole.SUPER_ADMIN });

      logger.info("✅ Existing user promoted to super admin:", {
        id: existingUser.id,
        email: existingUser.email,
      });
      return;
    }

    // Hash password
    // const { hashedPassword, salt } = await hashPassword(password);

    // Create super admin
    const superAdmin = await User.create({
      email,
      password,
      firstName,
      lastName,
      role: UserRole.SUPER_ADMIN,
      nationality: "NG", // Default nationality
      investmentExperience: "advanced",
      riskTolerance: "aggressive",
      kycStatus: "verified", // Super admin is pre-verified
      isVerified: true,
      isActive: true,
      otp: 0, // Default OTP value,
      otp_expiry: new Date(),
      salt: "",
    });

    logger.info("✅ Super admin bootstrapped successfully:", {
      id: superAdmin.id,
      email: superAdmin.email,
      name: `${superAdmin.firstName} ${superAdmin.lastName}`,
      role: superAdmin.role,
    });

    // Log success message to console for visibility during startup
    console.log("✅ Super admin bootstrapped");
  } catch (error) {
    logger.error("❌ Failed to ensure super admin:", error);

    if (error instanceof Error) {
      console.error(`❌ Super admin bootstrap failed: ${error.message}`);
    } else {
      console.error("❌ Super admin bootstrap failed with unknown error");
    }

    // Re-throw to prevent app startup if super admin creation fails
    throw error;
  }
}

/**
 * Bootstrap function to be called during application startup
 * Includes database connection check
 */
export async function bootstrapSuperAdmin(): Promise<void> {
  try {
    // Ensure database is connected before attempting to create super admin
    // const { sequelize } = await import('../config/database');

    // Test database connection
    // await sequelize.authenticate();
    // logger.info('✅ Database connection verified');

    // Ensure super admin exists
    await ensureSuperAdmin();
  } catch (error) {
    logger.error("❌ Bootstrap failed:", error);

    if (error instanceof Error) {
      console.error(`❌ Bootstrap failed: ${error.message}`);
    }

    // Exit process if bootstrap fails in production
    if (process.env.NODE_ENV === "production") {
      console.error("❌ Exiting due to bootstrap failure in production");
      process.exit(1);
    }

    throw error;
  }
}

/**
 * Utility function to check super admin status
 * Useful for health checks or admin panels
 */
export async function getSuperAdminStatus(): Promise<{
  exists: boolean;
  count: number;
  details?: {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
  };
}> {
  try {
    const superAdmins = await User.findAll({
      where: { role: UserRole.SUPER_ADMIN },
      attributes: ["id", "email", "firstName", "lastName", "createdAt"],
    });

    if (superAdmins.length === 0) {
      return { exists: false, count: 0 };
    }

    const primarySuperAdmin = superAdmins[0];

    return {
      exists: true,
      count: superAdmins.length,
      details: {
        id: primarySuperAdmin.id,
        email: primarySuperAdmin.email,
        name: `${primarySuperAdmin.firstName} ${primarySuperAdmin.lastName}`,
        createdAt: primarySuperAdmin.createdAt,
      },
    };
  } catch (error) {
    logger.error("Failed to get super admin status:", error);
    throw error;
  }
}
