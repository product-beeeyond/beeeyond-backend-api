/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "../config";
import { UserRole } from "../middleware/auth";

export enum FlagType {
  SUSPICIOUS_ACTIVITY = "suspicious_activity",
  FRAUD_ALERT = "fraud_alert",
  DOCUMENT_ISSUE = "document_issue",
  IDENTITY_MISMATCH = "identity_mismatch",
  DUPLICATE_ACCOUNT = "duplicate_account",
  COMPLIANCE_REVIEW = "compliance_review",
  HIGH_RISK_TRANSACTION = "high_risk_transaction",
  REGULATORY_HOLD = "regulatory_hold",
  MANUAL_REVIEW = "manual_review",
  OTHER = "other"
}

export interface UserAttributes {
  id: string;
  email: string;
  password: string;
  salt: string;
  gender?: string;
  title?: string;
  stateOfOrigin?: string;
  stateOfResidence?: string;
  countryOfOrigin?: string;
  countryOfResidence?: string;
  kycDetails?: {
    documents?: string[];
    nin?: string;
    bvn?: string;
  };
  flag?: {
    type: FlagType;
    comment: string;
    flaggedAt?: Date;
    flaggedBy?: string;
    resolved?: boolean;
    resolvedAt?: Date;
    resolvedBy?: string;
  };
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  nationality: string;
  address?: object;
  investmentExperience: "beginner" | "intermediate" | "advanced";
  riskTolerance: "conservative" | "moderate" | "aggressive";
  kycStatus: "pending" | "under_review" | "verified" | "rejected";
  isVerified: boolean;
  otp: number;
  otp_expiry?: Date;
  referralCode?: string;
  referredBy?: string;
  isActive: boolean;
  lastLogin?: Date;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

// Public user attributes - what users see about themselves
type PublicUserAttributes = Omit<
  UserAttributes,
  | "password"
  | "salt"
  | "otp"
  | "otp_expiry"
  | "kycDetails"
  | "flag"
  | "referredBy"
  | "isActive"
  | "lastLogin"
  | "role"
>;

// Admin user attributes - what admins see (everything except credentials)
type AdminUserAttributes = Omit<UserAttributes, "password" | "salt">;

type UserCreationAttributes = Optional<
  UserAttributes,
  "id" | "createdAt" | "updatedAt"
>;

class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: string;
  public email!: string;
  public password!: string;
  public salt!: string;
  public gender?: string;
  public title?: string;
  public stateOfOrigin?: string;
  public stateOfResidence?: string;
  public countryOfOrigin?: string;
  public countryOfResidence?: string;
  public kycDetails?: {
    documents?: string[];
    nin?: string;
    bvn?: string;
  };
  public flag?: {
    type: FlagType;
    comment: string;
    flaggedAt?: Date;
    flaggedBy?: string;
    resolved?: boolean;
    resolvedAt?: Date;
    resolvedBy?: string;
  };
  public firstName?: string;
  public lastName?: string;
  public phone?: string;
  public dateOfBirth?: Date;
  public nationality!: string;
  public address?: object;
  public otp_expiry!: Date;
  public otp!: number;
  public investmentExperience!: "beginner" | "intermediate" | "advanced";
  public riskTolerance!: "conservative" | "moderate" | "aggressive";
  public kycStatus!: "pending" | "under_review" | "verified" | "rejected";
  public isVerified!: boolean;
  public referralCode?: string;
  public referredBy?: string;
  public isActive!: boolean;
  public lastLogin?: Date;
  public role!: UserRole;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Instance methods
  public async comparePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  public toJSON(): PublicUserAttributes {
    const { 
      password, 
      salt, 
      otp, 
      otp_expiry, 
      kycDetails, 
      flag, 
      referredBy, 
      isActive, 
      lastLogin, 
      role,
      ...values 
    } = this.get();
    return values;
  }

  public toAdminJSON(): AdminUserAttributes {
    const { password, salt, ...values } = this.get();
    return values;
  }

  // Helper method to flag user account
  public async flagAccount(
    type: FlagType,
    comment: string,
    flaggedBy: string
  ): Promise<void> {
    this.flag = {
      type,
      comment,
      flaggedAt: new Date(),
      flaggedBy,
      resolved: false,
    };
    await this.save();
  }

  // Helper method to resolve flag
  public async resolveFlag(resolvedBy: string): Promise<void> {
    if (this.flag) {
      this.flag = {
        ...this.flag,
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
      };
      await this.save();
    }
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [8, 255],
      },
    },
    salt: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stateOfOrigin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stateOfResidence: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    countryOfOrigin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    countryOfResidence: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    kycDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    flag: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    dateOfBirth: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    nationality: {
      type: DataTypes.STRING,
      defaultValue: "Nigerian",
    },
    address: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    otp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: {
          msg: "Otp is required",
        },
        notEmpty: {
          msg: "provide an Otp",
        },
      },
    },
    otp_expiry: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        notNull: {
          msg: "Otp expired",
        },
        notEmpty: {
          msg: "provide an Otp",
        },
      },
    },
    investmentExperience: {
      type: DataTypes.ENUM("beginner", "intermediate", "advanced"),
      defaultValue: "beginner",
    },
    riskTolerance: {
      type: DataTypes.ENUM("conservative", "moderate", "aggressive"),
      defaultValue: "moderate",
    },
    kycStatus: {
      type: DataTypes.ENUM("pending", "under_review", "verified", "rejected"),
      defaultValue: "pending",
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    referralCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    referredBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM("user", "admin", "super_admin"),
      defaultValue: "user",
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password) {
          const saltRounds = Number(BCRYPT_ROUNDS);
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
        if (!user.referralCode) {
          user.referralCode = Math.random()
            .toString(36)
            .substring(2, 10)
            .toUpperCase();
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed("password")) {
          const saltRounds = Number(BCRYPT_ROUNDS);
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
      },
    },
    indexes: [
      { fields: ["email"] },
      { fields: ["phone"] },
      { fields: ["referralCode"] },
      { fields: ["kycStatus"] },
      { fields: ["role"] },
      { fields: ["isActive"] },
      { 
        fields: ["flag"],
        using: "gin",
        name: "user_flag_gin_idx"
      },
    ],
  }
);

export default User;
// /* eslint-disable unused-imports/no-unused-vars */
// /* eslint-disable @typescript-eslint/no-unused-vars */
// import { DataTypes, Model, Optional } from "sequelize";
// import { sequelize } from "../config/database";
// import bcrypt from "bcryptjs";
// import { BCRYPT_ROUNDS } from "../config";
// import { UserRole } from "../middleware/auth";

// export interface UserAttributes {
//   id: string;
//   email: string;
//   password: string;
//   salt: string;
//   firstName?: string;
//   lastName?: string;
//   phone?: string;
//   dateOfBirth?: Date;
//   nationality: string;
//   address?: object;
//   investmentExperience: "beginner" | "intermediate" | "advanced";
//   riskTolerance: "conservative" | "moderate" | "aggressive";
//   kycStatus: "pending" | "under_review" | "verified" | "rejected";
//   isVerified: boolean;
//   otp: number;
//   otp_expiry?: Date;
//   referralCode?: string;
//   referredBy?: string;
//   isActive: boolean;
//   lastLogin?: Date;
//   role: UserRole;
//   createdAt?: Date;
//   updatedAt?: Date;
// }
// type PublicUserAttributes = Omit<
//   UserAttributes,
//   "password" | "salt" | "otp" | "otp_expiry"
// >;

// type AdminUserAttributes = Omit<UserAttributes, "password" | "salt">;

// type UserCreationAttributes = Optional<
//   UserAttributes,
//   "id" | "createdAt" | "updatedAt"
// >;

// class User
//   extends Model<UserAttributes, UserCreationAttributes>
//   implements UserAttributes
// {
//   public id!: string;
//   public email!: string;
//   public password!: string;
//   public firstName?: string;
//   public lastName?: string;
//   public phone?: string;
//   public dateOfBirth?: Date;
//   public nationality!: string;
//   public address?: object;
//   public otp_expiry!: Date;
//   public otp!: number;
//   public salt!: string;
//   public investmentExperience!: "beginner" | "intermediate" | "advanced";
//   public riskTolerance!: "conservative" | "moderate" | "aggressive";
//   public kycStatus!: "pending" | "under_review" | "verified" | "rejected";
//   public isVerified!: boolean;
//   public referralCode?: string;
//   public referredBy?: string;
//   public isActive!: boolean;
//   public lastLogin?: Date;
//   public role!: UserRole; // Fixed: Made role required and properly typed

//   public readonly createdAt!: Date;
//   public readonly updatedAt!: Date;

//   // Instance methods
//   public async comparePassword(password: string): Promise<boolean> {
//     return bcrypt.compare(password, this.password);
//   }

//   // public toJSON(): object {
//   //   const values = Object.assign({}, this.get());
//   //   delete values.password;
//   //   return values;
//   // }

//   public toJSON(): PublicUserAttributes {
//     const { password, salt, otp, otp_expiry, ...values } = this.get();
//     return values;
//   }

//   public toAdminJSON(): AdminUserAttributes {
//     const { password, salt, ...values } = this.get();
//     return values;
//   }
// }

// User.init(
//   {
//     id: {
//       type: DataTypes.UUID,
//       defaultValue: DataTypes.UUIDV4,
//       primaryKey: true,
//       allowNull: false,
//     },
//     email: {
//       type: DataTypes.STRING,
//       allowNull: false,
//       unique: true,
//       validate: {
//         isEmail: true,
//       },
//     },
//     password: {
//       type: DataTypes.STRING,
//       allowNull: false,
//       validate: {
//         len: [8, 255],
//       },
//     },
//     salt: {
//       type: DataTypes.STRING,
//       allowNull: false,
//     },
//     firstName: {
//       type: DataTypes.STRING,
//       allowNull: true,
//     },
//     lastName: {
//       type: DataTypes.STRING,
//       allowNull: true,
//     },
//     phone: {
//       type: DataTypes.STRING,
//       allowNull: true,
//       unique: true,
//     },
//     dateOfBirth: {
//       type: DataTypes.DATE,
//       allowNull: true,
//     },
//     nationality: {
//       type: DataTypes.STRING,
//       defaultValue: "Nigerian",
//     },
//     address: {
//       type: DataTypes.JSONB,
//       allowNull: true,
//     },
//     otp: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       validate: {
//         notNull: {
//           msg: "Otp is required",
//         },
//         notEmpty: {
//           msg: "provide an Otp",
//         },
//       },
//     },
//     otp_expiry: {
//       type: DataTypes.DATE,
//       allowNull: false,
//       validate: {
//         notNull: {
//           msg: "Otp expired",
//         },
//         notEmpty: {
//           msg: "provide an Otp",
//         },
//       },
//     },
//     investmentExperience: {
//       type: DataTypes.ENUM("beginner", "intermediate", "advanced"),
//       defaultValue: "beginner",
//     },
//     riskTolerance: {
//       type: DataTypes.ENUM("conservative", "moderate", "aggressive"),
//       defaultValue: "moderate",
//     },
//     kycStatus: {
//       type: DataTypes.ENUM("pending", "under_review", "verified", "rejected"),
//       defaultValue: "pending",
//     },
//     isVerified: {
//       type: DataTypes.BOOLEAN,
//       defaultValue: false,
//     },
//     referralCode: {
//       type: DataTypes.STRING,
//       allowNull: true,
//       unique: true,
//     },
//     referredBy: {
//       type: DataTypes.UUID,
//       allowNull: true,
//     },
//     isActive: {
//       type: DataTypes.BOOLEAN,
//       defaultValue: true,
//     },
//     lastLogin: {
//       type: DataTypes.DATE,
//       allowNull: true,
//     },
//     role: {
//       type: DataTypes.ENUM("user", "admin", "super_admin"),
//       defaultValue: "user",
//       allowNull: false,
//     },
//   },
//   {
//     sequelize,
//     modelName: "User",
//     tableName: "users",
//     hooks: {
//       beforeCreate: async (user: User) => {
//         if (user.password) {
//           const saltRounds = Number(BCRYPT_ROUNDS);
//           user.password = await bcrypt.hash(user.password, saltRounds);
//         }
//         if (!user.referralCode) {
//           user.referralCode = Math.random()
//             .toString(36)
//             .substring(2, 10)
//             .toUpperCase();
//         }
//       },
//       beforeUpdate: async (user: User) => {
//         if (user.changed("password")) {
//           const saltRounds = Number(BCRYPT_ROUNDS);
//           user.password = await bcrypt.hash(user.password, saltRounds);
//         }
//       },
//     },
//     indexes: [
//       { fields: ["email"] },
//       { fields: ["phone"] },
//       { fields: ["referralCode"] },
//       { fields: ["kycStatus"] },
//       { fields: ["role"] }, // Added index for role field
//     ],
//   }
// );

// export default User;
