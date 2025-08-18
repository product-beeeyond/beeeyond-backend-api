import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface MultiSigSignerAttributes {
  id: string;
  multiSigWalletId: string;
  userId?: string; // Optional - for user signers
  publicKey: string;
  weight: number;
  role: 'user' | 'platform_recovery' | 'platform_primary' | 'platform_secondary' | 'platform_tertiary' | 'platform_issuer' | 'issuer_backup' | 'platform_distribution' | 'platform_governance' | 'property_manager' | 'governance_key';
  status: 'active' | 'inactive' | 'recovered';
  encryptedPrivateKey?: string; // Only for platform-controlled keys
  metadata?: object;
  createdAt?: Date;
  updatedAt?: Date;
}

type MultiSigSignerCreationAttributes = Optional<MultiSigSignerAttributes, 'id' | 'createdAt' | 'updatedAt'>

class MultiSigSigner extends Model<MultiSigSignerAttributes, MultiSigSignerCreationAttributes> implements MultiSigSignerAttributes {
  public id!: string;
  public multiSigWalletId!: string;
  public userId?: string;
  public publicKey!: string;
  public weight!: number;
  public role!: 'user' | 'platform_recovery' | 'platform_primary' | 'platform_secondary' | 'platform_tertiary' | 'platform_issuer' | 'issuer_backup' | 'platform_distribution' | 'platform_governance' | 'property_manager' | 'governance_key';
  public status!: 'active' | 'inactive' | 'recovered';
  public encryptedPrivateKey?: string;
  public metadata?: object;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MultiSigSigner.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    multiSigWalletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'multisig_wallets',
        key: 'id',
      },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    publicKey: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [56, 56], // Stellar public keys are exactly 56 characters
      },
    },
    weight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 255,
      },
    },
    role: {
      type: DataTypes.ENUM(
        'user',
        'platform_recovery',
        'platform_primary',
        'platform_secondary',
        'platform_tertiary',
        'platform_issuer',
        'issuer_backup',
        'platform_distribution',
        'platform_governance',
        'property_manager',
        'governance_key'
      ),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'recovered'),
      defaultValue: 'active',
    },
    encryptedPrivateKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        platformKeysOnly(value: string | null) {
          const platformRoles = [
            'platform_recovery',
            'platform_primary',
            'platform_secondary',
            'platform_tertiary',
            'platform_issuer',
            'issuer_backup',
            'platform_distribution',
            'platform_governance',
            'property_manager',
            'governance_key'
          ];
          
          if (platformRoles.includes(String(this.role)) && !value) {
            throw new Error('Platform-controlled signers must have encrypted private key');
          }
          
          if (this.role === 'user' && value) {
            throw new Error('User signers should not have encrypted private key stored');
          }
        },
      },
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'MultiSigSigner',
    tableName: 'multisig_signers',
    indexes: [
      { fields: ['multiSigWalletId'] },
      { fields: ['userId'] },
      { fields: ['publicKey'] },
      { fields: ['role'] },
      { fields: ['status'] },
      { fields: ['multiSigWalletId', 'publicKey'], unique: true },
    ],
  }
);

export default MultiSigSigner;