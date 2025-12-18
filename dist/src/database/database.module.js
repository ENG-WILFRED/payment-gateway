"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const sequelize_1 = require("@nestjs/sequelize");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function readPackagePrefix() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
        if (pkg && pkg.name)
            return pkg.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    }
    catch (e) { }
    return undefined;
}
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            sequelize_1.SequelizeModule.forRootAsync({
                useFactory: async () => {
                    const prefix = readPackagePrefix();
                    const databaseUrl = process.env[`${prefix}_DATABASE_URL`] || process.env.DATABASE_URL || process.env.DB_URL;
                    const schema = process.env[`${prefix}_DB_SCHEMA`] || process.env.DB_SCHEMA || process.env.DB_SCHEMA_NAME || 'public';
                    const models = [require('../../entities/payment.entity').Payment];
                    if (databaseUrl) {
                        try {
                            const url = new URL(databaseUrl);
                            const username = url.username ? decodeURIComponent(url.username) : undefined;
                            const password = url.password ? decodeURIComponent(url.password) : undefined;
                            try {
                                console.debug('[DatabaseModule] parsed DB url parts', { host: url.hostname, port: url.port, usernameType: typeof username, passwordType: typeof password });
                            }
                            catch (e) { }
                            const host = url.hostname;
                            const port = url.port ? Number(url.port) : undefined;
                            const database = url.pathname && url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
                            const options = {
                                dialect: 'postgres',
                                host,
                                port,
                                username: username != null ? String(username) : undefined,
                                password: password != null ? String(password) : undefined,
                                database,
                                models,
                                define: { schema },
                                logging: false,
                                dialectOptions: {},
                            };
                            if (process.env.NODE_ENV === 'production') {
                                options.dialectOptions = { ssl: { rejectUnauthorized: false } };
                            }
                            return options;
                        }
                        catch (e) {
                        }
                    }
                    const fallback = {
                        dialect: 'postgres',
                        url: databaseUrl,
                        models,
                        define: { schema },
                        logging: false,
                    };
                    if (process.env.NODE_ENV === 'production') {
                        fallback.dialectOptions = { ssl: { rejectUnauthorized: false } };
                    }
                    return fallback;
                },
            }),
        ],
        exports: [sequelize_1.SequelizeModule],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map