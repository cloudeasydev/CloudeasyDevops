import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";
import type { Permission } from "../lib/rbac.js";
import { hasPermission } from "../lib/rbac.js";
import { resolveSession, type AuthUser } from "../lib/session.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionRow?: { id: string; tokenHash: string };
    }
  }
}

export async function authRequired(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token) throw new UnauthorizedError();

    const session = await resolveSession(token);
    if (!session) throw new UnauthorizedError("Session expired");

    req.sessionRow = { id: session.sessionId, tokenHash: session.tokenHash };
    req.user = session.user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    const ok = perms.every((p) => hasPermission(req.user!.roleKey, p, req.user!.permissions, req.user!.email));
    if (!ok) return next(new ForbiddenError());
    next();
  };
}
