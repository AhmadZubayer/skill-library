import { Router } from "express";
import { bkashController } from "./bkash.controller";

export const bkashRoutes = Router();

bkashRoutes.get("/callback", bkashController.handleBkashCallback);
