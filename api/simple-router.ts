import { Express, Response, json } from "express";
import { hexToSignature, isAddress, isHex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { Storage } from "../types/storage.js";
import { replacer, reviver } from "../utils/json.js";
import { XnodeUnitEntitlementClaimerContract } from "../contracts/XnodeUnitEntitlementClaimer.js";
import axios from "axios";

function malformedRequest(res: Response, error: string): void {
  res.statusCode = 400;
  res.end(error);
}

export function registerRoutes(app: Express, storage: Storage) {
  const basePath = "/xue-signer/";
  app.use(json());

  // Try to get a signature from the server
  app.post(basePath + "getSig", async function (req, res) {
    const data = JSON.parse(JSON.stringify(req.body), reviver);

    const code = data.code;
    if (typeof code !== "string") {
      return malformedRequest(res, "code is not a string");
    }

    const receiver = data.receiver;
    if (typeof receiver !== "string") {
      return malformedRequest(res, "receiver is not a string");
    }
    if (!isAddress(receiver)) {
      return malformedRequest(res, "receiver is not a valid address");
    }

    const recaptcha = data.recaptcha;
    if (typeof recaptcha !== "string") {
      return malformedRequest(res, "recaptcha is not a string");
    }

    const captchaVerification = await axios({
      method: "post",
      url: "https://www.google.com/recaptcha/api/siteverify",
      params: {
        secret: process.env.RECAPTCHA_SECRET,
        response: recaptcha,
      },
    });
    if (!captchaVerification.data?.success) {
      return malformedRequest(res, "recaptcha does not pass verification");
    }

    const codes = await storage.codes.get();
    const codeInfo = codes[code];
    if (!codeInfo) {
      res.statusCode = 404;
      return res.end("Invalid code.");
    }

    if (codeInfo.expiry < new Date()) {
      res.statusCode = 410;
      return res.end("Code has expired.");
    }

    const claimBefore = Math.round(new Date().getTime() / 1000) + 30 * 24 * 60 * 60; // 1 month from now

    const privateKey = process.env.SIGNER_PRIV_KEY;
    if (!privateKey || !isHex(privateKey)) {
      throw new Error("Signer private key invalid");
    }
    const account = privateKeyToAccount(privateKey);
    const domain = {
      name: "Xnode Unit Entitlement Claimer",
      version: "1",
      chainId: mainnet.id,
      verifyingContract: XnodeUnitEntitlementClaimerContract.address,
    } as const;
    const types = {
      Claim: [
        { name: "receiver", type: "address" },
        { name: "codeHash", type: "bytes32" },
        { name: "claimBefore", type: "uint32" },
      ],
    } as const;
    const message = {
      receiver: receiver,
      codeHash: keccak256(toBytes(code)),
      claimBefore: claimBefore,
    } as const;
    const signature = await account.signTypedData({
      domain: domain,
      types: types,
      primaryType: "Claim",
      message: message,
    });

    res.end(
      JSON.stringify(
        {
          message: message,
          signature: hexToSignature(signature),
        },
        replacer
      )
    );
  });
}
