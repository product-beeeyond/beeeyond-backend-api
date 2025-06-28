import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface WalletAttributes {
  id: string;
  userId: string;
  currency: string;
  availableBalance: number;
  lockedBalance: number;
  totalBalance: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface WalletCreationAttributes extends Optional<WalletAttributes, 'id' | 'createdAt' | 'updatedAt'> { }

class Wallet extends Model<WalletAttributes, WalletCreationAttributes> implements WalletAttributes {
  public id!: string;
  public userId!: string;
  public currency!: string;
  public availableBalance!: number;
  public lockedBalance!: number;
  public totalBalance!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Wallet.init(
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
    currency: {
      type: DataTypes.STRING,
      defaultValue: 'NGN',
    },
    availableBalance: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    lockedBalance: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    totalBalance: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
  },
  {
    sequelize,
    modelName: 'Wallet',
    tableName: 'wallets',
    indexes: [
      { fields: ['userId'] },
      { fields: ['currency'] },
    ],
    hooks: {
      beforeSave: (wallet: Wallet) => {
        wallet.totalBalance = wallet.availableBalance + wallet.lockedBalance;
      },
    },
  }
);

export default Wallet;
