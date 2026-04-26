/**
 * Module augmentation so handlers can read `req.user.userId` without
 * casting. Populated by the `requireAuth` middleware on any route that
 * uses it. Optional in the base type because not every route is
 * authenticated; protected handlers can safely `req.user!`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; username: string };
    }
  }
}
export {};
