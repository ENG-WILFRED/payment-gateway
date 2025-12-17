import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SequelizeOptions } from 'sequelize-typescript';
import * as fs from 'fs';
import * as path from 'path';

function readPackagePrefix(): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    if (pkg && pkg.name) return pkg.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  } catch (e) {}
  return undefined;
}

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      useFactory: async () => {
        const prefix = readPackagePrefix();
        const databaseUrl = process.env[`${prefix}_DATABASE_URL`] || process.env.DATABASE_URL || process.env.DB_URL;
        const schema = process.env[`${prefix}_DB_SCHEMA`] || process.env.DB_SCHEMA || process.env.DB_SCHEMA_NAME || 'public';

        const options: SequelizeOptions = {
          dialect: 'postgres',
          url: databaseUrl,
          models: [],
          define: {
            schema,
          },
          logging: false,
        } as any;

        return options;
      },
    }),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
