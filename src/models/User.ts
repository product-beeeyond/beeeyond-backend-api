import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../config';

interface UserAttributes {
  id: string;
  email: string;
  password: string;
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
  referralCode?: string;
  referredBy?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

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
  public investmentExperience!: string;
  public riskTolerance!: string;
  public kycStatus!: string;
  public isVerified!: boolean;
  public referralCode?: string;
  public referredBy?: string;
  public isActive!: boolean;
  public lastLogin?: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Instance methods
  public async comparePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  public toJSON(): object {
    const values = Object.assign({}, this.get());
    delete values.password;
    return values;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    ],
  }
);

export default User;
