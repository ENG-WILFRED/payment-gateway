import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SequelizeOptions } from 'sequelize-typescript';
import * as fs from 'fs';
import * as path from 'path';

function readPackagePrefix(): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    if (pkg && pkg.name) return pkg.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  } catch (e) { }
  return undefined;
}

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      useFactory: async () => {
        const prefix = readPackagePrefix();
        const databaseUrl = process.env[`${prefix}_DATABASE_URL`] || process.env.DATABASE_URL || process.env.DB_URL;
        const schema = process.env[`${prefix}_DB_SCHEMA`] || process.env.DB_SCHEMA || process.env.DB_SCHEMA_NAME || 'public';

        // If a DATABASE_URL is provided, parse it and supply explicit connection options
        // to avoid issues where the driver mis-parses credentials.
        const models = [require('../../entities/payment.entity').Payment];

        if (databaseUrl) {
          try {
            const url = new URL(databaseUrl);
            const username = url.username ? decodeURIComponent(url.username) : undefined;
            const password = url.password ? decodeURIComponent(url.password) : undefined;
            // Debug: log types to diagnose non-string password issues in some environments
            // (kept as console.log since logger may not be initialized at this bootstrap stage)
            try {
              // eslint-disable-next-line no-console
              console.debug('[DatabaseModule] parsed DB url parts', { host: url.hostname, port: url.port, usernameType: typeof username, passwordType: typeof password });
            } catch (e) {}
            const host = url.hostname;
            const port = url.port ? Number(url.port) : undefined;
            const database = url.pathname && url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

            const options: SequelizeOptions = {
              dialect: 'postgres',
              host,
              port,
              // coerce to string when present to avoid driver errors
              username: username != null ? String(username) : undefined,
              password: password != null ? String(password) : undefined,
              database,
              models,
              define: { schema },
              logging: false,
              dialectOptions: {},
            } as any;

            if (process.env.NODE_ENV === 'production') {
              // allow self-signed certificates in production behind some proxies
              (options as any).dialectOptions = { ssl: { rejectUnauthorized: false } };
            }

            return options;
          } catch (e) {
            // fall back to providing the raw URL if parsing fails
          }
        }

        // Fallback: supply minimal options (Sequelize can accept a URL string too)
        const fallback: SequelizeOptions = {
          dialect: 'postgres',
          url: databaseUrl,
          models,
          define: { schema },
          logging: false,
        } as any;

        if (process.env.NODE_ENV === 'production') {
          (fallback as any).dialectOptions = { ssl: { rejectUnauthorized: false } };
        }

        return fallback;
      },
    }),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule { }
