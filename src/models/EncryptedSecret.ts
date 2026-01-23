import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface EncryptedSecretAttributes {
  id: string;
  walletId: string;
  secretType: string; 
  ciphertextBlob: string;
  dataKeyEncrypted: string;
  iv: string;
  keyId: string;
  version: string;
  encryptionContext: string; // JSON string of context
  createdAt: Date;
  updatedAt: Date;
  rotatedAt?: Date;
}

type EncryptedSecretCreationAttributes = Optional<EncryptedSecretAttributes, 'id' | 'createdAt' | 'updatedAt' | 'rotatedAt'>

class EncryptedSecret extends Model<EncryptedSecretAttributes, EncryptedSecretCreationAttributes>
  implements EncryptedSecretAttributes {
  public id!: string;
  public walletId!: string;
  public secretType!: string;
  public ciphertextBlob!: string;
  public dataKeyEncrypted!: string;
  public iv!: string;
  public keyId!: string;
  public version!: string;
  public encryptionContext!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
  public rotatedAt?: Date;
}

EncryptedSecret.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: false,
      // Removed references - handled by associations
    },
    secretType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ciphertextBlob: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    dataKeyEncrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    iv: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    keyId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    encryptionContext: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    rotatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'EncryptedSecret',
    tableName: 'EncryptedSecrets',
    indexes: [
      {
        fields: ['walletId', 'secretType'],
        unique: true,
      },
      {
        fields: ['keyId'],
      },
      {
        fields: ['createdAt'],
      },
    ],
  }
);

export default EncryptedSecret;