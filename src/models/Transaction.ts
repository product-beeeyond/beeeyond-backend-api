import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface TransactionAttributes {
  id: string;
  userId: string;
  propertyId: string;
  transactionType: 'buy' | 'sell';
  orderType: string;
  quantity: number;
  pricePerToken: number;
  totalAmount: number;
  platformFee: number;
  netAmount: number;
  status: string;
  stellarTxHash?: string;
  paymentMethod?: string;
  sessionId?: string;
  ipAddress?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TransactionCreationAttributes extends Optional<TransactionAttributes, 'id' | 'createdAt' | 'updatedAt'> { }

class Transaction extends Model<TransactionAttributes, TransactionCreationAttributes> implements TransactionAttributes {
  public id!: string;
  public userId!: string;
  public propertyId!: string;
  public transactionType!: 'buy' | 'sell';
  public orderType!: string;
  public quantity!: number;
  public pricePerToken!: number;
  public totalAmount!: number;
  public platformFee!: number;
  public netAmount!: number;
  public status!: string;
  public stellarTxHash?: string;
  public paymentMethod?: string;
  public sessionId?: string;
  public ipAddress?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Transaction.init(
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
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    transactionType: {
      type: DataTypes.ENUM('buy', 'sell'),
      allowNull: false,
    },
    orderType: {
      type: DataTypes.ENUM('market', 'limit'),
      defaultValue: 'market',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    pricePerToken: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    platformFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    netAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
      defaultValue: 'pending',
    },
    stellarTxHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paymentMethod: {
      type: DataTypes.ENUM('wallet', 'stellar', 'p2p'),
      allowNull: true,
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    indexes: [
      { fields: ['userId'] },
      { fields: ['propertyId'] },
      { fields: ['status'] },
      { fields: ['transactionType'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default Transaction;
