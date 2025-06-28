import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface PropertyHoldingAttributes {
  id: string;
  userId: string;
  propertyId: string;
  tokensOwned: number;
  totalInvested: number;
  currentValue: number;
  averagePrice: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PropertyHoldingCreationAttributes extends Optional<PropertyHoldingAttributes, 'id' | 'createdAt' | 'updatedAt'> { }

class PropertyHolding extends Model<PropertyHoldingAttributes, PropertyHoldingCreationAttributes> implements PropertyHoldingAttributes {
  public id!: string;
  public userId!: string;
  public propertyId!: string;
  public tokensOwned!: number;
  public totalInvested!: number;
  public currentValue!: number;
  public averagePrice!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PropertyHolding.init(
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
    tokensOwned: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    totalInvested: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    currentValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    averagePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
  },
  {
    sequelize,
    modelName: 'PropertyHolding',
    tableName: 'property_holdings',
    indexes: [
      { fields: ['userId'] },
      { fields: ['propertyId'] },
      { fields: ['userId', 'propertyId'], unique: true },
    ],
  }
);

export default PropertyHolding;
