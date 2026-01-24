import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import MultiSigWallet from "./MultiSigWallet";

interface MultiSigTransactionAttributes {
  id: string;
  multiSigWalletId: string;
  transactionXDR: string;
  signedTransactionXDR?: string;
  description: string;
  category:
    | "fund_management"
    | "governance"
    | "revenue_distribution"
    | "emergency"
    | "recovery";
  requiredSignatures: number;
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "executed"
    | "failed"
    | "expired";
  proposedBy: string;
  executedBy?: string;
  executedAt?: Date;
  executionTxHash?: string;
  failureReason?: string;
  signatures?: object;

  // Trovotech-specific fields
  trovoTransactionId?: string;
  trovoStatus?: string;
  processedViaTrovotech: boolean;

  metadata?: object;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

type MultiSigTransactionCreationAttributes = Optional<
  MultiSigTransactionAttributes,
  "id" | "createdAt" | "updatedAt" | "processedViaTrovotech"
>;

class MultiSigTransaction
  extends Model<
    MultiSigTransactionAttributes,
    MultiSigTransactionCreationAttributes
  >
  implements MultiSigTransactionAttributes
{
  public id!: string;
  public multiSigWalletId!: string;
  public transactionXDR!: string;
  public signedTransactionXDR?: string;
  public description!: string;
  public category!:
    | "fund_management"
    | "governance"
    | "revenue_distribution"
    | "emergency"
    | "recovery";
  public requiredSignatures!: number;
  public status!:
    | "pending"
    | "approved"
    | "rejected"
    | "executed"
    | "failed"
    | "expired";
  public proposedBy!: string;
  public executedBy?: string;
  public executedAt?: Date;
  public executionTxHash?: string;
  public failureReason?: string;
  public signatures?: object;

  // Trovotech fields
  public trovoTransactionId?: string;
  public trovoStatus?: string;
  public processedViaTrovotech!: boolean;

  public metadata?: object;
  public expiresAt!: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public wallet?: MultiSigWallet;
}

MultiSigTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    multiSigWalletId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    transactionXDR: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    signedTransactionXDR: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(
        "fund_management",
        "governance",
        "revenue_distribution",
        "emergency",
        "recovery",
      ),
      allowNull: false,
    },
    requiredSignatures: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 255,
      },
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "approved",
        "rejected",
        "executed",
        "failed",
        "expired",
      ),
      defaultValue: "pending",
    },
    proposedBy: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    executedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    executedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    executionTxHash: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [64, 64],
      },
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    signatures: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    // Trovotech-specific columns
    trovoTransactionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "trovo_transaction_id",
      comment: "Trovotech transaction ID",
    },
    trovoStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "trovo_status",
      comment: "Trovotech transaction status",
    },
    processedViaTrovotech: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      field: "processed_via_trovotech",
      comment: "Whether transaction was processed through Trovotech",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "MultiSigTransaction",
    tableName: "multisig_transactions",
    indexes: [
      { fields: ["multiSigWalletId"] },
      { fields: ["status"] },
      { fields: ["category"] },
      { fields: ["proposedBy"] },
      { fields: ["expiresAt"] },
      { fields: ["multiSigWalletId", "status"] },
      // Trovotech indexes
      { fields: ["trovo_transaction_id"] },
      { fields: ["processed_via_trovotech"] },
      { fields: ["trovo_status"] },
    ],
  },
);

export default MultiSigTransaction;
