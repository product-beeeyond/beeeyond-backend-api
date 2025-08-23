import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface RecoveryAuditLogAttributes {
  id: string;
  recoveryRequestId: string;
  actionType: 'created' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired' | 'retry_attempted';
  performedBy: string;
  performedAt: Date;
  details: object;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}

type RecoveryAuditLogCreationAttributes = Optional<RecoveryAuditLogAttributes, 'id' | 'createdAt'>;

class RecoveryAuditLog extends Model<RecoveryAuditLogAttributes, RecoveryAuditLogCreationAttributes> 
  implements RecoveryAuditLogAttributes {
  
  public id!: string;
  public recoveryRequestId!: string;
  public actionType!: 'created' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired' | 'retry_attempted';
  public performedBy!: string;
  public performedAt!: Date;
  public details!: object;
  public ipAddress?: string;
  public userAgent?: string;
  
  public readonly createdAt!: Date;
}

RecoveryAuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    recoveryRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'recovery_requests',
        key: 'id',
      },
    },
    actionType: {
      type: DataTypes.ENUM('created', 'approved', 'rejected', 'executed', 'failed', 'expired', 'retry_attempted'),
      allowNull: false,
    },
    performedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    performedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    ipAddress: {
      type: DataTypes.INET,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'RecoveryAuditLog',
    tableName: 'recovery_audit_logs',
    updatedAt: false, // Audit logs should be immutable
    indexes: [
      { fields: ['recoveryRequestId'] },
      { fields: ['performedBy'] },
      { fields: ['actionType'] },
      { fields: ['performedAt'] },
    ],
  }
);

export default RecoveryAuditLog;