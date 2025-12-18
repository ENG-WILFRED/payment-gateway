import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const start = Date.now();

    // Capture request body and query for debugging
    const safeBody = req.body;
    const query = req.query;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      // Log basic request info and small payloads
      this.logger.debug({ method, originalUrl, status, duration, query, body: safeBody });
    });

    next();
  }
}
