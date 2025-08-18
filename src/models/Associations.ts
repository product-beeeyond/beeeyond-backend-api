import User from './User';
import Property from './Property';
import MultiSigWallet from './MultiSigWallet';
import MultiSigSigner from './MultiSigSigner';
import MultiSigTransaction from './MultiSigTransaction';
import PropertyHolding from './PropertyHolding';

// User associations
User.hasMany(MultiSigWallet, { foreignKey: 'userId', as: 'multiSigWallets' });
User.hasMany(MultiSigSigner, { foreignKey: 'userId', as: 'signerRoles' });

// Property associations
Property.hasMany(MultiSigWallet, { foreignKey: 'propertyId', as: 'multiSigWallets' });

// MultiSigWallet associations
MultiSigWallet.belongsTo(User, { foreignKey: 'userId', as: 'user' });
MultiSigWallet.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });
MultiSigWallet.hasMany(MultiSigSigner, { foreignKey: 'multiSigWalletId', as: 'signers' });
MultiSigWallet.hasMany(MultiSigTransaction, { foreignKey: 'multiSigWalletId', as: 'transactions' });

// MultiSigSigner associations
MultiSigSigner.belongsTo(MultiSigWallet, { foreignKey: 'multiSigWalletId', as: 'wallet' });
MultiSigSigner.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// MultiSigTransaction associations
MultiSigTransaction.belongsTo(MultiSigWallet, { foreignKey: 'multiSigWalletId', as: 'wallet' });

// Existing associations remain unchanged
User.hasMany(PropertyHolding, { foreignKey: 'userId', as: 'holdings' });

Property.hasMany(PropertyHolding, { foreignKey: 'propertyId', as: 'holdings' });

PropertyHolding.belongsTo(User, { foreignKey: 'userId', as: 'user' });
PropertyHolding.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });

