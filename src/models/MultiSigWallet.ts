import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import MultiSigSigner from "./MultiSigSigner";
import MultiSigTransaction from "./MultiSigTransaction";

interface MultiSigWalletAttributes {
  id: string;
  userId?: string; // Only for user wallets
  propertyId?: string; // Only for property wallets
  stellarPublicKey: string;
  walletType:
    | "user_recovery"
    | "platform_treasury"
    | "platform_issuer"
    | "platform_distribution"
    | "platform_fee_collection"
    | "property_distribution"
    | "property_governance";
  lowThreshold: number;
  mediumThreshold: number;
  highThreshold: number;
  masterWeight: number;
  status:
    | "active"
    | "inactive"
    | "recovered"
    | "awaiting_finalization"
    | "awaiting_funding";
  createdTxHash?: string;
  metadata?: {
    description?: string;
    createdBy?: string;
    initialBalance?: string;
    createdAt?: string;
    phase?: string;
    recoveryReason?: string;
    recoveredAt?: string;
    propertyTitle?: string;
    finalizedAt?: string;
    purpose?: string;
    encryptedMasterKey?: string;
    userEmail?: string;
    userName?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

type MultiSigWalletCreationAttributes = Optional<
  MultiSigWalletAttributes,
  "id" | "createdAt" | "updatedAt"
>;

class MultiSigWallet
  extends Model<MultiSigWalletAttributes, MultiSigWalletCreationAttributes>
  implements MultiSigWalletAttributes
{
  public id!: string;
  public userId?: string;
  public propertyId?: string;
  public stellarPublicKey!: string;
  public walletType!:
    | "user_recovery"
    | "platform_treasury"
    | "platform_issuer"
    | "platform_distribution"
    | "platform_fee_collection"
    | "property_distribution"
    | "property_governance";
  public lowThreshold!: number;
  public mediumThreshold!: number;
  public highThreshold!: number;
  public masterWeight!: number;
  public status!:
    | "active"
    | "inactive"
    | "recovered"
    | "awaiting_finalization"
    | "awaiting_funding";
  public createdTxHash?: string;
  public metadata?: {
    description?: string;
    createdBy?: string;
    initialBalance?: string;
    createdAt?: string;
    phase?: string;
    recoveryReason?: string;
    recoveredAt?: string;
    propertyTitle?: string;
    finalizedAt?: string;
    purpose?: string;
    encryptedMasterKey?: string;
    userEmail?: string;
    userName?: string;
  };

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public signers?: MultiSigSigner[];
  public transactions?: MultiSigTransaction[];
}

MultiSigWallet.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      validate: {
        userWalletMustHaveUserId(value: string | null) {
          if (this.walletType === "user_recovery" && !value) {
            throw new Error("User recovery wallets must have a userId");
          }
        },
      },
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "properties",
        key: "id",
      },
      validate: {
        propertyWalletMustHavePropertyId(value: string | null) {
          if (
            ["property_distribution", "property_governance"].includes(
              String(this.walletType)
            ) &&
            !value
          ) {
            throw new Error("Property wallets must have a propertyId");
          }
        },
      },
    },
    stellarPublicKey: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [56, 56], // Stellar public keys are exactly 56 characters
      },
    },
    walletType: {
      type: DataTypes.ENUM(
        "user_recovery",
        "platform_treasury",
        "platform_issuer",
        "platform_distribution",
        "platform_fee_collection",
        "property_distribution",
        "property_governance"
      ),
      allowNull: false,
    },
    lowThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 255,
      },
    },
    mediumThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 255,
      },
    },
    highThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 255,
      },
    },
    masterWeight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 255,
      },
    },
    status: {
      type: DataTypes.ENUM(
        "active",
        "inactive",
        "recovered",
        "awaiting_finalization",
        "awaiting_funding"
      ),
      defaultValue: "active",
    },
    createdTxHash: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [64, 64], // Stellar transaction hashes are 64 characters
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
    modelName: "MultiSigWallet",
    tableName: "multisig_wallets",
    indexes: [
      { fields: ["userId"] },
      { fields: ["propertyId"] },
      { fields: ["walletType"] },
      { fields: ["stellarPublicKey"], unique: true },
      { fields: ["status"] },
      { fields: ["walletType", "status"] },
    ],
    validate: {
      thresholdConsistency(this: MultiSigWallet) {
        if (
          this.lowThreshold > this.mediumThreshold ||
          this.mediumThreshold > this.highThreshold
        ) {
          throw new Error(
            "Thresholds must be in ascending order: low <= medium <= high"
          );
        }
      },
    },
  }
);

export default MultiSigWallet;
