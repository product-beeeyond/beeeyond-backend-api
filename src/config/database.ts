import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import logger from '../utils/logger';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USERNAME } from '.';

dotenv.config();

const sequelize = new Sequelize(
  DB_NAME!,
  DB_USERNAME!,
  DB_PASSWORD!,
  {
    host: DB_HOST,
    port: Number(DB_PORT),
    dialect: 'postgres',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

export { sequelize };
