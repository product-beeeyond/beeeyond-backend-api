import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface RecoveryRequestAttributes {
  id: string;
  userId: string;
  walletId: string;
  requestReason: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired';
  
  // Time-locking fields
  waitingPeriodHours: number;
  executableAfter: Date;
  expiresAt: Date;
  
  // Admin authorization fields
  requiredApprovals: number;
  currentApprovals: number;
  approvedBy: Array<{adminId: string, approvedAt: string, adminEmail: string}>;
  
  // New keypair for recovery (generated server-side)
  newUserPublicKey: string;
  encryptedNewPrivateKey: string;
  
  // Execution tracking
  executedBy?: string;
  executedAt?: Date;
  failureReason?: string;
  retryCount: number;
  lastRetryAt?: Date;
  
  // Audit fields
  requestedBy: string;
  metadata?: object;
  createdAt?: Date;
  updatedAt?: Date;
}

type RecoveryRequestCreationAttributes = Optional<RecoveryRequestAttributes, 
  'id' | 'status' | 'currentApprovals' | 'retryCount' | 'createdAt' | 'updatedAt'>;

class RecoveryRequest extends Model<RecoveryRequestAttributes, RecoveryRequestCreationAttributes> 
  implements RecoveryRequestAttributes {
  
  public id!: string;
  public userId!: string;
  public walletId!: string;
  public requestReason!: string;
  public status!: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired';
  
  public waitingPeriodHours!: number;
  public executableAfter!: Date;
  public expiresAt!: Date;
  
  public requiredApprovals!: number;
  public currentApprovals!: number;
  public approvedBy!: Array<{adminId: string, approvedAt: string, adminEmail: string}>;
  
  public newUserPublicKey!: string;
  public encryptedNewPrivateKey!: string;
  
  public executedBy?: string;
  public executedAt?: Date;
  public failureReason?: string;
  public retryCount!: number;
  public lastRetryAt?: Date;
  
  public requestedBy!: string;
  public metadata?: object;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

RecoveryRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'multisig_wallets',
        key: 'id',
      },
    },
    requestReason: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [10, 1000],
      },
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'executed', 'failed', 'expired'),
      defaultValue: 'pending',
    },
    waitingPeriodHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 24,
      validate: {
        min: 1,
        max: 168, // Max 1 week
      },
    },
    executableAfter: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    requiredApprovals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
      validate: {
        min: 1,
        max: 10,
      },
    },
    currentApprovals: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    approvedBy: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    newUserPublicKey: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [56, 56], // Stellar public key length
      },
    },
    encryptedNewPrivateKey: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    executedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    executedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    lastRetryAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    requestedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'RecoveryRequest',
    tableName: 'recovery_requests',
    indexes: [
      { fields: ['userId'] },
      { fields: ['walletId'] },
      { fields: ['status'] },
      { fields: ['executableAfter'] },
      { fields: ['expiresAt'] },
      { fields: ['userId', 'status'] },
    ],
    hooks: {
      beforeCreate: (instance: RecoveryRequest) => {
        const now = new Date();
        instance.executableAfter = new Date(now.getTime() + instance.waitingPeriodHours * 60 * 60 * 1000);
        instance.expiresAt = new Date(instance.executableAfter.getTime() + 48 * 60 * 60 * 1000); // 48 hours after executable
      },
    },
  }
);

export default RecoveryRequest;