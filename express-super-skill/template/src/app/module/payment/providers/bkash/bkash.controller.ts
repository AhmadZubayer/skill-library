import { Request, Response } from "express";
import { catchAsync } from "../../../../utils/catchAsync";
import { bkashCallback } from "./bkash.callback";

const handleBkashCallback = catchAsync(async (req: Request, res: Response) => {
    const { redirectUrl } = await bkashCallback.handleCallback(req.query);

    res.redirect(redirectUrl);
});

export const bkashController = {
    handleBkashCallback
}
