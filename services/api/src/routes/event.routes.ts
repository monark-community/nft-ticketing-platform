import { Router } from "express";
import multer from "multer";
import {
  getEvent,
  getEvents,
  getEventTickets,
  getMyEvents,
  postEvent,
  postFreezeEvent,
  postPublishEvent,
  putEvent,
} from "../controllers/event.controller";
import {
  deleteScanner,
  deleteWhitelist,
  getScanners,
  getWhitelist,
  postScanner,
  postWhitelist,
} from "../controllers/operations.controller";
import {
  getTicketTypes,
  postTicketType,
} from "../controllers/ticketType.controller";
import { authenticate } from "../middlewares/authenticate";
import { optionalAuthenticate } from "../middlewares/optionalAuthenticate";
import { publicRateLimiter } from "../middlewares/rateLimiter";
import { requireEmail } from "../middlewares/requireEmail";
import { requireRole } from "../middlewares/requireRole";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: PNG, JPG, WebP"));
    }
  },
});

// Public
router.get("/", publicRateLimiter, getEvents);

// Organizer — own events, before /:id so "mine" isn't read as an event ID
router.get(
  "/mine",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  getMyEvents,
);

// Public for published events; a draft or frozen event only for its organizer or an admin
router.get("/:id", publicRateLimiter, optionalAuthenticate, getEvent);

// Organizer — event lifecycle
router.post(
  "/",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  postEvent,
);
router.put(
  "/:id",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  putEvent,
);
router.post(
  "/:id/freeze",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  upload.single("image"),
  postFreezeEvent,
);
router.post(
  "/:id/publish",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  postPublishEvent,
);

// Organizer — the event's tickets, owners and check-in state (#190)
router.get(
  "/:id/tickets",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  getEventTickets,
);

// Public — ticket types (same rule as the event: unpublished only for its organizer or an admin)
router.get(
  "/:id/ticket-types",
  publicRateLimiter,
  optionalAuthenticate,
  getTicketTypes,
);

// Organizer — ticket types
router.post(
  "/:id/ticket-types",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  postTicketType,
);

// Organizer — scanners
router.get(
  "/:id/scanners",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  getScanners,
);
router.post(
  "/:id/scanners",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  postScanner,
);
router.delete(
  "/:id/scanners/:wallet",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  deleteScanner,
);

// Organizer — whitelist
router.get(
  "/:id/whitelist",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  getWhitelist,
);
router.post(
  "/:id/whitelist",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  postWhitelist,
);
router.delete(
  "/:id/whitelist/:wallet",
  authenticate,
  requireRole("ORGANIZER"),
  requireEmail,
  deleteWhitelist,
);

export default router;
