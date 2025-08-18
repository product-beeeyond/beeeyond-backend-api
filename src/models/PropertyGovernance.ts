import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface PropertyGovernanceAttributes {
  id: string;
  propertyId: string;
  proposalType: 'property_sale' | 'major_renovation' | 'management_change' | 'rent_adjustment' | 'dividend_distribution';
  title: string;
  description: string;
  proposalData: object;
  proposerId: string;
  proposerTokenBalance: number;
  votingStartAt: Date;
  votingEndAt: Date;
  executionDelay: number; // hours
  status: 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'expired';
  totalTokensEligible: number;
  quorumRequired: number;
  passThreshold: number; // percentage
  votes?: Array<{
    voter: string;
    vote: 'for' | 'against' | 'abstain';
    weight: number;
    timestamp: string;
  }>;
  votesSummary?: {
    totalVotes: number;
    forVotes: number;
    againstVotes: number;
    abstainVotes: number;
    participationRate: number;
  };
  multiSigTransactionId?: string;
  executionTxHash?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

type PropertyGovernanceCreationAttributes = Optional<PropertyGovernanceAttributes, 'id' | 'createdAt' | 'updatedAt'>

class PropertyGovernance extends Model<PropertyGovernanceAttributes, PropertyGovernanceCreationAttributes> implements PropertyGovernanceAttributes {
  public id!: string;
  public propertyId!: string;
  public proposalType!: 'property_sale' | 'major_renovation' | 'management_change' | 'rent_adjustment' | 'dividend_distribution';
  public title!: string;
  public description!: string;
  public proposalData!: object;
  public proposerId!: string;
  public proposerTokenBalance!: number;
  public votingStartAt!: Date;
  public votingEndAt!: Date;
  public executionDelay!: number;
  public status!: 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'expired';
  public totalTokensEligible!: number;
  public quorumRequired!: number;
  public passThreshold!: number;
  public votes?: Array<{
    voter: string;
    vote: 'for' | 'against' | 'abstain';
    weight: number;
    timestamp: string;
  }>;
  public votesSummary?: {
    totalVotes: number;
    forVotes: number;
    againstVotes: number;
    abstainVotes: number;
    participationRate: number;
  };
  public multiSigTransactionId?: string;
  public executionTxHash?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PropertyGovernance.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
    },
    proposalType: {
      type: DataTypes.ENUM('property_sale', 'major_renovation', 'management_change', 'rent_adjustment', 'dividend_distribution'),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    proposalData: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    proposerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    proposerTokenBalance: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    votingStartAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    votingEndAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    executionDelay: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 24, // 24 hours default
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'passed', 'rejected', 'executed', 'expired'),
      defaultValue: 'draft',
    },
    totalTokensEligible: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quorumRequired: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 100,
      },
    },
    passThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 100,
      },
    },
    votes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    votesSummary: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    multiSigTransactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'multisig_transactions',
        key: 'id',
      },
    },
    executionTxHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'PropertyGovernance',
    tableName: 'property_governance',
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['proposalType'] },
      { fields: ['status'] },
      { fields: ['proposerId'] },
      { fields: ['votingStartAt'] },
      { fields: ['votingEndAt'] },
    ],
  }
);

export default PropertyGovernance;
