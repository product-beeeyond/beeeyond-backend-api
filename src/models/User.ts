import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../config';
import { UserRole } from '../middleware/auth';

export interface UserAttributes {
  id: string;
  email: string;
  password: string;
  salt: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  nationality: string;
  address?: object;
  investmentExperience: string;
  riskTolerance: string;
  kycStatus: string;
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
type PublicUserAttributes = Omit<UserAttributes, 'password' | 'salt' | 'otp' | 'otp_expiry'>;

type AdminUserAttributes = Omit<UserAttributes, 'password' | 'salt'>;

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt'> { }

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public password!: string;
  public firstName?: string;
  public lastName?: string;
  public phone?: string;
  public dateOfBirth?: Date;
  public nationality!: string;
  public address?: object;
  public otp_expiry!: Date;
  public otp!: number;
  public salt!: string;
  public investmentExperience!: string;
  public riskTolerance!: string;
  public kycStatus!: string;
  public isVerified!: boolean;
  public referralCode?: string;
  public referredBy?: string;
  public isActive!: boolean;
  public lastLogin?: Date;
  public role!: UserRole; // Fixed: Made role required and properly typed

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Instance methods
  public async comparePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  // public toJSON(): object {
  //   const values = Object.assign({}, this.get());
  //   delete values.password;
  //   return values;
  // }

  public toJSON(): PublicUserAttributes {
    const { password, salt, otp, otp_expiry, ...values } = this.get();
    return values;
  }

  public toAdminJSON(): AdminUserAttributes {
    const { password, salt, ...values } = this.get();
    return values;
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
      defaultValue: 'Nigerian',
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
          msg: "Otp is required"
        },
        notEmpty: {
          msg: "provide an Otp",
        },
      }
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
      }
    },
    investmentExperience: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
      defaultValue: 'beginner',
    },
    riskTolerance: {
      type: DataTypes.ENUM('conservative', 'moderate', 'aggressive'),
      defaultValue: 'moderate',
    },
    kycStatus: {
      type: DataTypes.ENUM('pending', 'under_review', 'verified', 'rejected'),
      defaultValue: 'pending',
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
      type: DataTypes.ENUM('user', 'admin', 'super_admin'),
      defaultValue: 'user',
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password) {
          const saltRounds = Number(BCRYPT_ROUNDS);
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
        if (!user.referralCode) {
          user.referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed('password')) {
          const saltRounds = Number(BCRYPT_ROUNDS);
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
      },
    },
    indexes: [
      { fields: ['email'] },
      { fields: ['phone'] },
      { fields: ['referralCode'] },
      { fields: ['kycStatus'] },
      { fields: ['role'] }, // Added index for role field
    ],
  }
);

export default User;
