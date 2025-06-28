import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface PropertyAttributes {
  id: string;
  title: string;
  description?: string;
  location: string;
  propertyType: string;
  totalTokens: number;
  availableTokens: number;
  tokenPrice: number;
  totalValue: number;
  expectedAnnualReturn?: number;
  minimumInvestment: number;
  images: string[];
  amenities: string[];
  documents?: object;
  locationDetails?: object;
  rentalIncomeMonthly?: number;
  propertyManager?: string;
  status: string;
  stellarAssetCode?: string;
  stellarAssetIssuer?: string;
  featured: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PropertyCreationAttributes extends Optional<PropertyAttributes, 'id' | 'createdAt' | 'updatedAt'> { }

class Property extends Model<PropertyAttributes, PropertyCreationAttributes> implements PropertyAttributes {
  public id!: string;
  public title!: string;
  public description?: string;
  public location!: string;
  public propertyType!: string;
  public totalTokens!: number;
  public availableTokens!: number;
  public tokenPrice!: number;
  public totalValue!: number;
  public expectedAnnualReturn?: number;
  public minimumInvestment!: number;
  public images!: string[];
  public amenities!: string[];
  public documents?: object;
  public locationDetails?: object;
  public rentalIncomeMonthly?: number;
  public propertyManager?: string;
  public status!: string;
  public stellarAssetCode?: string;
  public stellarAssetIssuer?: string;
  public featured!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Property.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    propertyType: {
      type: DataTypes.ENUM('residential', 'commercial', 'mixed_use', 'industrial'),
      defaultValue: 'residential',
    },
    totalTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    availableTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    tokenPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    totalValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    expectedAnnualReturn: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    minimumInvestment: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 10000,
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    amenities: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    documents: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    locationDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    rentalIncomeMonthly: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    propertyManager: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'coming_soon', 'sold_out', 'maintenance', 'inactive'),
      defaultValue: 'active',
    },
    stellarAssetCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stellarAssetIssuer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'Property',
    tableName: 'properties',
    indexes: [
      { fields: ['location'] },
      { fields: ['propertyType'] },
      { fields: ['status'] },
      { fields: ['featured'] },
      { fields: ['tokenPrice'] },
    ],
    validate: {
      availableTokensValid() {
        if (this.availableTokens > this.totalTokens) {
          throw new Error('Available tokens cannot exceed total tokens');
        }
      },
    },
  }
);

export default Property;
