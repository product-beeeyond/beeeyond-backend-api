import User from './User';
import Property from './Property';
import MultiSigWallet from './MultiSigWallet';
import MultiSigSigner from './MultiSigSigner';
import MultiSigTransaction from './MultiSigTransaction';
import PropertyHolding from './PropertyHolding';
import RecoveryRequest from './RecoveryRequest';
import RecoveryAuditLog from './RecoveryAuditLog';
import EncryptedSecret from './EncryptedSecret';
import PropertyGovernance from './PropertyGovernance';

// User associations
User.hasMany(MultiSigWallet, { 
  foreignKey: 'userId', 
  as: 'multiSigWallets',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

User.hasMany(MultiSigSigner, { 
  foreignKey: 'userId', 
  as: 'signerRoles',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

User.hasMany(PropertyHolding, { 
  foreignKey: 'userId', 
  as: 'holdings',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

User.hasMany(RecoveryRequest, { 
  foreignKey: 'userId', 
  as: 'recoveryRequests',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

User.hasMany(RecoveryRequest, { 
  foreignKey: 'requestedBy', 
  as: 'initiatedRecoveries',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

User.hasMany(PropertyGovernance, { 
  foreignKey: 'proposerId', 
  as: 'proposals',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Property associations
Property.hasMany(MultiSigWallet, { 
  foreignKey: 'propertyId', 
  as: 'multiSigWallets',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

Property.hasMany(PropertyHolding, { 
  foreignKey: 'propertyId', 
  as: 'holdings',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

Property.hasMany(PropertyGovernance, { 
  foreignKey: 'propertyId', 
  as: 'governanceProposals',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// MultiSigWallet associations
MultiSigWallet.belongsTo(User, { 
  foreignKey: 'userId', 
  as: 'user',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigWallet.belongsTo(Property, { 
  foreignKey: 'propertyId', 
  as: 'property',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigWallet.hasMany(MultiSigSigner, { 
  foreignKey: 'multiSigWalletId', 
  as: 'signers',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigWallet.hasMany(MultiSigTransaction, { 
  foreignKey: 'multiSigWalletId', 
  as: 'transactions',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigWallet.hasMany(EncryptedSecret, { 
  foreignKey: 'walletId', 
  as: 'encryptedSecrets',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigWallet.hasMany(RecoveryRequest, { 
  foreignKey: 'walletId', 
  as: 'recoveryRequests',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// MultiSigSigner associations
MultiSigSigner.belongsTo(MultiSigWallet, { 
  foreignKey: 'multiSigWalletId', 
  as: 'wallet',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigSigner.belongsTo(User, { 
  foreignKey: 'userId', 
  as: 'user',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// MultiSigTransaction associations
MultiSigTransaction.belongsTo(MultiSigWallet, { 
  foreignKey: 'multiSigWalletId', 
  as: 'wallet',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

MultiSigTransaction.hasMany(PropertyGovernance, { 
  foreignKey: 'multiSigTransactionId', 
  as: 'governanceProposals',
  constraints: true,
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});

// EncryptedSecret associations
EncryptedSecret.belongsTo(MultiSigWallet, { 
  foreignKey: 'walletId', 
  as: 'wallet',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// PropertyHolding associations
PropertyHolding.belongsTo(User, { 
  foreignKey: 'userId', 
  as: 'user',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

PropertyHolding.belongsTo(Property, { 
  foreignKey: 'propertyId', 
  as: 'property',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// PropertyGovernance associations
PropertyGovernance.belongsTo(Property, { 
  foreignKey: 'propertyId', 
  as: 'property',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

PropertyGovernance.belongsTo(User, { 
  foreignKey: 'proposerId', 
  as: 'proposer',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

PropertyGovernance.belongsTo(MultiSigTransaction, { 
  foreignKey: 'multiSigTransactionId', 
  as: 'transaction',
  constraints: true,
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});

// RecoveryRequest associations
RecoveryRequest.belongsTo(User, { 
  foreignKey: 'userId', 
  as: 'user',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

RecoveryRequest.belongsTo(User, { 
  foreignKey: 'requestedBy', 
  as: 'requestor',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

RecoveryRequest.belongsTo(MultiSigWallet, { 
  foreignKey: 'walletId', 
  as: 'wallet',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Recovery Audit Log associations
RecoveryRequest.hasMany(RecoveryAuditLog, { 
  foreignKey: 'recoveryRequestId', 
  as: 'auditLogs',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

RecoveryAuditLog.belongsTo(RecoveryRequest, { 
  foreignKey: 'recoveryRequestId', 
  as: 'recoveryRequest',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

RecoveryAuditLog.belongsTo(User, { 
  foreignKey: 'performedBy', 
  as: 'performer',
  constraints: true,
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

export default {
  User,
  Property,
  MultiSigWallet,
  MultiSigSigner,
  MultiSigTransaction,
  PropertyHolding,
  PropertyGovernance,
  RecoveryRequest,
  RecoveryAuditLog,
  EncryptedSecret
};