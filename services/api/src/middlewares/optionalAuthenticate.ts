import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from './authenticate';

// For public routes that show more to a signed-in user: reads the session cookie when there is
// one and sets req.user, but never rejects. A missing, invalid or expired cookie just means the
// request is treated as signed out.
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    } catch {
      req.user = undefined;
    }
  }
  next();
}
