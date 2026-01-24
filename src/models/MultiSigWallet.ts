import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import MultiSigSigner from "./MultiSigSigner";
import MultiSigTransaction from "./MultiSigTransaction";

interface MultiSigWalletAttributes {
  id: string;
  userId?: string;
  propertyId?: string;
  stellarPublicKey: string;
  walletType:
    | "user"
    | "platform_primary"
    | "platform_treasury"
    | "platform_issuer"
    | "platform_recovery_batch"
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
  
  // Trovotech-specific fields
  trovoAlias?: string;
  trovoWalletTag?: string;
  registeredOnTrovo: boolean;
  trovoRegistrationDate?: Date;
  middlewareWalletPublicKey?: string;
  
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
    // Trovotech metadata (legacy - moved to dedicated fields)
    // trovoRegistered?: boolean;
    // trovoTransactionId?: string;
    // trovoRegisteredAt?: string;
    // trovoMiddlewareWallet?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

type MultiSigWalletCreationAttributes = Optional<
  MultiSigWalletAttributes,
  "id" | "createdAt" | "updatedAt" | "registeredOnTrovo"
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
    | "user"
    | "platform_primary"
    | "platform_treasury"
    | "platform_issuer"
    | "platform_recovery_batch"
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
  
  // Trovotech fields
  public trovoAlias?: string;
  public trovoWalletTag?: string;
  public registeredOnTrovo!: boolean;
  public trovoRegistrationDate?: Date;
  public middlewareWalletPublicKey?: string;
  
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
    // trovoRegistered?: boolean;
    // trovoTransactionId?: string;
    // trovoRegisteredAt?: string;
    // trovoMiddlewareWallet?: string;
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
      validate: {
        userWalletMustHaveUserId(value: string | null) {
          if (this.walletType === "user" && !value) {
            throw new Error("User wallets must have a userId");
          }
        },
      },
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: true,
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
        len: [56, 56],
      },
    },
    walletType: {
      type: DataTypes.ENUM(
        "user",
        "platform_primary",
        "platform_treasury",
        "platform_issuer",
        "platform_recovery_batch",
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
    },
    // Trovotech-specific columns
    trovoAlias: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'trovo_alias',
      comment: 'Trovotech wallet alias/username',
    },
    trovoWalletTag: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'trovo_wallet_tag',
      comment: 'Trovotech wallet tag identifier',
    },
    registeredOnTrovo: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      field: 'registered_on_trovo',
      comment: 'Whether wallet is registered on Trovotech',
    },
    trovoRegistrationDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'trovo_registration_date',
      comment: 'Date when wallet was registered on Trovotech',
    },
    middlewareWalletPublicKey: {
      type: DataTypes.STRING(56),
      allowNull: true,
      field: 'middleware_wallet_public_key',
      comment: 'Trovotech middleware distribution wallet public key (for issuing wallets)',
      validate: {
        len: [56, 56],
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
      // Trovotech indexes
      { fields: ["trovo_alias"] },
      { fields: ["registered_on_trovo"] },
      { fields: ["trovo_wallet_tag"] },
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