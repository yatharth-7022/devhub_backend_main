import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip, body, query, params } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Log incoming request with details
    const requestLog = {
      method,
      url: originalUrl,
      ip,
      userAgent,
      query: Object.keys(query).length > 0 ? query : undefined,
      params: Object.keys(params).length > 0 ? params : undefined,
      body: this.sanitizeBody(body),
    };

    this.logger.log(
      `📥 Incoming Request: ${method} ${originalUrl}\n${JSON.stringify(requestLog, null, 2)}`,
    );

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length') || 0;
      const responseTime = Date.now() - startTime;

      const responseLog = {
        method,
        url: originalUrl,
        statusCode,
        contentLength: `${contentLength} bytes`,
        responseTime: `${responseTime}ms`,
      };

      const logMessage = `📤 Response: ${method} ${originalUrl}\n${JSON.stringify(responseLog, null, 2)}`;

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }

  private sanitizeBody(body: any): any {
    if (!body || Object.keys(body).length === 0) {
      return undefined;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'authorization'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
